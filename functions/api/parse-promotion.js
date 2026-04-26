import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

// ====================================================================
// Cloudflare Pages Functions 진입점
// 카카오 i 오픈빌더 webhook (POST 전용)
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

    // 날짜 계산 로직 추가 (오늘, 당월 1일, 당월 말일)
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

    const SYSTEM_PROMPT = buildSystemPrompt(today, firstDay, lastDay, masterListText);

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

    // 마스터 매칭
    promotions = promotions.map(p => correctWithMaster(p, COURSE_MASTER));

    const results = { saved: [], updated: [], skipped: [], unmatched: [] };
    for (const promo of promotions) {
      const saveResult = await saveWithDedup(supabase, promo, utterance, userId);
      results[saveResult.action].push(promo);

      // master에 phone 자동 sync
      if (promo.golf_course_id && promo.contact_phone) {
        await syncPhoneToMaster(supabase, promo).catch(e =>
          console.error("phone sync 실패:", e.message)
        );
      }
    }

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
        const label = u.golf_course || u.golf_course_en || ("(이름 추출 실패) " + utterance.substring(0, 25) + "...");
        lines.push("- " + label);
      });
      lines.push("→ 마스터 DB에 없는 골프장입니다. 명칭 확인 후 운영자가 수동 등록합니다.");
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
// 시스템 프롬프트 (태국 전용, 강화된 규칙 적용)
// ====================================================================
function buildSystemPrompt(today, firstDay, lastDay, masterListText) {
  return [
    `오늘 날짜: ${today}`,
    `이번 달 시작: ${firstDay}`,
    `이번 달 마감: ${lastDay}`,
    "당신은 태국 골프장 프로모션 메시지 파싱 전문가입니다.",
    "사용자가 보내는 메시지에서 아래 정보를 JSON 배열로 추출하세요.",
    "",
    "각 프로모션마다 다음 형식을 지키세요:",
    "{",
    '  "golf_course": "골프장명 (한글)",',
    '  "golf_course_en": "골프장명 (영문)",',
    '  "country": "태국",',
    '  "region": "세부 지역명 (방콕/파타야/후아힌/카오야이/푸켓/치앙마이 등)",',
    '  "start_date": "YYYY-MM-DD",',
    '  "end_date": "YYYY-MM-DD",',
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
    "=== 데이터 추출 규칙 및 통제 사항 (매우 중요) ===",
    `1. **기간 기본값**: 텍스트에 기간(날짜)이 전혀 명시되지 않은 경우, 무조건 이번 달 전체(${firstDay} ~ ${lastDay})로 설정하세요. start_date와 end_date를 절대로 null로 두지 마세요.`,
    "2. **대회/행사(단일 날짜)**: 텍스트에 '대회', '토너먼트', '샷건', '시상', '행사' 등의 키워드가 있다면, 이는 하루짜리 단일 행사입니다. 반드시 start_date와 end_date를 행사일 하루로 똑같이 설정하고, conditions 맨 앞에 '[대회]' 태그를 붙이세요.",
    "",
    "3. **가격 키(Key) 엄격 통제**: green_fee 내부의 키는 **반드시 아래 허용된 키워드만 사용**해야 합니다. '2pm_onwards' 같이 임의의 키를 절대 새로 만들지 마세요.",
    "  - 허용 키: default, weekday, weekend, morning, afternoon, weekday_morning, weekday_afternoon, weekend_morning, weekend_afternoon",
    "  - 역할 분리(있을 경우): member, guest, visitor (예: member_weekday, guest_weekend)",
    "  - '카트 별도' 같은 조건은 절대 키로 만들지 말고 conditions에 적으세요. (weekday_cart 금지)",
    "  - 텍스트에 시간대가 여러 개 나열될 경우(예: 6시 이후 2000, 2시 이후 1500), 문맥상 빠른 시간은 'morning', 오후 시간은 'afternoon'으로 해석하세요. 구체적인 시간별 복잡한 요금(예: 4시 이후 1100바트)은 대표 가격만 키에 넣고, 자세한 내용은 conditions에 '시간대별 그린피 (6시 2000, 2시 1500, 4시 1100바트)'와 같이 문장으로 요약하세요.",
    "",
    "4. **가격 분류(price_type)**: 올인/올인클루시브/카트캐디 포함 명시 시 'all_inclusive', 숙박 명시 시 'package', 그 외나 불확실하면 'green_fee_only'로 설정.",
    "5. **전화번호**: '전화/예약/문의' 다음 숫자 패턴(+66, 0066 포함)은 반드시 contact_phone에 저장.",
    "6. **골프장명 보존**: 한글명은 무조건 보존(마스터에 없어도 사용자가 입력한 대로). 영문명은 모를 때만 null.",
    "7. **응답 형식**: 어떤 경우에도 설명, 주석, 마크다운 코드블록(`) 없이 순수한 JSON 배열만 출력하세요.",
    "",
    "8. **올인 가격 우선 규칙 (매우 중요)**: 같은 시간대(주중/주말)에 포함 항목이 다른 여러 가격이 나열되어 있으면, **가장 많은 항목을 포함한 가격(올인 가격)을 메인 키에 넣으세요**.",
    "  - 예시: '주중 1600바트(그린피,캐디) / 2200바트(그린피,캐디,카트)' → green_fee.weekday = 2200 (올인 우선)",
    "  - 예시: '주말 2100바트(그린피,캐디) / 2700바트(그린피,캐디,카트)' → green_fee.weekend = 2700",
    "  - 메인 가격에 캐디가 포함되면 includes_caddy=true, 카트가 포함되면 includes_cart=true, 숙박은 includes_hotel=true, 식사는 includes_meal=true 로 반드시 설정.",
    "  - 메인 가격이 그린피+캐디+카트 올인이면 price_type='all_inclusive'.",
    "  - 메인 가격에 숙박이 포함되면 price_type='package'.",
    "  - 메인 가격이 그린피만이면 price_type='green_fee_only'.",
    "  - 더 저렴한 부분 옵션(그린피만, 그린피+캐디 등)은 절대 메인 가격으로 쓰지 말고, conditions 필드에 자연어로 명시: 예) '그린피+캐디만 옵션: 주중 1600바트 / 주말 2100바트'",
    "",
    "9. **합산 가격 추론 규칙**: 메시지에 항목별 가격이 분리되어 있으면(예: 그린피 1500 / 캐디 400 / 카트 700), **합산하여 올인가로 메인 키에 넣으세요**.",
    "  - 예시: '그린피 1500바트, 캐디피 400바트, 카트피 700바트' → green_fee.weekday = 2600, includes_caddy=true, includes_cart=true, price_type='all_inclusive'",
    "  - 단, 합산이 명확하지 않거나 옵션 선택 형태(택1)면 합산하지 말고 caddy_fee, cart_fee 별도 필드에 저장.",
  ].join("\n");
}

// ====================================================================
// 이하 기존 함수들 (변경 없음)
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

  return { byKo, byEnKey, raw: data };
}

function buildMasterListText(COURSE_MASTER) {
  const lines = [];
  const seen = new Set();
  for (const [ko, m] of Object.entries(COURSE_MASTER.byKo)) {
    lines.push(`${ko} = ${m.en || "?"} | ${m.region || "?"}`);
    if (m.en) seen.add(normalizeNameKey(m.en));
  }
  for (const [enKey, m] of Object.entries(COURSE_MASTER.byEnKey)) {
    if (seen.has(enKey)) continue;
    lines.push(`(한글미정) = ${m.en} | ${m.region || "?"}`);
  }
  return lines.join("\n");
}

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

function correctWithMaster(promo, COURSE_MASTER) {
  const koName = promo.golf_course;
  const enName = promo.golf_course_en;

  if (koName && COURSE_MASTER.byKo[koName]) {
    return applyMaster(promo, COURSE_MASTER.byKo[koName]);
  }

  if (enName) {
    const enKey = normalizeNameKey(enName);
    if (enKey && COURSE_MASTER.byEnKey[enKey]) {
      return applyMaster(promo, COURSE_MASTER.byEnKey[enKey]);
    }
  }

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
      promo.golf_course = bestKey; 
      return applyMaster(promo, COURSE_MASTER.byKo[bestKey]);
    }
  }

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

  console.log(`[매칭실패] ko="${koName}" en="${enName}" → master에 없음`);
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

async function cleanupExpired(supabase) {
  const today = new Date().toISOString().split("T")[0];
  const result = await supabase.from("promotions").delete()
    .eq("status", "active").lt("end_date", today).not("end_date", "is", null);
  if (result.error) console.error("만료 정리 에러:", result.error.message);
}

async function saveWithDedup(supabase, promo, rawMessage, userId) {
  if (promo._unmatched) {
    const result = await insertNew(supabase, promo, rawMessage, userId);
    return { action: result.action === "saved" ? "unmatched" : "skipped" };
  }

  const courseName = promo.golf_course;
  if (!courseName) return { action: "skipped" };

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

async function syncPhoneToMaster(supabase, promo) {
  const courseId = promo.golf_course_id;
  const phone = promo.contact_phone;
  if (!courseId || !phone) return;

  const { data, error } = await supabase
    .from("golf_courses")
    .select("phone")
    .eq("id", courseId)
    .single();
  if (error || !data || data.phone) return;

  await supabase.from("golf_courses").update({
    phone: phone,
    phone_source: "kakao_promo",
    phone_updated_at: new Date().toISOString(),
  }).eq("id", courseId);
}

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

function normalizeNameKey(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}