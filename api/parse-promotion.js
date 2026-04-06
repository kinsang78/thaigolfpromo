const Anthropic = require("@anthropic-ai/sdk");
const { createClient } = require("@supabase/supabase-js");

// 환경 변수 로드
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
  "contact_kakao": "ID",
  "contact_phone": "번호"
}

규칙:
1. 반드시 JSON 배열만 출력하세요. 설명은 생략하세요.
2. (그린피,캐디,카트) 포함이면 "all_inclusive"
3. "만원/원" 단위는 KRW, 그 외는 THB로 처리하세요.`;

module.exports = async function handler(req, res) {
  // POST 요청만 허용
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const utterance = req.body?.userRequest?.utterance;
  const userId = req.body?.userRequest?.user?.id;

  if (!utterance) {
    return res.json(kakaoResponse("메시지를 입력받지 못했습니다."));
  }

  try {
    // 1. Claude API 호출 (2026년 최신 Haiku 모델 - 속도 최우선)
    const message = await anthropic.messages.create({
      model: "claude-4-5-haiku-20251015",
      max_tokens: 1500,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: utterance }],
    });

    const responseText = message.content[0].text;
    let promotions = [];
    
    // 2. JSON 추출 로직 (Claude가 텍스트를 섞어 보낼 경우 대비)
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      const jsonString = jsonMatch ? jsonMatch[0] : responseText;
      promotions = JSON.parse(jsonString);
      if (!Array.isArray(promotions)) promotions = [promotions];
    } catch (parseErr) {
      console.error("JSON 파싱 에러:", responseText);
      return res.json(kakaoResponse("프로모션 정보를 해석하지 못했습니다. 형식을 확인해주세요."));
    }

    // 3. Supabase DB 저장
    const savedCount = [];
    for (const promo of promotions) {
      const { error } = await supabase.from("promotions").insert({
        ...promo,
        raw_message: utterance,
        reported_by: userId || "kakao_user",
        status: "active"
      });
      if (!error) savedCount.push(promo);
    }

    // 4. 카카오톡 응답 생성
    if (savedCount.length > 0) {
      const summary = savedCount.map(formatSummary).join("\n\n---\n\n");
      return res.json(kakaoResponse(`✅ ${savedCount.length}건 등록 완료!\n\n${summary}`));
    } else {
      return res.json(kakaoResponse("DB 저장 중 오류가 발생했습니다."));
    }

  } catch (err) {
    console.error("전체 프로세스 에러:", err);
    return res.json(kakaoResponse("처리 중 시간이 초과되었거나 오류가 발생했습니다. 다시 시도해 주세요."));
  }
};

// 요약 포맷 함수
function formatSummary(p) {
  const priceStr = p.green_fee ? Object.values(p.green_fee).join("/") : "가격정보없음";
  return `⛳️ ${p.golf_course}\n📅 ${p.start_date || ""} ~ ${p.end_date || ""}\n💰 ${priceStr} ${p.currency}\n📍 ${p.region || "기타"}`;
}

// 카카오 기본 응답 포맷
function kakaoResponse(text) {
  return {
    version: "2.0",
    template: {
      outputs: [{ simpleText: { text } }]
    }
  };
}
