const Anthropic = require("@anthropic-ai/sdk");
const { createClient } = require("@supabase/supabase-js");

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ====================================================================
// 골프장 마스터 데이터 — 이름/영문명/국가/지역 매핑
// 새 골프장이 추가되면 여기에 등록하세요
// ====================================================================
var COURSE_MASTER = {
  "로얄방파인": { en: "Royal Bang Pa-In Golf Club", country: "태국", region: "방콕", lat: 14.1692, lng: 100.5384 },
  "알파인": { en: "Alpine Golf & Sports Club", country: "태국", region: "방콕", lat: 14.1089, lng: 100.7105 },
  "더 빈티지 클럽": { en: "The Vintage Club", country: "태국", region: "방콕", lat: 13.5360, lng: 100.8425 },
  "빈티지클럽": { en: "The Vintage Club", country: "태국", region: "방콕", lat: 13.5360, lng: 100.8425 },
  "레가시": { en: "Legacy Golf Club", country: "태국", region: "방콕", lat: 13.8773, lng: 100.7030 },
  "레거시 골프 클럽": { en: "Legacy Golf Club", country: "태국", region: "방콕", lat: 13.8773, lng: 100.7030 },
  "에카차이": { en: "Ekachai Golf & Country Club", country: "태국", region: "방콕", lat: 13.6285, lng: 100.3478 },
  "크룽까비": { en: "Krung Kavee Golf Club", country: "태국", region: "방콕", lat: 14.0025, lng: 100.6997 },
  "그랑프리 CC": { en: "Grand Prix Golf Club", country: "태국", region: "방콕", lat: 14.3774, lng: 99.4990 },
  "방파콩리버사이드": { en: "Bangpakong Riverside Country Club", country: "태국", region: "방콕", lat: 13.5679, lng: 101.0308 },
  "방콕그린벨리": { en: "Bangkok Green Valley", country: "태국", region: "방콕", lat: 13.6086, lng: 100.7311 },
  "탄야": { en: "Thanya Golf Club", country: "태국", region: "방콕", lat: 13.9528, lng: 100.6963 },
  "방사이": { en: "Bangsai Country Club", country: "태국", region: "방콕", lat: 14.2095, lng: 100.4706 },
  "나바타나": { en: "Navatanee Golf Club", country: "태국", region: "방콕", lat: 13.8029, lng: 100.6743 },
  "로얄크릭": { en: "Royal Creek Golf Club", country: "태국", region: "방콕", lat: 17.4647, lng: 102.9636 },
  "워터사이드": { en: "Waterside Golf Club", country: "태국", region: "방콕", lat: 12.9141, lng: 100.9972 },
  "레이크뷰": { en: "Lake View Resort & Golf Club", country: "태국", region: "방콕", lat: 12.6838, lng: 99.8921 },
  "롤링힐스": { en: "Rolling Hills Golf Club", country: "태국", region: "방콕", lat: 12.8954, lng: 100.9816 },
  "플랜테이션": { en: "The Plantation Golf Club", country: "태국", region: "방콕", lat: 12.9093, lng: 101.0086 },
  "수파부룩": { en: "Suwan Golf & Country Club", country: "태국", region: "방콕", lat: 13.8166, lng: 100.1640 },
  "레이크우드": { en: "Lakewood Country Club", country: "태국", region: "파타야", lat: 13.6222, lng: 100.7794 },
  "더파인": { en: "The Fine Golf Club", country: "태국", region: "파타야", lat: 13.1609, lng: 101.2271 },
  "무앙엑": { en: "Muang Ake Vista Golf Club", country: "태국", region: "파타야", lat: 13.9661, lng: 100.5783 },
  "유니랜드": { en: "Uni Land Golf & Country Club", country: "태국", region: "파타야", lat: 13.7518, lng: 100.0178 },
  "캥카찬": { en: "Khao Kheow Country Club", country: "태국", region: "파타야", lat: 13.2057, lng: 101.0397 },
  "이스턴스타": { en: "Eastern Star Country Club", country: "태국", region: "파타야", lat: 12.7025, lng: 101.0407 },
  "그린우드": { en: "Greenwood Golf Club", country: "태국", region: "파타야", lat: 13.1609, lng: 101.2271 },
  "크리스탈베이": { en: "Crystal Bay Golf Club", country: "태국", region: "파타야", lat: 13.2420, lng: 100.9479 },
  "시암CC": { en: "Siam Country Club", country: "태국", region: "파타야", lat: 12.9180, lng: 100.9878 },
  "아유타야 골프클럽": { en: "Ayutthaya Golf Club", country: "태국", region: "아유타야", lat: 14.3047, lng: 100.5803 },
  "아유타야": { en: "Ayutthaya Golf Club", country: "태국", region: "아유타야", lat: 14.3047, lng: 100.5803 },
  "가산 레거시": { en: "Gassan Legacy Golf Club", country: "태국", region: "치앙마이", lat: 18.6641, lng: 99.0868 },
  "가산 파노라마": { en: "Gassan Panorama Golf Club", country: "태국", region: "치앙마이", lat: 18.6419, lng: 99.0849 },
  "카오야이CC": { en: "Khao Yai Country Club", country: "태국", region: "카오야이", lat: 14.5200, lng: 101.3700 },
  "로얄 자카르타": { en: "Royal Jakarta Golf Club", country: "인도네시아", region: "자카르타", lat: -6.2717, lng: 106.9011 },
  "리버사이드 골프": { en: "Riverside Golf Club", country: "인도네시아", region: "자카르타", lat: -6.4217, lng: 106.9021 },
  "모던 골프": { en: "Modern Golf & Country Club", country: "인도네시아", region: "자카르타", lat: -6.1979, lng: 106.6434 },
  "세다유 인도": { en: "Sedayu Indo Golf Club", country: "인도네시아", region: "자카르타", lat: -6.0867, lng: 106.7494 },
  "젱카랑": { en: "Cengkareng Golf Club", country: "인도네시아", region: "자카르타", lat: -6.1218, lng: 106.6741 },
  "구눙 글리스": { en: "Gunung Geulis Country Club", country: "인도네시아", region: "보고르", lat: -6.6250, lng: 106.8620 },
  "레인보우 힐스": { en: "Rainbow Hills Golf Club", country: "인도네시아", region: "보고르", lat: -6.6205, lng: 106.8864 },
  "보고르 라야": { en: "Bogor Raya Development Golf Club", country: "인도네시아", region: "보고르", lat: -6.5985, lng: 106.8362 },
  "뻬르마따 센툴": { en: "Permata Sentul Golf Club", country: "인도네시아", region: "센툴", lat: -6.5273, lng: 106.8707 },
  "페르마타 센툴": { en: "Permata Sentul Golf Club", country: "인도네시아", region: "센툴", lat: -6.5273, lng: 106.8707 },
  "센툴 하이랜드": { en: "Sentul Highlands Golf Club", country: "인도네시아", region: "센툴", lat: -6.5853, lng: 106.8768 },
  "자바베카": { en: "Jababeka Golf & Country Club", country: "인도네시아", region: "찌까랑", lat: -6.2950, lng: 107.1757 },
  "수바르나 자카르타": { en: "Suvarna Jakarta Golf Club", country: "인도네시아", region: "자카르타", lat: -6.2850, lng: 106.8946 },
};

// 마스터 데이터를 프롬프트용 텍스트로 변환
var masterListText = Object.entries(COURSE_MASTER).map(function(entry) {
  return entry[0] + " → " + entry[1].en + " | " + entry[1].country + " | " + entry[1].region;
}).join("\n");

var SYSTEM_PROMPT = `당신은 동남아시아 골프장 프로모션 메시지 파싱 전문가입니다.
사용자가 보내는 메시지에서 아래 정보를 JSON 배열로 추출하세요.

각 프로모션마다 다음 형식을 지키세요:
{
  "golf_course": "골프장명 (한글)",
  "golf_course_en": "골프장명 (영문)",
  "country": "태국 또는 인도네시아",
  "region": "세부 지역명",
  "start_date": "YYYY-MM-DD 또는 null",
  "end_date": "YYYY-MM-DD 또는 null",
  "price_type": "green_fee_only | all_inclusive | package",
  "green_fee": { "weekday": 2000, "weekend": 3000 },
  "currency": "THB 또는 KRW 또는 IDR",
  "includes_caddy": true/false,
  "includes_cart": true/false,
  "includes_hotel": true/false,
  "includes_meal": true/false,
  "caddy_fee": 숫자 또는 null,
  "cart_fee": 숫자 또는 null,
  "conditions": "특이사항 요약",
  "contact_kakao": "ID 또는 null",
  "contact_phone": "번호 또는 null"
}

=== 골프장 마스터 데이터 ===
아래 목록에 있는 골프장은 반드시 이 데이터의 영문명/국가/지역을 사용하세요.
목록에 없는 골프장은 최대한 정확하게 추정하되, 영문명을 모르면 null로 하세요.
절대로 존재하지 않는 영문명을 만들어내지 마세요.

${masterListText}

=== 가격 분류 규칙 (price_type) — 정확하게 지키세요 ===

1. "all_inclusive" 판별:
   - 메시지에 "그린피, 캐디, 카트 포함" 또는 "(그린피,캐디,카트)" 명시
   - "올인클루시브" 또는 "올인" 이라는 단어가 있음
   - 하나의 가격에 그린피+캐디+카트가 모두 포함된 경우

2. "green_fee_only" 판별:
   - 가격이 "그린피" 또는 "그린피만" 으로 표기
   - 캐디/카트가 "별도", "불포함", "추가" 등으로 언급
   - 가격 옆에 포함 사항 언급이 없는 경우 (기본값)

3. "package" 판별:
   - 숙박(호텔)과 식사가 포함된 패키지 상품
   - "원" 단위의 높은 가격 + 숙박/식사 언급

4. 확실하지 않은 경우:
   - 가격만 있고 포함사항 언급이 없으면 "green_fee_only"로 설정
   - includes_caddy, includes_cart를 false로 설정
   - conditions에 "포함사항 미확인" 추가

=== 기타 규칙 ===
1. 반드시 JSON 배열만 출력하세요. 설명은 생략하세요.
2. "만원/원" 단위는 KRW, "바트" 단위는 THB, "루피아/IDR" 단위는 IDR
3. 여러 골프장이 한 메시지에 있으면 배열로 모두 추출하세요.
4. region은 구체적 지역명만 ("방콕", "파타야" 등). "태국 방콕" 금지.
5. 날짜가 "4월" 같이 연도 없이 월만 있으면 가장 가까운 해당 월로 추정.`;


module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  var utterance = req.body && req.body.userRequest ? req.body.userRequest.utterance : null;
  var userId = req.body && req.body.userRequest && req.body.userRequest.user ? req.body.userRequest.user.id : null;

  if (!utterance) return res.json(kakaoResponse("메시지를 입력받지 못했습니다."));
  if (!process.env.CLAUDE_API_KEY || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.json(kakaoResponse("서버 설정 오류입니다."));
  }

  try {
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

    // === 마스터 데이터로 후보정 ===
    promotions = promotions.map(correctWithMaster);

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
        lines.push(results.updated[u].golf_course + " → 더 상세한 정보로 교체됨");
      }
    }
    if (results.skipped.length > 0) {
      lines.push("");
      lines.push("중복 건너뜀 " + results.skipped.length + "건");
      for (var s = 0; s < results.skipped.length; s++) {
        lines.push(results.skipped[s].golf_course + " → 이미 같거나 더 상세한 정보 있음");
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
// 마스터 데이터로 후보정
// ====================================================================
function correctWithMaster(promo) {
  var name = promo.golf_course;
  if (!name) return promo;

  // 정확한 매칭
  if (COURSE_MASTER[name]) {
    var m = COURSE_MASTER[name];
    promo.golf_course_en = m.en;
    promo.country = m.country;
    promo.region = m.region;
    promo.latitude = m.lat;
    promo.longitude = m.lng;
    return promo;
  }

  // 부분 매칭 (입력된 이름이 마스터 키를 포함하거나, 마스터 키가 입력을 포함)
  var keys = Object.keys(COURSE_MASTER);
  for (var i = 0; i < keys.length; i++) {
    if (name.indexOf(keys[i]) !== -1 || keys[i].indexOf(name) !== -1) {
      var m2 = COURSE_MASTER[keys[i]];
      promo.golf_course = keys[i]; // 마스터 이름으로 통일
      promo.golf_course_en = m2.en;
      promo.country = m2.country;
      promo.region = m2.region;
      promo.latitude = m2.lat;
      promo.longitude = m2.lng;
      return promo;
    }
  }

  // 영문명으로 매칭 시도
  if (promo.golf_course_en) {
    var enLower = promo.golf_course_en.toLowerCase();
    for (var j = 0; j < keys.length; j++) {
      if (COURSE_MASTER[keys[j]].en.toLowerCase().indexOf(enLower) !== -1 ||
          enLower.indexOf(COURSE_MASTER[keys[j]].en.toLowerCase()) !== -1) {
        var m3 = COURSE_MASTER[keys[j]];
        promo.golf_course_en = m3.en;
        promo.country = promo.country || m3.country;
        promo.region = promo.region || m3.region;
        promo.latitude = m3.lat;
        promo.longitude = m3.lng;
        return promo;
      }
    }
  }

  // 지역명 보정: "태국", "태국 방콕" 같은 잘못된 값 수정
  if (promo.region) {
    if (promo.region === "태국" || promo.region === "인도네시아") {
      promo.region = null; // 국가명만 있으면 비움
    }
    if (promo.region && promo.region.indexOf("태국 ") === 0) {
      promo.region = promo.region.replace("태국 ", "");
    }
    if (promo.region && promo.region.indexOf("인도네시아 ") === 0) {
      promo.region = promo.region.replace("인도네시아 ", "");
    }
  }

  return promo;
}


// ====================================================================
// 이하 기존 함수들
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
    raw_message: rawMessage,
    reported_by: userId || "kakao_user",
    status: "active",
  }).select();
  if (result.error) return { action: "skipped" };
  return { action: "saved" };
}

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
