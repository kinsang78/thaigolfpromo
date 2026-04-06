const Anthropic = require("@anthropic-ai/sdk");
const { createClient } = require("@supabase/supabase-js");

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SYSTEM_PROMPT = `당신은 태국 골프장 프로모션 메시지 파싱 전문가입니다.
사용자가 보내는 메시지에서 아래 정보를 JSON 배열로 추출하세요.

각 프로모션마다 다음 형식을 지키세요:
{
  "golf_course": "골프장명 (한글)",
  "golf_course_en": "골프장명 (영문)",
  "region": "방콕|파타야|치앙마이|카오야이|후아힌|기타",
  "start_date": "YYYY-MM-DD 또는 null",
  "end_date": "YYYY-MM-DD 또는 null",
  "price_type": "green_fee_only | all_inclusive | package",
  "green_fee": { "weekday": 2000, "weekend": 3000 },
  "currency": "THB 또는 KRW",
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
5. "만원/원" 단위는 KRW, 그 외는 THB로 처리하세요.
6. 여러 골프장이 한 메시지에 있으면 배열로 모두 추출하세요.`;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const utterance = req.body?.userRequest?.utterance;
  const userId = req.body?.userRequest?.user?.id;

  if (!utterance) {
    return res.json(kakaoResponse("메시지를 입력받지 못했습니다."));
  }

  if (!process.env.CLAUDE_API_KEY) {
    console.error("ERROR: CLAUDE_API_KEY 환경변수가 설정되지 않음");
    return res.json(kakaoResponse("서버 설정 오류: API 키가 없습니다."));
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error("ERROR: SUPABASE 환경변수가 설정되지 않음");
    return res.json(kakaoResponse("서버 설정 오류: DB 연결 정보가 없습니다."));
  }

  try {
    console.log("=== 파싱 시작 ===");
    console.log("입력 메시지 길이:", utterance.length);

    // 1. Claude API 호출
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: utterance }],
    });

    const responseText = message.content[0].text;
    console.log("Claude 응답:", responseText.substring(0, 200));

    let promotions = [];

    // 2. JSON 추출
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      const jsonString = jsonMatch ? jsonMatch[0] : responseText;
      const parsed = JSON.parse(jsonString);
      promotions = Array.isArray(parsed) ? parsed : [parsed];
    } catch (parseErr) {
      console.error("JSON 파싱 에러:", parseErr.message);
      console.error("Claude 원본 응답:", responseText);
      return res.json(kakaoResponse(
        "프로모션 정보를 해석하지 못했습니다.\n골프장명과 가격이 포함되어 있는지 확인해주세요."
      ));
    }

    console.log("파싱 결과:", promotions.length, "건");

    // 3. 중복 확인 + DB 저장
    const results = { saved: [], updated: [], skipped: [] };

    for (const promo of promotions) {
      const saveResult = await saveWithDedup(promo, utterance, userId);
      results[saveResult.action].push(promo);
    }

    console.log("저장:", results.saved.length, "업데이트:", results.updated.length, "건너뜀:", results.skipped.length);

    // 4. 카카오톡 응답 생성
    const lines = [];

    if (results.saved.length > 0) {
      lines.push("새로 등록 " + results.saved.length + "건");
      lines.push(results.saved.map(formatSummary).join("\n\n---\n\n"));
    }

    if (results.updated.length > 0) {
      lines.push("");
      lines.push("기존 정보 업데이트 " + results.updated.length + "건");
      results.updated.forEach(function(p) {
        lines.push(p.golf_course + " → 더 상세한 정보로 교체됨");
      });
    }

    if (results.skipped.length > 0) {
      lines.push("");
      lines.push("중복 건너뜀 " + results.skipped.length + "건");
      results.skipped.forEach(function(p) {
        lines.push(p.golf_course + " → 이미 같거나 더 상세한 정보 있음");
      });
    }

    if (lines.length === 0) {
      return res.json(kakaoResponse("저장할 프로모션을 찾지 못했습니다."));
    }

    return res.json(kakaoResponse(lines.join("\n")));

  } catch (err) {
    console.error("=== 에러 발생 ===");
    console.error("에러 타입:", err.constructor.name);
    console.error("에러 메시지:", err.message);
    if (err.status) console.error("HTTP 상태:", err.status);
    console.error("스택:", err.stack);

    var userMessage = "처리 중 오류가 발생했습니다.";
    if (err.message && err.message.indexOf("401") !== -1) {
      userMessage = "API 인증 오류입니다. 관리자에게 문의해주세요.";
    } else if (err.message && err.message.indexOf("429") !== -1) {
      userMessage = "요청이 너무 많습니다. 1분 후 다시 시도해주세요.";
    } else if (err.message && err.message.indexOf("timeout") !== -1) {
      userMessage = "응답 시간이 초과되었습니다. 메시지를 짧게 나눠서 보내보세요.";
    } else if (err.message && (err.message.indexOf("model") !== -1 || err.message.indexOf("404") !== -1)) {
      userMessage = "AI 모델 설정 오류입니다. 관리자에게 문의해주세요.";
    }

    return res.json(kakaoResponse(userMessage));
  }
};


// =============================================================
// 중복 확인 + 저장
// =============================================================
async function saveWithDedup(promo, rawMessage, userId) {
  var courseName = promo.golf_course;

  if (!courseName) {
    return { action: "skipped" };
  }

  // 같은 골프장의 active 프로모션 검색
  var searchResult = await supabase
    .from("promotions")
    .select("*")
    .eq("status", "active")
    .ilike("golf_course", "%" + courseName + "%");

  if (searchResult.error) {
    console.error("검색 에러:", searchResult.error.message);
    return await insertNew(promo, rawMessage, userId);
  }

  var existing = searchResult.data;

  if (!existing || existing.length === 0) {
    return await insertNew(promo, rawMessage, userId);
  }

  // 기간 겹치는 프로모션 찾기
  var overlapping = existing.filter(function(ex) {
    return datesOverlap(ex, promo);
  });

  if (overlapping.length === 0) {
    return await insertNew(promo, rawMessage, userId);
  }

  // 가장 최근 등록된 것과 비교
  overlapping.sort(function(a, b) {
    return new Date(b.created_at) - new Date(a.created_at);
  });
  var best = overlapping[0];

  var newScore = calcDetailScore(promo);
  var existingScore = calcDetailScore(best);

  console.log("중복 발견: " + courseName + " | 기존:" + existingScore + " 신규:" + newScore);

  if (newScore > existingScore) {
    // 새 정보가 더 상세 → 기존 것을 업데이트
    var updateResult = await supabase
      .from("promotions")
      .update({
        golf_course: promo.golf_course,
        golf_course_en: promo.golf_course_en || best.golf_course_en,
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
        max_players: promo.max_players || best.max_players,
        raw_message: rawMessage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", best.id);

    if (updateResult.error) {
      console.error("업데이트 에러:", updateResult.error.message);
      return { action: "skipped" };
    }
    return { action: "updated" };
  } else {
    return { action: "skipped" };
  }
}


// 새 프로모션 저장
async function insertNew(promo, rawMessage, userId) {
  var result = await supabase
    .from("promotions")
    .insert({
      golf_course: promo.golf_course,
      golf_course_en: promo.golf_course_en || null,
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
      max_players: promo.max_players || null,
      raw_message: rawMessage,
      reported_by: userId || "kakao_user",
      status: "active",
    })
    .select();

  if (result.error) {
    console.error("저장 에러:", result.error.message);
    return { action: "skipped" };
  }
  return { action: "saved" };
}


// 기간 겹침 판단
function datesOverlap(existing, incoming) {
  if (!existing.start_date && !incoming.start_date) return true;
  if (!existing.start_date || !incoming.start_date) return true;

  var exStart = new Date(existing.start_date);
  var exEnd = existing.end_date ? new Date(existing.end_date) : new Date("2099-12-31");
  var inStart = new Date(incoming.start_date);
  var inEnd = incoming.end_date ? new Date(incoming.end_date) : new Date("2099-12-31");

  return exStart <= inEnd && exEnd >= inStart;
}


// 상세도 점수 계산 (값이 채워진 필드가 많을수록 높음)
function calcDetailScore(p) {
  var score = 0;

  if (p.golf_course) score += 1;
  if (p.golf_course_en) score += 1;
  if (p.region) score += 1;
  if (p.start_date) score += 1;
  if (p.end_date) score += 1;

  if (p.green_fee) {
    var priceCount = Object.keys(p.green_fee).length;
    score += priceCount * 2;
  }
  if (p.price_type) score += 1;
  if (p.currency) score += 1;

  if (p.includes_caddy === true || p.includes_caddy === false) score += 1;
  if (p.includes_cart === true || p.includes_cart === false) score += 1;
  if (p.includes_hotel === true || p.includes_hotel === false) score += 1;
  if (p.includes_meal === true || p.includes_meal === false) score += 1;

  if (p.caddy_fee) score += 2;
  if (p.cart_fee) score += 2;

  if (p.conditions && p.conditions.length > 5) score += 2;
  if (p.contact_kakao) score += 2;
  if (p.contact_phone) score += 2;

  if (p.raw_message) {
    score += Math.min(Math.floor(p.raw_message.length / 100), 5);
  }

  return score;
}


// 요약 포맷
function formatSummary(p) {
  var typeLabel = {
    all_inclusive: "올인클루시브",
    package: "패키지",
    green_fee_only: "그린피만",
  }[p.price_type] || p.price_type;

  var curr = p.currency === "KRW" ? "원" : "바트";
  var prices = "가격정보없음";

  if (p.green_fee) {
    var labelMap = {
      default: "", weekday: "주중 ", weekend: "주말 ",
      morning: "오전 ", afternoon: "오후 ",
      golfer: "골퍼 ", non_golfer: "논골퍼 ",
      wednesday: "수요일 ",
    };
    prices = Object.entries(p.green_fee)
      .map(function(entry) {
        var label = labelMap[entry[0]] || "";
        return label + Number(entry[1]).toLocaleString() + curr;
      })
      .join(" / ");
  }

  var extras = [];
  if (p.includes_caddy) extras.push("캐디포함");
  if (p.includes_cart) extras.push("카트포함");
  if (p.includes_hotel) extras.push("숙박포함");
  if (p.includes_meal) extras.push("식사포함");
  if (p.caddy_fee) extras.push("캐디" + p.caddy_fee + "바트별도");
  if (p.cart_fee) extras.push("카트" + p.cart_fee + "바트별도");

  var text = p.golf_course;
  if (p.region) text += " (" + p.region + ")";
  text += "\n" + (p.start_date || "미정") + " ~ " + (p.end_date || "미정");
  text += "\n" + prices + " [" + typeLabel + "]";
  if (extras.length) text += "\n" + extras.join(", ");
  if (p.conditions) text += "\n" + p.conditions;
  if (p.contact_kakao) text += "\n카톡: " + p.contact_kakao;
  if (p.contact_phone) text += "\n전화: " + p.contact_phone;
  return text;
}


// 카카오 응답 포맷
function kakaoResponse(text) {
  return {
    version: "2.0",
    template: {
      outputs: [{ simpleText: { text: text } }],
    },
  };
}
