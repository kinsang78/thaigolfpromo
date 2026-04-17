const Anthropic = require("@anthropic-ai/sdk");
const { createClient } = require("@supabase/supabase-js");

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ====================================================================
// 골프장 마스터 데이터 (DB에서 동적 로딩)
// ====================================================================
async function loadCourseMaster() {
  var result = await supabase
    .from("golf_courses")
    .select("id, name_ko, name_en, country, region, latitude, longitude");

  if (result.error) {
    console.error("마스터 로딩 에러:", result.error.message);
    return {};
  }

  var master = {};
  result.data.forEach(function(c) {
    // name_ko가 있으면 한글명으로 등록
    if (c.name_ko) {
      master[c.name_ko] = {
        id: c.id,
        en: c.name_en,
        country: c.country,
        region: c.region,
        lat: c.latitude,
        lng: c.longitude
      };
    }
    // name_en으로도 등록 (영문명으로 제보가 올 수 있음)
    if (c.name_en) {
      master[c.name_en] = {
        id: c.id,
        en: c.name_en,
        country: c.country,
        region: c.region,
        lat: c.latitude,
        lng: c.longitude
      };
    }
  });

  return master;
}

function isLikelyPromotion(text) {
  if (!text || text.trim().length < 10) return false;

  var keywords = [
    "골프", "그린피", "바트", "캐디", "카트", "프로모션", "할인",
    "올인", "라운드", "부킹", "예약", "티오프", "샷건",
    "CC", "GC", "골프장", "컨트리클럽",
    "THB", "IDR", "루피아",
    "주중", "주말", "오전", "오후",
    "포함", "별도", "불포함",
    "대회", "토너먼트", "참가비"
  ];

  var lower = text.toLowerCase();
  for (var i = 0; i < keywords.length; i++) {
    if (lower.indexOf(keywords[i].toLowerCase()) !== -1) return true;
  }

  // 가격 패턴 감지 (숫자 + 바트/원/루피아, 또는 콤마 포함 숫자)
  if (/\d{3,}/.test(text)) return true;

  return false;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  var utterance = req.body && req.body.userRequest ? req.body.userRequest.utterance : null;
  var userId = req.body && req.body.userRequest && req.body.userRequest.user ? req.body.userRequest.user.id : null;

  if (!utterance) return res.json(kakaoResponse("메시지를 입력받지 못했습니다."));

  // 일반 대화 필터링
  if (!isLikelyPromotion(utterance)) {
    return res.json(kakaoResponse(
      "골프장 프로모션 정보를 보내주세요!\n\n" +
      "예시:\n" +
      "알파인 주중 2500바트 그린피+캐디+카트 포함 4/1~4/30"
    ));
  }

  if (!process.env.CLAUDE_API_KEY || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.json(kakaoResponse("서버 설정 오류입니다."));
  }

  try {
    var COURSE_MASTER = await loadCourseMaster();
    var masterListText = Object.entries(COURSE_MASTER)
      .filter(function(entry) { return entry[1].en && entry[0] !== entry[1].en; })  // 한글명 키만 포함 (영문명 키 제외)
      .map(function(entry) {
        return entry[0] + " -> " + entry[1].en + " | " + entry[1].country + " | " + entry[1].region;
      }).join("\n");

    var SYSTEM_PROMPT = [
      "당신은 동남아시아 골프장 프로모션 메시지 파싱 전문가입니다.",
      "사용자가 보내는 메시지에서 아래 정보를 JSON 배열로 추출하세요.",
      "",
      "각 프로모션마다 다음 형식을 지키세요:",
      "{",
      '  "golf_course": "골프장명 (한글)",',
      '  "golf_course_en": "골프장명 (영문)",',
      '  "country": "태국 또는 인도네시아",',
      '  "region": "세부 지역명",',
      '  "start_date": "YYYY-MM-DD 또는 null",',
      '  "end_date": "YYYY-MM-DD 또는 null",',
      '  "price_type": "green_fee_only | all_inclusive | package",',
      '  "green_fee": { "weekday": 2000, "weekend": 3000 },',
      '  "currency": "THB 또는 KRW 또는 IDR",',
      '  "includes_caddy": true/false,',
      '  "includes_cart": true/false,',
      '  "includes_hotel": true/false,',
      '  "includes_meal": true/false,',
      '  "caddy_fee": null,',
      '  "cart_fee": null,',
      '  "conditions": "특이사항 요약",',
      '  "contact_kakao": "ID 또는 null",',
      '  "contact_phone": "번호 또는 null"',
      "}",
      "",
      "=== 골프장 마스터 데이터 ===",
      "아래 목록에 있는 골프장은 반드시 이 데이터의 영문명/국가/지역을 사용하세요.",
      "목록에 없는 골프장은 최대한 정확하게 추정하되, 영문명을 모르면 null로 하세요.",
      "절대로 존재하지 않는 영문명을 만들어내지 마세요.",
      "",
      masterListText,
      "",
      "=== 가격 분류 규칙 (price_type) ===",
      "",
      '1. "all_inclusive": "그린피, 캐디, 카트 포함" 또는 "올인클루시브/올인" 명시',
      '2. "green_fee_only": 그린피만 표기, 캐디/카트 별도/불포함/추가, 또는 포함사항 미언급 (기본값)',
      '3. "package": 숙박+식사 포함 패키지',
      '4. 확실하지 않으면 "green_fee_only"로 설정하고 conditions에 "포함사항 미확인" 추가',
      "",
      "=== 기타 규칙 ===",
      "1. 반드시 JSON 배열만 출력. 설명 생략.",
      "2. 만원/원 = KRW, 바트 = THB, 루피아/IDR = IDR",
      "3. 여러 골프장이면 배열로 모두 추출",
      '4. region은 구체적 지역명만. "태국 방콕" 금지.',
      "5. 연도 없이 월만 있으면 가장 가까운 해당 월로 추정",
      '6. 그룹 가격 처리: "4인그룹 13000바트" 같이 N인 기준 총액이 명시된 경우,',
      "   green_fee에는 반드시 1인당 가격으로 나누어 입력하세요.",
      '   conditions에 "N인그룹 기준 (총 XX바트)" 형태로 원래 금액을 명시하세요.',
      "   예: 4인그룹 13000바트 -> green_fee: {\"default\": 3250}, conditions: \"4인그룹 기준 (총 13,000바트)\"",
      "7. 부가 혜택(기념품, 모자, 우산, 음료 등)이 포함된 경우 conditions에 해당 내용을 요약하세요",
      "8. 샷건/티오프 시간이 명시된 경우 conditions에 포함하세요. 예: \"샷건 12시\"",
      "9. 하루짜리 이벤트: 특정 날짜 하루만 진행되는 경우 start_date와 end_date를 동일하게 설정하세요.",
      "   예: '4월 12일 대회' -> start_date: '2026-04-12', end_date: '2026-04-12'",
      "10. 대회/토너먼트 감지: 샷건, 토너먼트, 대회, 상금, 시상, 마라톤, 참가비 등의 단어가 있으면",
      "    conditions 맨 앞에 '[대회]' 태그를 붙이세요.",
      "    예: conditions: '[대회] 4인그룹 기준 (총 13,000바트). 샷건 12시'",
      "11. 시간대별 가격: 오전/오후 가격이 다른 경우 green_fee 키를 다음처럼 구분하세요.",
      "    - weekday_morning, weekday_afternoon, weekend_morning, weekend_afternoon",
      "    - 구분 시간이 명시되어 있으면 conditions에 '12시 기준 오전/오후 구분' 같이 명시하세요.",
      "    - 오전/오후 가격이 동일하면 나누지 말고 weekday, weekend로 통합하세요.",
      "12. 프로모션이 아닌 일반 대화(인사, 질문, 잡담 등)인 경우에만 빈 배열 []을 반환하세요.",
      "    가격(숫자+바트/원/루피아)이 포함되어 있으면 반드시 프로모션으로 처리하세요.",
      "    마스터 데이터에 없는 골프장이라도 가격 정보가 있으면 최대한 추출하세요.",
      "    영문명을 모르면 golf_course_en을 null로 설정하고, 나머지 정보는 모두 추출하세요.",
    ].join("\n");

    await cleanupExpired();
    console.log("=== 파싱 시작 ===");

    var message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: utterance }],
    });

    var responseText = message.content[0].text;
    console.log("Claude 응답:", responseText.substring(0, 300));

    var promotions = [];
    try {
      var jsonMatch = responseText.match(/\[[\s\S]*\]/);
      var jsonString = jsonMatch ? jsonMatch[0] : responseText;
      var parsed = JSON.parse(jsonString);
      promotions = Array.isArray(parsed) ? parsed : [parsed];
    } catch (parseErr) {
      console.error("JSON 파싱 에러:", parseErr.message);
      return res.json(kakaoResponse("프로모션 정보를 해석하지 못했습니다."));
    }

    // 빈 배열 처리 (프로모션이 아닌 메시지)
    if (promotions.length === 0) {
      return res.json(kakaoResponse(
        "프로모션 정보가 감지되지 않았습니다.\n\n" +
        "골프장명과 가격이 포함된 프로모션 메시지를 보내주세요.\n" +
        "예: 알파인 주중 2500바트 캐디카트포함 4/1~4/30"
      ));
    }

    // 마스터 데이터로 후보정
    promotions = promotions.map(function(promo) { return correctWithMaster(promo, COURSE_MASTER); });

    console.log("파싱 결과:", promotions.length, "건");

    var results = { saved: [], updated: [], skipped: [] };
    for (var i = 0; i < promotions.length; i++) {
      var saveResult = await saveWithDedup(promotions[i], utterance, userId);
      results[saveResult.action].push(promotions[i]);
    }

    var lines = [];
    if (results.saved.length > 0) {
      lines.push("새로 등록 " + results.saved.length + "건");
      lines.push(results.saved.map(formatSummary).join("\n\n---\n\n"));
    }
    if (results.updated.length > 0) {
      lines.push("");
      lines.push("기존 정보 업데이트 " + results.updated.length + "건");
      for (var u = 0; u < results.updated.length; u++) {
        lines.push(results.updated[u].golf_course + " -> 더 상세한 정보로 교체됨");
      }
    }
    if (results.skipped.length > 0) {
      lines.push("");
      lines.push("중복 건너뜀 " + results.skipped.length + "건");
      for (var s = 0; s < results.skipped.length; s++) {
        lines.push(results.skipped[s].golf_course + " -> 이미 같거나 더 상세한 정보 있음");
      }
    }
    if (lines.length === 0) return res.json(kakaoResponse("저장할 프로모션을 찾지 못했습니다."));
    return res.json(kakaoResponse(lines.join("\n")));

  } catch (err) {
    console.error("에러:", err.message, err.status || "");
    var userMessage = "처리 중 오류가 발생했습니다.";
    if (err.message && err.message.indexOf("401") !== -1) userMessage = "API 인증 오류입니다.";
    else if (err.message && err.message.indexOf("429") !== -1) userMessage = "요청이 너무 많습니다.";
    else if (err.message && err.message.indexOf("404") !== -1) userMessage = "AI 모델 설정 오류입니다.";
    return res.json(kakaoResponse(userMessage));
  }
};


// ====================================================================
// 마스터 데이터 후보정
// ====================================================================
function correctWithMaster(promo, COURSE_MASTER) {
  var name = promo.golf_course;
  if (!name) return promo;

  // 1단계: 정확한 매칭
  if (COURSE_MASTER[name]) {
    return applyMaster(promo, COURSE_MASTER[name]);
  }

  // 2단계: 부분 매칭 (최소 3글자 이상 겹쳐야 매칭 — 오매칭 방지)
  var keys = Object.keys(COURSE_MASTER);
  var bestMatch = null;
  var bestLen = 0;
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (key.length < 2) continue;
    if (name.indexOf(key) !== -1 || key.indexOf(name) !== -1) {
      var matchLen = Math.min(name.length, key.length);
      if (matchLen > bestLen) {
        bestLen = matchLen;
        bestMatch = key;
      }
    }
  }
  if (bestMatch && bestLen >= 2) {
    promo.golf_course = bestMatch;
    return applyMaster(promo, COURSE_MASTER[bestMatch]);
  }

  // 3단계: 영문명 매칭
  if (promo.golf_course_en) {
    var enLower = promo.golf_course_en.toLowerCase();
    for (var j = 0; j < keys.length; j++) {
      if (!COURSE_MASTER[keys[j]].en) continue;
      var masterEn = COURSE_MASTER[keys[j]].en.toLowerCase();
      if (masterEn.indexOf(enLower) !== -1 || enLower.indexOf(masterEn) !== -1) {
        promo.golf_course_en = COURSE_MASTER[keys[j]].en;
        promo.country = promo.country || COURSE_MASTER[keys[j]].country;
        promo.region = promo.region || COURSE_MASTER[keys[j]].region;
        promo.latitude = COURSE_MASTER[keys[j]].lat;
        promo.longitude = COURSE_MASTER[keys[j]].lng;
        promo.golf_course_id = COURSE_MASTER[keys[j]].id;
        return promo;
      }
    }
  }

  // 4단계: 지역명 보정 + 통화 기반 국가 추정
  cleanRegion(promo);
  if (!promo.country && promo.currency) {
    if (promo.currency === "THB") promo.country = "태국";
    else if (promo.currency === "IDR") promo.country = "인도네시아";
  }

  return promo;
}

function applyMaster(promo, master) {
  promo.golf_course_en = master.en;
  promo.country = master.country;
  promo.region = master.region;
  promo.latitude = master.lat;
  promo.longitude = master.lng;
  promo.golf_course_id = master.id;
  return promo;
}

function cleanRegion(promo) {
  if (!promo.region) return;
  if (promo.region === "태국" || promo.region === "인도네시아") {
    promo.region = null;
  } else if (promo.region.indexOf("태국 ") === 0) {
    promo.region = promo.region.replace("태국 ", "");
  } else if (promo.region.indexOf("인도네시아 ") === 0) {
    promo.region = promo.region.replace("인도네시아 ", "");
  }
}


// ====================================================================
// DB 관련 함수
// ====================================================================
async function cleanupExpired() {
  var today = new Date().toISOString().split("T")[0];
  var result = await supabase.from("promotions").delete()
    .eq("status", "active").lt("end_date", today).not("end_date", "is", null);
  if (result.error) console.error("만료 정리 에러:", result.error.message);
}

async function saveWithDedup(promo, rawMessage, userId) {
  var courseName = promo.golf_course;
  if (!courseName) return { action: "skipped" };

  var searchResult = await supabase.from("promotions").select("*")
    .eq("status", "active").ilike("golf_course", "%" + courseName + "%");
  if (searchResult.error) return await insertNew(promo, rawMessage, userId);

  var existing = searchResult.data;
  if (!existing || existing.length === 0) return await insertNew(promo, rawMessage, userId);

  var overlapping = existing.filter(function(ex) { return datesOverlap(ex, promo); });
  if (overlapping.length === 0) return await insertNew(promo, rawMessage, userId);

  overlapping.sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); });
  var best = overlapping[0];

  if (calcDetailScore(promo) > calcDetailScore(best)) {
    var updateResult = await supabase.from("promotions").update({
      golf_course: promo.golf_course,
      golf_course_en: promo.golf_course_en || best.golf_course_en,
      country: promo.country || best.country,
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
      contact_kakao: promo.contact_kakao || best.contact_kakao,
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

async function insertNew(promo, rawMessage, userId) {
  var result = await supabase.from("promotions").insert({
    golf_course: promo.golf_course,
    golf_course_en: promo.golf_course_en || null,
    country: promo.country || null,
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
    contact_kakao: promo.contact_kakao || null,
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
// 유틸리티 함수
// ====================================================================
function datesOverlap(existing, incoming) {
  if (!existing.start_date && !incoming.start_date) return true;
  if (!existing.start_date || !incoming.start_date) return true;
  var exStart = new Date(existing.start_date);
  var exEnd = existing.end_date ? new Date(existing.end_date) : new Date("2099-12-31");
  var inStart = new Date(incoming.start_date);
  var inEnd = incoming.end_date ? new Date(incoming.end_date) : new Date("2099-12-31");
  return exStart <= inEnd && exEnd >= inStart;
}

function calcDetailScore(p) {
  var score = 0;
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
  if (p.contact_kakao) score += 2;
  if (p.contact_phone) score += 2;
  if (p.raw_message) score += Math.min(Math.floor(p.raw_message.length / 100), 5);
  return score;
}

function formatSummary(p) {
  var curr = p.currency === "KRW" ? "원" : p.currency === "IDR" ? "루피아" : "바트";
  var typeLabel = { all_inclusive: "올인클루시브", package: "패키지", green_fee_only: "그린피만" }[p.price_type] || "";
  var prices = p.green_fee ? Object.entries(p.green_fee).map(function(e) {
    var label = { default:"", weekday:"주중 ", weekend:"주말 ", morning:"오전 ", afternoon:"오후 " }[e[0]] || "";
    return label + Number(e[1]).toLocaleString() + curr;
  }).join(" / ") : "";
  var text = p.golf_course + (p.region ? " (" + p.region + ")" : "");
  if (p.country) text += " [" + p.country + "]";
  text += "\n" + (p.start_date || "미정") + " ~ " + (p.end_date || "미정");
  text += "\n" + prices + " [" + typeLabel + "]";
  if (p.conditions) text += "\n" + p.conditions;
  if (p.contact_phone) text += "\n" + p.contact_phone;
  return text;
}

function kakaoResponse(text) {
  return { version: "2.0", template: { outputs: [{ simpleText: { text: text } }] } };
}
