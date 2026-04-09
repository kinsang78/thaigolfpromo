const Anthropic = require("@anthropic-ai/sdk");
const { createClient } = require("@supabase/supabase-js");

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SYSTEM_PROMPT = `당신은 동남아시아 골프장 프로모션 메시지 파싱 전문가입니다.
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

규칙:
1. 반드시 JSON 배열만 출력하세요. 설명은 생략하세요.
2. (그린피,캐디,카트) 포함이면 "all_inclusive"
3. 캐디/카트가 "별도" 또는 불포함이면 "green_fee_only"
4. 숙박/식사 포함이면 "package"
5. "만원/원" 단위는 KRW, "바트" 단위는 THB, "루피아/IDR" 단위는 IDR
6. 여러 골프장이 한 메시지에 있으면 배열로 모두 추출하세요.
7. country 판별:
   - 바트(THB) 사용, 방콕/파타야/치앙마이/카오야이/후아힌/아유타야 등 → "태국"
   - 루피아(IDR) 사용, 자카르타/보고르/발리/찌까랑/센둥/탕그랑 등 → "인도네시아"
   - 판별 불가 시 문맥에서 추정
8. region은 구체적 지역명만 (예: "방콕", "파타야", "자카르타", "보고르")
   "태국 방콕" 같이 국가+지역을 합치지 마세요. 국가는 country에 넣으세요.`;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  var utterance = req.body && req.body.userRequest ? req.body.userRequest.utterance : null;
  var userId = req.body && req.body.userRequest && req.body.userRequest.user ? req.body.userRequest.user.id : null;

  if (!utterance) {
    return res.json(kakaoResponse("메시지를 입력받지 못했습니다."));
  }

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
    console.log("Claude 응답:", responseText.substring(0, 200));

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
    if (lines.length === 0) {
      return res.json(kakaoResponse("저장할 프로모션을 찾지 못했습니다."));
    }
    return res.json(kakaoResponse(lines.join("\n")));

  } catch (err) {
    console.error("에러:", err.message, err.status || "");
    var userMessage = "처리 중 오류가 발생했습니다.";
    if (err.message && err.message.indexOf("401") !== -1) userMessage = "API 인증 오류입니다.";
    else if (err.message && err.message.indexOf("429") !== -1) userMessage = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
    else if (err.message && err.message.indexOf("404") !== -1) userMessage = "AI 모델 설정 오류입니다.";
    return res.json(kakaoResponse(userMessage));
  }
};

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
