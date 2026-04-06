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
  // POST 요청만 허용
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const utterance = req.body?.userRequest?.utterance;
  const userId = req.body?.userRequest?.user?.id;

  if (!utterance) {
    return res.json(kakaoResponse("메시지를 입력받지 못했습니다."));
  }

  // ===== 디버깅: 환경변수 확인 =====
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

    // 2. JSON 추출 (Claude가 텍스트를 섞어 보낼 경우 대비)
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

    // 3. Supabase DB 저장
    const saved = [];
    const errors = [];

    for (const promo of promotions) {
      const { data, error } = await supabase.from("promotions").insert({
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
        raw_message: utterance,
        reported_by: userId || "kakao_user",
        status: "active",
      }).select();

      if (error) {
        console.error("DB 저장 에러:", error.message, "| 데이터:", JSON.stringify(promo).substring(0, 100));
        errors.push(error.message);
      } else {
        saved.push(promo);
      }
    }

    console.log("저장 완료:", saved.length, "건 / 에러:", errors.length, "건");

    // 4. 카카오톡 응답 생성
    if (saved.length > 0) {
      const summary = saved.map(formatSummary).join("\n\n---\n\n");
      return res.json(kakaoResponse(`${saved.length}건 등록 완료!\n\n${summary}`));
    } else {
      const errMsg = errors.length > 0
        ? `DB 저장 오류: ${errors[0]}`
        : "저장할 프로모션을 찾지 못했습니다.";
      return res.json(kakaoResponse(errMsg));
    }

  } catch (err) {
    // ===== 상세 에러 로그 =====
    console.error("=== 에러 발생 ===");
    console.error("에러 타입:", err.constructor.name);
    console.error("에러 메시지:", err.message);
    if (err.status) console.error("HTTP 상태:", err.status);
    if (err.error) console.error("API 에러:", JSON.stringify(err.error));
    console.error("스택:", err.stack);

    // 에러 유형별 사용자 메시지
    let userMessage = "처리 중 오류가 발생했습니다.";
    if (err.message?.includes("401") || err.message?.includes("auth")) {
      userMessage = "API 인증 오류입니다. 관리자에게 문의해주세요.";
    } else if (err.message?.includes("429") || err.message?.includes("rate")) {
      userMessage = "요청이 너무 많습니다. 1분 후 다시 시도해주세요.";
    } else if (err.message?.includes("timeout") || err.message?.includes("ETIMEDOUT")) {
      userMessage = "응답 시간이 초과되었습니다. 메시지를 짧게 나눠서 보내보세요.";
    } else if (err.message?.includes("model")) {
      userMessage = "AI 모델 설정 오류입니다. 관리자에게 문의해주세요.";
    }

    return res.json(kakaoResponse(userMessage));
  }
};

// 요약 포맷 함수
function formatSummary(p) {
  const typeLabel = {
    all_inclusive: "올인클루시브",
    package: "패키지",
    green_fee_only: "그린피만",
  }[p.price_type] || p.price_type;

  const curr = p.currency === "KRW" ? "원" : "바트";
  const prices = p.green_fee
    ? Object.entries(p.green_fee)
        .map(([k, v]) => {
          const label = {
            default: "", weekday: "주중 ", weekend: "주말 ",
            morning: "오전 ", afternoon: "오후 ",
            golfer: "골퍼 ", non_golfer: "논골퍼 ",
            wednesday: "수요일 ",
          }[k] || "";
          return `${label}${Number(v).toLocaleString()}${curr}`;
        })
        .join(" / ")
    : "가격정보없음";

  const extras = [];
  if (p.includes_caddy) extras.push("캐디포함");
  if (p.includes_cart) extras.push("카트포함");
  if (p.includes_hotel) extras.push("숙박포함");
  if (p.includes_meal) extras.push("식사포함");
  if (p.caddy_fee) extras.push(`캐디${p.caddy_fee}바트별도`);
  if (p.cart_fee) extras.push(`카트${p.cart_fee}바트별도`);

  let text = `${p.golf_course}`;
  if (p.region) text += ` (${p.region})`;
  text += `\n${p.start_date || "미정"} ~ ${p.end_date || "미정"}`;
  text += `\n${prices} [${typeLabel}]`;
  if (extras.length) text += `\n${extras.join(", ")}`;
  if (p.conditions) text += `\n${p.conditions}`;
  if (p.contact_kakao) text += `\n카톡: ${p.contact_kakao}`;
  if (p.contact_phone) text += `\n전화: ${p.contact_phone}`;
  return text;
}

// 카카오 기본 응답 포맷
function kakaoResponse(text) {
  return {
    version: "2.0",
    template: {
      outputs: [{ simpleText: { text } }],
    },
  };
}
