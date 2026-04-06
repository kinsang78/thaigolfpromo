const Anthropic = require("@anthropic-ai/sdk");
const { createClient } = require("@supabase/supabase-js");

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SYSTEM_PROMPT = `당신은 동남아시아 골프장 프로모션 분석 전문가입니다. 텍스트나 이미지(배너)에서 정보를 추출하세요.

지역 및 국가 분류 규칙 (매우 중요):
1. 국가(country):
   - 인도네시아: 자카르타, 보고르, 찌까랑, 땅그랑, 발리, 빈탄, 바탐 등 지명이 있거나 '루피아(Rp)' 단위를 쓰면 '인도네시아'.
   - 태국: 방콕, 파타야, 치앙마이 등 지명이 있거나 '바트' 단위를 쓰면 '태국'. (명시 없으면 기본 '태국')
2. 지역(region):
   - 태국 방콕: 플로라빌, 크룽카비, 알파인, 로얄방파인, 탄야, 방사이, 나바타나, 스완, 타이스, 카스카타, 람룩카, 판야인드라 등 (빠툼타니, 논타부리 포함)
   - 태국 파타야: 시암, 람차방, 치찬, 그린우드, 파타비아, 트레져힐 등
   - 인도네시아: 자카르타, 발리, 보고르 등 본문에 언급된 지역

추출 형식 (JSON 배열):
[{
  "country": "태국|인도네시아",
  "golf_course": "한글명",
  "golf_course_en": "영문명",
  "region": "상세 지역명",
  "start_date": "YYYY-MM-DD 또는 null",
  "end_date": "YYYY-MM-DD 또는 null",
  "price_type": "green_fee_only | all_inclusive | package",
  "green_fee": { "weekday": 2000, "weekend": 3000 },
  "currency": "THB | KRW | IDR",
  "includes_caddy": true/false,
  "includes_cart": true/false,
  "includes_hotel": true/false,
  "includes_meal": true/false,
  "caddy_fee": 숫자 또는 null,
  "cart_fee": 숫자 또는 null,
  "conditions": "특이사항 요약 (예: 송크란, 스포츠데이 등)",
  "contact_kakao": "ID",
  "contact_phone": "번호"
}]

규칙:
1. 반드시 JSON 배열만 출력하세요.
2. (그린피,캐디,카트) 포함이면 "all_inclusive", 별도면 "green_fee_only"
3. 화폐 단위: "원/만원"은 KRW, "바트"는 THB, "루피아/Rp"는 IDR로 표기하세요.`;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const utterance = req.body?.userRequest?.utterance;
  // 카카오톡 이미지 업로드 시 전달되는 URL 추출 (기본 폴백 및 플러그인 대응)
  const imageUrl = req.body?.action?.detailParams?.secureimage?.origin || req.body?.action?.params?.sys_image_url || null;
  const userId = req.body?.userRequest?.user?.id;

  if (!utterance && !imageUrl) {
    return res.json(kakaoResponse("텍스트나 배너 이미지를 보내주세요."));
  }

  try {
    let content = [];
    
    // 이미지 처리 로직 (확장자 유연성 확보)
    if (imageUrl) {
      const base64Image = await getBase64FromUrl(imageUrl);
      const isPng = imageUrl.toLowerCase().includes('.png');
      const mediaType = isPng ? "image/png" : "image/jpeg";
      
      content.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: base64Image },
      });
      content.push({ type: "text", text: "이 이미지의 프로모션 정보를 분석해줘." });
    } else {
      // 텍스트 처리 로직 (혹시 utterance 자체가 이미지 URL인 경우 대응)
      if (utterance.startsWith('http')) {
        const base64Image = await getBase64FromUrl(utterance);
        const isPng = utterance.toLowerCase().includes('.png');
        const mediaType = isPng ? "image/png" : "image/jpeg";
        
        content.push({
          type: "image",
          source: { type: "base64", media_type: mediaType, data: base64Image },
        });
        content.push({ type: "text", text: "이 이미지의 프로모션 정보를 분석해줘." });
      } else {
        content.push({ type: "text", text: utterance });
      }
    }

    // Claude API 호출 (가장 빠르고 Vision 지원하는 Haiku 최신 모델)
    const message = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 2000,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: content }],
    });

    const responseText = message.content[0].text;
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    
    // AI 환각 방어를 위한 파싱 로직 강화
    let promotions = [];
    try {
      promotions = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
    } catch (parseErr) {
      console.error("JSON 파싱 에러:", responseText);
      return res.json(kakaoResponse("AI가 프로모션 정보를 정확히 읽지 못했습니다. 이미지가 너무 복잡하거나 글자가 잘 안 보일 수 있습니다."));
    }

    const results = { saved: [], updated: [], skipped: [] };

    for (const promo of promotions) {
      const saveResult = await saveWithSmartDedup(promo, utterance || "Image Upload", userId);
      results[saveResult.action].push(promo);
    }

    if (results.saved.length === 0 && results.updated.length === 0) {
      return res.json(kakaoResponse("새로 등록할 프로모션이 없거나 모두 중복입니다."));
    }

    let msg = `✅ 분석 완료\n\n`;
    if (results.saved.length > 0) msg += `[신규 등록]\n` + results.saved.map(formatSummary).join('\n\n') + `\n\n`;
    if (results.updated.length > 0) msg += `[기존 업데이트]\n` + results.updated.map(formatSummary).join('\n\n') + `\n\n`;
    if (results.skipped.length > 0) msg += `(중복 제외: ${results.skipped.length}건)`;

    return res.json(kakaoResponse(msg.trim()));

  } catch (err) {
    console.error(err);
    return res.json(kakaoResponse("분석 중 오류가 발생했습니다. (이미지 용량이 너무 크거나 5초를 초과했을 수 있습니다.)"));
  }
};

// 스마트 중복 검사 (기간이 겹쳐도 조건/국가가 다르면 별개 저장)
async function saveWithSmartDedup(promo, raw, uid) {
  if (!promo.golf_course) return { action: "skipped" };

  const { data: existing } = await supabase
    .from("promotions")
    .select("*")
    .eq("status", "active")
    .ilike("golf_course", `%${promo.golf_course}%`);

  if (!existing || existing.length === 0) return await insertNew(promo, raw, uid);

  // 기간이 겹치는 기존 프로모션 찾기
  const overlapping = existing.filter(ex => {
    const isDateOverlap = datesOverlap(ex, promo);
    const isSameCondition = (ex.conditions || "") === (promo.conditions || "");
    const isSamePriceType = ex.price_type === promo.price_type;
    // 날짜, 조건, 가격타입이 모두 같아야만 중복으로 간주!
    return isDateOverlap && isSameCondition && isSamePriceType;
  });

  if (overlapping.length === 0) return await insertNew(promo, raw, uid);

  // 겹치면 최신 정보로 덮어쓰기 (Update 로직 단순화)
  const bestId = overlapping[0].id;
  await supabase.from("promotions").update({ ...promo, raw_message: raw, updated_at: new Date().toISOString() }).eq("id", bestId);
  return { action: "updated" };
}

async function insertNew(promo, raw, uid) {
  const { error } = await supabase.from("promotions").insert({
    ...promo, raw_message: raw, reported_by: uid || "system", status: "active"
  });
  return error ? { action: "skipped" } : { action: "saved" };
}

function datesOverlap(ex, incoming) {
  if (!ex.start_date || !incoming.start_date) return true;
  const exEnd = ex.end_date ? new Date(ex.end_date) : new Date("2099-12-31");
  const inStart = new Date(incoming.start_date);
  return new Date(ex.start_date) <= (incoming.end_date ? new Date(incoming.end_date) : new Date("2099-12-31")) && exEnd >= inStart;
}

// 이미지 처리를 위한 Helper
async function getBase64FromUrl(url) {
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer).toString('base64');
}

// 요약 출력 포맷 (진행/종료 상태 및 국가/화폐 반영)
function formatSummary(p) {
  // 타임존을 태국/인도네시아(UTC+7 방콕 기준)로 맞춰서 정확한 '오늘' 날짜 구하기
  const todayStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" });
  const tzDate = new Date(todayStr);
  const today = `${tzDate.getFullYear()}-${String(tzDate.getMonth() + 1).padStart(2, '0')}-${String(tzDate.getDate()).padStart(2, '0')}`;

  const isExpired = p.end_date && p.end_date < today;
  const statusLabel = isExpired ? "🔴 [종료]" : "🟢 [진행중]";

  let curr = "바트";
  if (p.currency === "KRW") curr = "원";
  if (p.currency === "IDR") curr = "루피아";

  const typeLabel = { all_inclusive: "올인클루시브", package: "패키지", green_fee_only: "그린피만" }[p.price_type] || p.price_type;

  let prices = "가격정보없음";
  if (p.green_fee) {
    const labelMap = { default: "", weekday: "주중 ", weekend: "주말 " };
    prices = Object.entries(p.green_fee).map(([k, v]) => `${labelMap[k] || k + " "}${Number(v).toLocaleString()} ${curr}`).join(" / ");
  }

  let text = `${statusLabel} [${p.country || '태국'}] ${p.golf_course} (${p.region || '기타'})\n`;
  text += `📅 ${p.start_date || '시작일미정'} ~ ${p.end_date || '종료일미정'}\n`;
  text += `💰 ${prices} [${typeLabel}]\n`;
  if (p.conditions) text += `📝 조건: ${p.conditions}`;
  return text;
}

function kakaoResponse(text) {
  return { version: "2.0", template: { outputs: [{ simpleText: { text } }] } };
}
