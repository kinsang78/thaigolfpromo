import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

// ====================================================================
// Cloudflare Pages Functions 진입점
// 카카오 i 오픈빌더 webhook (POST 전용)
//
// v6 변경 포인트 (2026-04-25):
// - 인도네시아/IDR 분기 완전 제거 → 태국 전용
// - correctWithMaster: 영문 정규화 매칭 추가 (중복 행 재발 방지)
// - 매칭 실패 시 master 신규 INSERT 금지 → 수동 보정 흐름
// - contact_phone → golf_courses.phone 자동 sync (master에 phone NULL일 때)
// - 응답에 "매칭 실패" 케이스 명시
// ====================================================================
export async function onRequestPost(context) {
  const { request, env } = context;

  const anthropic = new Anthropic({ apiKey: env.CLAUDE_API_KEY });
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse(kakaoResponse("요청 본문을 읽지 못했습니다."));
  }

  const utterance = body?.userRequest?.utterance || null;
  const userId = body?.userRequest?.user?.id || null;

  if (!utterance) return jsonResponse(kakaoResponse("메시지를 입력받지 못했습니다."));

  if (!isLikelyPromotion(utterance)) {
    return jsonResponse(kakaoResponse(
      "골프장 프로모션 정보를 보내주세요!\n\n" +
      "예시:\n" +
      "알파인 주중 2500바트 그린피+캐디+카트 포함 5/1~5/31\n" +
      "예약: 02-1234-5678"
    ));
  }

  if (!env.CLAUDE_API_KEY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return jsonResponse(kakaoResponse("서버 설정 오류입니다."));
  }

  try {
    const COURSE_MASTER = await loadCourseMaster(supabase);
    const masterListText = buildMasterListText(COURSE_MASTER);

    const today = new Date().toISOString().split("T")[0];
    const SYSTEM_PROMPT = buildSystemPrompt(today, masterListText);

    console.log("=== 파싱 시작 ===", utterance.substring(0, 80));

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: utterance }],
    });

    const responseText = message.content[0].text;
    console.log("Claude 응답:", responseText.substring(0, 300));

    let promotions = [];
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      const jsonString = jsonMatch ? jsonMatch[0] : responseText;
      const parsed = JSON.parse(jsonString);
      promotions = Array.isArray(parsed) ? parsed : [parsed];
    } catch (parseErr) {
      console.error("JSON 파싱 에러:", parseErr.message);
      return jsonResponse(kakaoResponse("프로모션 정보를 해석하지 못했습니다."));
    }

    if (promotions.length === 0) {
      return jsonResponse(kakaoResponse(
        "프로모션 정보가 감지되지 않았습니다.\n\n" +
        "골프장명과 가격이 포함된 메시지를 보내주세요.\n" +
        "예: 알파인 주중 2500바트 캐디카트포함 5/1~5/31"
      ));
    }

    // 마스터 매칭 (강화된 알고리즘)
    promotions = promotions.map(p => correctWithMaster(p, COURSE_MASTER));

    const results = { saved: [], updated: [], skipped: [], unmatched: [] };
    for (const promo of promotions) {
      const saveResult = await saveWithDedup(supabase, promo, utterance, userId);
      results[saveResult.action].push(promo);

      // master에 phone 자동 sync (매칭됐고 phone 있고 master에 없을 때만)
      if (promo.golf_course_id && promo.contact_phone) {
        await syncPhoneToMaster(supabase, promo).catch(e =>
          console.error("phone sync 실패:", e.message)
        );
      }
    }

    // 만료 정리는 백그라운드
    context.waitUntil(
      cleanupExpired(supabase).catch(e => console.error("만료 정리 실패:", e.message))
    );

    // 응답 메시지 빌드
    const lines = [];
    if (results.saved.length > 0) {
      lines.push("✅ 새로 등록 " + results.saved.length + "건");
      lines.push(results.saved.map(formatSummary).join("\n\n---\n\n"));
    }
    if (results.updated.length > 0) {
      lines.push("");
      lines.push("🔄 업데이트 " + results.updated.length + "건");
      results.updated.forEach(u => lines.push("- " + u.golf_course));
    }
    if (results.skipped.length > 0) {
      lines.push("");
      lines.push("⏭ 중복 건너뜀 " + results.skipped.length + "건");
      results.skipped.forEach(s => lines.push("- " + s.golf_course));
    }
    if (results.unmatched.length > 0) {
      lines.push("");
      lines.push("⚠️ 마스터 매칭 실패 " + results.unmatched.length + "건 (운영자 수동 보정 대기)");
      results.unmatched.forEach(u => {
        lines.push("- " + (u.golf_course || "?") + (u.golf_course_en ? " / " + u.golf_course_en : ""));
      });
      lines.push("→ 골프장 DB에 없거나 명칭이 너무 달라서 매칭 못 함");
    }
    if (lines.length === 0) return jsonResponse(kakaoResponse("저장할 프로모션을 찾지 못했습니다."));
    return jsonResponse(kakaoResponse(lines.join("\n")));

  } catch (err) {
    console.error("에러:", err.message, err.status || "");
    let userMessage = "처리 중 오류가 발생했습니다.";
    if (err.message?.includes("401")) userMessage = "API 인증 오류입니다.";
    else if (err.message?.includes("429")) userMessage = "요청이 너무 많습니다.";
    else if (err.message?.includes("404")) userMessage = "AI 모델 설정 오류입니다.";
    return jsonResponse(kakaoResponse(userMessage));
  }
}

export async function onRequest(context) {
  return new Response("Method not allowed", { status: 405 });
}

// ====================================================================
// 응답 유틸
// ====================================================================
function jsonResponse(obj) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function kakaoResponse(text) {
  return { version: "2.0", template: { outputs: [{ simpleText: { text: text } }] } };
}

// ====================================================================
// 시스템 프롬프트 (태국 전용)
// ====================================================================
function buildSystemPrompt(today, masterListText) {
  return [
    "오늘 날짜: " + today,
    "당신은 태국 골프장 프로모션 메시지 파싱 전문가입니다.",
    "사용자가 보내는 메시지에서 아래 정보를 JSON 배열로 추출하세요.",
    "",
    "각 프로모션마다 다음 형식을 지키세요:",
    "{",
    '  "golf_course": "골프장명 (한글)",',
    '  "golf_course_en": "골프장명 (영문)",',
    '  "country": "태국",',
    '  "region": "세부 지역명 (방콕/파타야/후아힌/카오야이/푸켓/치앙마이 등)",',
    '  "start_date": "YYYY-MM-DD 또는 null",',
    '  "end_date": "YYYY-MM-DD 또는 null",',
    '  "price_type": "green_fee_only | all_inclusive | package",',
    '  "green_fee": { "weekday": 2000, "weekend": 3000 },',
    '  "currency": "THB 또는 KRW",',
    '  "includes_caddy": true/false,',
    '  "includes_cart": true/false,',
    '  "includes_hotel": true/false,',
    '  "includes_meal": true/false,',
    '  "caddy_fee": null,',
    '  "cart_fee": null,',
    '  "conditions": "특이사항 요약",',
    '  "contact_phone": "번호 또는 null"',
    "}",
    "",
    "=== 골프장 마스터 데이터 (태국 전용) ===",
    "아래 목록의 골프장은 **반드시 이 데이터의 표준 한글명/영문명/지역**을 사용하세요.",
    "목록에 있는 골프장이면 절대로 다른 한글명·영문명·지역명을 만들어내지 마세요.",
    "목록에 없으면 영문명을 모를 경우 null로 두세요. 추측해서 영문명을 만들지 마세요.",
    "",
    masterListText,
    "",
    "=== 가격 분류 규칙 (price_type) ===",
    '1. "all_inclusive": "그린피, 캐디, 카트 포함" 또는 "올인클루시브/올인" 명시',
    '2. "green_fee_only": 그린피만 표기, 캐디/카트 별도/불포함/추가, 또는 포함사항 미언급 (기본값)',
    '3. "package": 숙박+식사 포함 패키지',
    '4. 확실하지 않으면 "green_fee_only"로 설정하고 conditions에 "포함사항 미확인" 추가',
    "",
    "=== 기타 규칙 ===",
    "1. 반드시 JSON 배열만 출력. 설명·주석·코드블록 마크다운 금지.",
    "2. 만원/원 = KRW, 바트 = THB",
    "3. 여러 골프장이면 배열로 모두 추출",
    '4. region은 구체적 지역명만. "태국 방콕" 금지. "방콕"으로.',
    "5. 연도 없이 월만 있으면 가장 가까운 해당 월로 추정",
    "6. 그룹 가격 처리: \"4인그룹 13000바트\" 같이 N인 기준 총액인 경우,",
    '   green_fee에는 1인당 가격을, conditions에 "N인그룹 기준 (총 XX바트)" 명시.',
    '   예: 4인그룹 13000바트 → green_fee: {"default": 3250}, conditions: "4인그룹 기준 (총 13,000바트)"',
    "7. 부가 혜택(기념품, 모자, 우산, 음료 등)은 conditions에 요약.",
    "8. 샷건/티오프 시간이 명시되면 conditions에 포함. 예: \"샷건 12시\"",
    "9. 하루짜리 이벤트는 start_date == end_date.",
    '10. 대회/토너먼트 감지: 샷건/토너먼트/대회/상금/시상/마라톤/참가비 단어가 있으면 conditions 맨 앞에 "[대회]" 태그.',
    "11. 시간대별 가격: weekday_morning, weekday_afternoon, weekend_morning, weekend_afternoon.",
    "    오전/오후 동일하면 weekday/weekend로 통합.",
    '12. **전화번호 추출 강화**: "전화/예약/문의/연락처/Tel" 다음에 오는 숫자 패턴은 contact_phone에 반드시 넣으세요.',
    '    예시: "전화: 02-549-1555" → contact_phone: "02-549-1555"',
    '    국제번호 형식(+66, 0066)도 인식하세요.',
    "13. 프로모션이 아닌 일반 대화는 빈 배열 [] 반환. 단, 가격(숫자+바트/원)이 있으면 반드시 프로모션 처리.",
  ].join("\n");
}

// ====================================================================
// 골프장 마스터 로딩 (태국 전용)
// 두 개의 인덱스를 만들어 매칭 효율 극대화:
//   byKo:    한글명 → master
//   byEnKey: 영문 정규화 키 → master (NEW)
// ====================================================================
async function loadCourseMaster(supabase) {
  const { data, error } = await supabase
    .from("golf_courses")
    .select("id, name_ko, name_en, country, region, latitude, longitude, phone, golfdigg_slug")
    .eq("country", "태국");

  if (error) {
    console.error("마스터 로딩 에러:", error.message);
    return { byKo: {}, byEnKey: {}, raw: [] };
  }

  const byKo = {};
  const byEnKey = {};

  data.forEach(c => {
    const m = {
      id: c.id, ko: c.name_ko, en: c.name_en,
      country: c.country, region: c.region,
      lat: c.latitude, lng: c.longitude,
      phone: c.phone, slug: c.golfdigg_slug,
    };
    if (c.name_ko) byKo[c.name_ko] = m;
    if (c.name_en) {
      const enKey = normalizeNameKey(c.name_en);
      if (enKey) byEnKey[enKey] = m;
    }
  });

  console.log(`마스터 로딩: byKo ${Object.keys(byKo).length}개, byEnKey ${Object.keys(byEnKey).length}개`);
  return { byKo, byEnKey, raw: data };
}

function buildMasterListText(COURSE_MASTER) {
  // 한글 있는 골프장 우선 (한글-영문 매핑 명시)
  const lines = [];
  const seen = new Set();
  for (const [ko, m] of Object.entries(COURSE_MASTER.byKo)) {
    lines.push(`${ko} = ${m.en || "?"} | ${m.region || "?"}`);
    if (m.en) seen.add(normalizeNameKey(m.en));
  }
  // 한글 없는 골프장 (영문명만 안내 — 챗봇이 한글명 만들어내지 않게)
  for (const [enKey, m] of Object.entries(COURSE_MASTER.byEnKey)) {
    if (seen.has(enKey)) continue;
    lines.push(`(한글미정) = ${m.en} | ${m.region || "?"}`);
  }
  return lines.join("\n");
}

// ====================================================================
// 파싱 보조
// ====================================================================
function isLikelyPromotion(text) {
  if (!text || text.trim().length < 10) return false;
  const keywords = [
    "골프", "그린피", "바트", "캐디", "카트", "프로모션", "할인",
    "올인", "라운드", "부킹", "예약", "티오프", "샷건",
    "CC", "GC", "골프장", "컨트리클럽",
    "THB", "주중", "주말", "오전", "오후",
    "포함", "별도", "불포함",
    "대회", "토너먼트", "참가비",
    "전화", "연락처", "문의", "Tel", "tel"
  ];
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    if (lower.indexOf(kw.toLowerCase()) !== -1) return true;
  }
  if (/\d{3,}/.test(text)) return true;
  return false;
}

// ====================================================================
// 마스터 매칭 (강화 알고리즘)
//   1) 한글 정확 일치
//   2) 영문 정규화 정확 일치 ← NEW
//   3) 한글 부분 문자열 (3자 이상)
//   4) 영문 정규화 부분 문자열 (5자 이상)
//   5) 실패 → master에 새 행 INSERT 안 함, _unmatched 플래그
// ====================================================================
function correctWithMaster(promo, COURSE_MASTER) {
  const koName = promo.golf_course;
  const enName = promo.golf_course_en;

  // 1) 한글 정확 일치
  if (koName && COURSE_MASTER.byKo[koName]) {
    return applyMaster(promo, COURSE_MASTER.byKo[koName]);
  }

  // 2) 영문 정규화 정확 일치
  if (enName) {
    const enKey = normalizeNameKey(enName);
    if (enKey && COURSE_MASTER.byEnKey[enKey]) {
      return applyMaster(promo, COURSE_MASTER.byEnKey[enKey]);
    }
  }

  // 3) 한글 부분 문자열 (양방향, 3자 이상)
  if (koName) {
    let bestKey = null, bestLen = 0;
    for (const key of Object.keys(COURSE_MASTER.byKo)) {
      if (key.length < 3) continue;
      if (koName.includes(key) || key.includes(koName)) {
        const matchLen = Math.min(koName.length, key.length);
        if (matchLen > bestLen) { bestLen = matchLen; bestKey = key; }
      }
    }
    if (bestKey && bestLen >= 3) {
      promo.golf_course = bestKey;  // 표준 한글명으로 교체
      return applyMaster(promo, COURSE_MASTER.byKo[bestKey]);
    }
  }

  // 4) 영문 정규화 부분 문자열 (양방향, 5자 이상)
  if (enName) {
    const enKey = normalizeNameKey(enName);
    if (enKey && enKey.length >= 5) {
      let bestKey = null, bestLen = 0;
      for (const masterKey of Object.keys(COURSE_MASTER.byEnKey)) {
        if (masterKey.length < 5) continue;
        if (enKey.includes(masterKey) || masterKey.includes(enKey)) {
          const matchLen = Math.min(enKey.length, masterKey.length);
          if (matchLen > bestLen) { bestLen = matchLen; bestKey = masterKey; }
        }
      }
      if (bestKey && bestLen >= 5) {
        return applyMaster(promo, COURSE_MASTER.byEnKey[bestKey]);
      }
    }
  }

  // 5) 매칭 실패
  console.log(`[매칭실패] ko="${koName}" en="${enName}" → master에 없음, golf_course_id NULL로 저장`);
  promo._unmatched = true;
  cleanRegion(promo);
  return promo;
}

function applyMaster(promo, master) {
  if (master.ko) promo.golf_course = master.ko;
  promo.golf_course_en = master.en;
  promo.country = "태국";
  promo.region = master.region;
  promo.latitude = master.lat;
  promo.longitude = master.lng;
  promo.golf_course_id = master.id;
  promo._unmatched = false;
  return promo;
}

function cleanRegion(promo) {
  if (!promo.region) return;
  if (promo.region === "태국") promo.region = null;
  else if (promo.region.indexOf("태국 ") === 0) promo.region = promo.region.replace("태국 ", "");
}

// ====================================================================
// DB 저장
// ====================================================================
async function cleanupExpired(supabase) {
  const today = new Date().toISOString().split("T")[0];
  const result = await supabase.from("promotions").delete()
    .eq("status", "active").lt("end_date", today).not("end_date", "is", null);
  if (result.error) console.error("만료 정리 에러:", result.error.message);
}

async function saveWithDedup(supabase, promo, rawMessage, userId) {
  const courseName = promo.golf_course;
  if (!courseName) return { action: "skipped" };

  // unmatched는 dedup 검사 없이 바로 저장 (golf_course_id NULL)
  if (promo._unmatched) {
    const result = await insertNew(supabase, promo, rawMessage, userId);
    return { action: result.action === "saved" ? "unmatched" : "skipped" };
  }

  const searchResult = await supabase.from("promotions").select("*")
    .eq("status", "active").eq("golf_course_id", promo.golf_course_id);
  if (searchResult.error) return await insertNew(supabase, promo, rawMessage, userId);

  const existing = searchResult.data;
  if (!existing || existing.length === 0) return await insertNew(supabase, promo, rawMessage, userId);

  const overlapping = existing.filter(ex => datesOverlap(ex, promo));
  if (overlapping.length === 0) return await insertNew(supabase, promo, rawMessage, userId);

  overlapping.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const best = overlapping[0];

  if (calcDetailScore(promo) > calcDetailScore(best)) {
    const updateResult = await supabase.from("promotions").update({
      golf_course: promo.golf_course,
      golf_course_en: promo.golf_course_en || best.golf_course_en,
      country: "태국",
      region: promo.region || best.region,
      start_date: promo.start_date || best.start_date,
      end_date: promo.end_date || best.end_date,
      price_type: promo.price_type || best.price_type,
      green_fee: promo.green_fee || best.green_fee,
      currency: promo.currency || best.currency,
      includes_caddy: promo.includes_caddy != null ? promo.includes_caddy : best.includes_caddy,
      includes_cart: promo.includes_cart != null ? promo.includes_cart : best.includes_cart,
      includes_hotel: promo.includes_hotel != null ? promo.includes_hotel : best.includes_hotel,
      includes_meal: promo.includes_meal != null ? promo.includes_meal : best.includes_meal,
      caddy_fee: promo.caddy_fee != null ? promo.caddy_fee : best.caddy_fee,
      cart_fee: promo.cart_fee != null ? promo.cart_fee : best.cart_fee,
      contact_phone: promo.contact_phone || best.contact_phone,
      conditions: promo.conditions || best.conditions,
      latitude: promo.latitude || best.latitude,
      longitude: promo.longitude || best.longitude,
      golf_course_id: promo.golf_course_id || best.golf_course_id,
      raw_message: rawMessage,
      updated_at: new Date().toISOString(),
    }).eq("id", best.id);
    if (updateResult.error) return { action: "skipped" };
    return { action: "updated" };
  }
  return { action: "skipped" };
}

async function insertNew(supabase, promo, rawMessage, userId) {
  const result = await supabase.from("promotions").insert({
    golf_course: promo.golf_course,
    golf_course_en: promo.golf_course_en || null,
    country: "태국",
    region: promo.region || null,
    start_date: promo.start_date || null,
    end_date: promo.end_date || null,
    price_type: promo.price_type || "green_fee_only",
    green_fee: promo.green_fee || {},
    currency: promo.currency || "THB",
    includes_caddy: promo.includes_caddy || false,
    includes_cart: promo.includes_cart || false,
    includes_hotel: promo.includes_hotel || false,
    includes_meal: promo.includes_meal || false,
    caddy_fee: promo.caddy_fee || null,
    cart_fee: promo.cart_fee || null,
    contact_phone: promo.contact_phone || null,
    conditions: promo.conditions || null,
    latitude: promo.latitude || null,
    longitude: promo.longitude || null,
    golf_course_id: promo.golf_course_id || null,
    raw_message: rawMessage,
    reported_by: userId || "kakao_user",
    status: "active",
  }).select();
  if (result.error) {
    console.error("저장 에러:", result.error.message);
    return { action: "skipped" };
  }
  return { action: "saved" };
}

// ====================================================================
// phone master sync (NEW)
// 챗봇 prom의 contact_phone을 master에 자동 반영 (master가 NULL일 때만)
// ====================================================================
async function syncPhoneToMaster(supabase, promo) {
  const courseId = promo.golf_course_id;
  const phone = promo.contact_phone;
  if (!courseId || !phone) return;

  const { data, error } = await supabase
    .from("golf_courses")
    .select("phone")
    .eq("id", courseId)
    .single();
  if (error || !data || data.phone) return;  // 이미 phone 있으면 skip

  const result = await supabase.from("golf_courses").update({
    phone: phone,
    phone_source: "kakao_promo",
    phone_updated_at: new Date().toISOString(),
  }).eq("id", courseId);
  if (result.error) {
    console.error("phone sync 에러:", result.error.message);
  } else {
    console.log(`[phone sync] course ${courseId}에 ${phone} 반영`);
  }
}

// ====================================================================
// 유틸
// ====================================================================
function datesOverlap(existing, incoming) {
  if (!existing.start_date && !incoming.start_date) return true;
  if (!existing.start_date || !incoming.start_date) return true;
  const exStart = new Date(existing.start_date);
  const exEnd = existing.end_date ? new Date(existing.end_date) : new Date("2099-12-31");
  const inStart = new Date(incoming.start_date);
  const inEnd = incoming.end_date ? new Date(incoming.end_date) : new Date("2099-12-31");
  return exStart <= inEnd && exEnd >= inStart;
}

function calcDetailScore(p) {
  let score = 0;
  if (p.golf_course) score += 1;
  if (p.golf_course_en) score += 1;
  if (p.country) score += 1;
  if (p.region) score += 1;
  if (p.start_date) score += 1;
  if (p.end_date) score += 1;
  if (p.green_fee) score += Object.keys(p.green_fee).length * 2;
  if (p.price_type) score += 1;
  if (p.includes_caddy === true || p.includes_caddy === false) score += 1;
  if (p.includes_cart === true || p.includes_cart === false) score += 1;
  if (p.caddy_fee) score += 2;
  if (p.cart_fee) score += 2;
  if (p.conditions && p.conditions.length > 5) score += 2;
  if (p.contact_phone) score += 2;
  if (p.raw_message) score += Math.min(Math.floor(p.raw_message.length / 100), 5);
  return score;
}

function formatSummary(p) {
  const curr = p.currency === "KRW" ? "원" : "바트";
  const typeLabel = { all_inclusive: "올인클루시브", package: "패키지", green_fee_only: "그린피만" }[p.price_type] || "";
  const prices = p.green_fee ? Object.entries(p.green_fee).map(e => {
    const label = { default:"", weekday:"주중 ", weekend:"주말 ", morning:"오전 ", afternoon:"오후 " }[e[0]] || (e[0] + " ");
    return label + Number(e[1]).toLocaleString() + curr;
  }).join(" / ") : "";
  let text = p.golf_course + (p.region ? " (" + p.region + ")" : "");
  text += "\n" + (p.start_date || "미정") + " ~ " + (p.end_date || "미정");
  text += "\n" + prices + " [" + typeLabel + "]";
  if (p.conditions) text += "\n" + p.conditions;
  if (p.contact_phone) text += "\n☎ " + p.contact_phone;
  return text;
}

// 영문 골프장명 정규화 키 (소문자 + 영숫자만)
// "Bangkok Golf Club" / "BANGKOK GOLF CLUB" / "bangkok-golf-club" → "bangkokgolfclub"
function normalizeNameKey(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}