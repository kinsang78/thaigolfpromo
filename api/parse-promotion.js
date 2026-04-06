const Anthropic = require("@anthropic-ai/sdk");
const { createClient } = require("@supabase/supabase-js");

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SYSTEM_PROMPT = `당신은 태국 골프장 프로모션 메시지 파싱 전문가입니다.

사용자가 보내는 메시지에서 아래 정보를 JSON 배열로 추출하세요.
하나의 메시지에 여러 골프장 프로모션이 포함될 수 있습니다.

각 프로모션마다 다음을 추출:
{
  "golf_course": "골프장명 (한글)",
  "golf_course_en": "골프장명 (영문, 추정 가능하면)",
  "region": "방콕|파타야|치앙마이|카오야이|후아힌|기타",
  "start_date": "YYYY-MM-DD 또는 null",
  "end_date": "YYYY-MM-DD 또는 null",
  "price_type": "green_fee_only | all_inclusive | package",
  "green_fee": { 가격구조 JSON },
  "currency": "THB 또는 KRW",
  "includes_caddy": true/false,
  "includes_cart": true/false,
  "includes_hotel": true/false,
  "includes_meal": true/false,
  "caddy_fee": 숫자 또는 null,
  "cart_fee": 숫자 또는 null,
  "contact_kakao": "카톡ID 또는 null",
  "contact_phone": "전화번호 또는 null",
  "conditions": "특이사항 요약",
  "max_players": {"weekday": 숫자, "weekend": 숫자} 또는 null
}

파싱 규칙:
1. "(그린피, 캐디, 카트)" 모두 포함 → "all_inclusive"
2. 캐디/카트가 "별도" 또는 불포함 → "green_fee_only"
3. 숙박/식사 포함 → "package"
4. "원"/"만원" → KRW, "바트"/숫자만 → THB
5. 여러 골프장이면 배열로 모두 추출
6. 알려진 골프장 지역 매핑:
   - 알파인,로얄방파인,탄야,방사이,방콕그린벨리,나바타나 → 방콕
   - 그린우드,시암CC,레이크우드 → 파타야
   - 블랙마운틴,반얀 → 후아힌

JSON 배열만 출력하세요. 다른 텍스트는 포함하지 마세요.`;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const utterance = req.body?.userRequest?.utterance;
  const userId = req.body?.userRequest?.user?.id;

  if (!utterance) {
    return res.json(kakaoResponse("메시지를 인식하지 못했습니다. 다시 보내주세요."));
  }

  try {
    // Claude API로 파싱
    // const message = await anthropic.messages.create({
    //  model: "claude-sonnet-4-20250514",
    //  max_tokens: 2000,
    // system: SYSTEM_PROMPT,
    // messages: [{ role: "user", content: utterance }],
    // 수정 코드 (Haiku 모델로 변경)
       const message = await anthropic.messages.create({
       model: "claude-3-5-haiku-latest", // 2026년 기준 가장 빠른 모델
       max_tokens: 1000, // 토큰 수를 줄이면 더 빨라집니다
       system: SYSTEM_PROMPT,
       messages: [{ role: "user", content: utterance }],
    });

    const responseText = message.content[0].text;
    let promotions;
    
    try {
      promotions = JSON.parse(responseText);
      if (!Array.isArray(promotions)) promotions = [promotions];
    } catch (parseErr) {
      return res.json(kakaoResponse(
        "메시지를 분석하지 못했습니다.\n다시 한번 보내주시거나, 골프장명과 가격이 포함되었는지 확인해주세요."
      ));
    }

    // DB 저장
    const saved = [];
    for (const promo of promotions) {
      const { error } = await supabase
        .from("promotions")
        .insert({
          ...promo,
          raw_message: utterance,
          reported_by: userId || "unknown",
          status: "active",
        });
      if (!error) saved.push(promo);
    }

    // 응답 생성
    const summary = saved.map(formatSummary).join("\n\n---\n\n");
    const text = saved.length > 0
      ? `${saved.length}개 프로모션을 등록했습니다!\n\n${summary}`
      : "등록에 실패했습니다. 다시 시도해주세요.";

    return res.json(kakaoResponse(text));
  } catch (err) {
    console.error("Error:", err);
    return res.json(kakaoResponse(
      "처리 중 오류가 발생했습니다.\n잠시 후 다시 시도해주세요."
    ));
  }
};

function formatSummary(p) {
  const typeLabel = {
    all_inclusive: "그린피+캐디+카트",
    package: "숙박/식사 패키지",
    green_fee_only: "그린피만",
  }[p.price_type] || p.price_type;

  const curr = p.currency === "KRW" ? "원" : "바트";
  const prices = Object.entries(p.green_fee || {})
    .map(([k, v]) => {
      const label = { default: "", weekday: "주중 ", weekend: "주말 ",
        morning: "오전 ", afternoon: "오후 ",
        golfer: "골퍼 ", non_golfer: "논골퍼 ",
        wednesday: "수요일 ", weekend_afternoon: "주말오후 "
      }[k] || `${k} `;
      return `${label}${Number(v).toLocaleString()}${curr}`;
    })
    .join(" / ");

  const extras = [];
  if (p.caddy_fee) extras.push(`캐디 ${p.caddy_fee}바트`);
  if (p.cart_fee) extras.push(`카트 ${p.cart_fee}바트`);

  let text = `${p.golf_course}`;
  if (p.region) text += ` (${p.region})`;
  text += `\n${p.start_date || "미정"} ~ ${p.end_date || "미정"}`;
  text += `\n${prices}  [${typeLabel}]`;
  if (extras.length) text += `\n별도: ${extras.join(", ")}`;
  if (p.conditions) text += `\n${p.conditions}`;
  if (p.contact_kakao) text += `\n카톡: ${p.contact_kakao}`;
  if (p.contact_phone) text += `\n전화: ${p.contact_phone}`;
  return text;
}

function kakaoResponse(text) {
  return {
    version: "2.0",
    template: {
      outputs: [{ simpleText: { text } }],
    },
  };
}
