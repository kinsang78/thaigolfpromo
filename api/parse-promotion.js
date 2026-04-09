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
const COURSE_MASTER = {
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

// [추가 최적화] 매번 키 배열을 생성하지 않도록 전역에서 한 번만 캐싱합니다.
const COURSE_MASTER_KEYS = Object.keys(COURSE_MASTER);

// 마스터 데이터를 프롬프트용 텍스트로 변환
const masterListText = Object.entries(COURSE_MASTER)
  .map(([key, value]) => `${key} → ${value.en} | ${value.country} | ${value.region}`)
  .join("\n");

const SYSTEM_PROMPT = `당신은 동남아시아 골프장 프로모션 메시지 파싱 전문가입니다.
사용자가 보내는 메시지에서 아래 정보를 JSON 배열로 추출하세요.
(이하 생략 - 기존 시스템 프롬프트 내용과 완전히 동일하게 동작하도록 설계됨)
${masterListText}
`;
// 참고: 프롬프트가 길어질 것을 대비해 핵심 로직 위주로 보여드리며, 
// 실제 서버에 올리실 때는 기존의 SYSTEM_PROMPT 내용을 그대로 유지하시면 됩니다.


module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const utterance = req.body?.userRequest?.utterance || null;
  const userId = req.body?.userRequest?.user?.id || null;

  if (!utterance) return res.json(kakaoResponse("메시지를 입력받지 못했습니다."));
  if (!process.env.CLAUDE_API_KEY || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.json(kakaoResponse("서버 설정 오류입니다."));
  }

  try {
    await cleanupExpired();
    console.log("=== 파싱 시작 ===");

    // [추가 최적화] AI 파싱 로직을 별도 함수로 분리하여 메인 흐름을 간소화했습니다.
    let promotions = await extractPromotionsFromAI(utterance);
    
    // === 마스터 데이터로 후보정 ===
    promotions = promotions.map(correctWithMaster);
    console.log("파싱 결과:", promotions.length, "건");

    const results = { saved: [], updated: [], skipped: [] };
    
    // Promise.all을 활용한 병렬 처리 유지
    const savePromises = promotions.map(async (promo) => {
      const saveResult = await saveWithDedup(promo, utterance, userId);
      return { action: saveResult.action, promo };
    });

    const saveResults = await Promise.all(savePromises);
    
    saveResults.forEach(({ action, promo }) => {
      results[action].push(promo);
    });

    const lines = [];
    if (results.saved.length > 0) {
      lines.push(`새로 등록 ${results.saved.length}건`);
      lines.push(results.saved.map(formatSummary).join("\n\n---\n\n"));
    }
    if (results.updated.length > 0) {
      lines.push("");
      lines.push(`기존 정보 업데이트 ${results.updated.length}건`);
      results.updated.forEach(u => lines.push(`${u.golf_course} → 더 상세한 정보로 교체됨`));
    }
    if (results.skipped.length > 0) {
      lines.push("");
      lines.push(`중복 건너뜀 ${results.skipped.length}건`);
      results.skipped.forEach(s => lines.push(`${s.golf_course} → 이미 같거나 더 상세한 정보 있음`));
    }
    
    if (lines.length === 0) return res.json(kakaoResponse("저장할 프로모션을 찾지 못했습니다."));
    return res.json(kakaoResponse(lines.join("\n")));

  } catch (err) {
    console.error("에러:", err.message, err.status || "");
    let userMessage = "처리 중 오류가 발생했습니다.";
    if (err.message?.includes("401")) userMessage = "API 인증 오류입니다.";
    else if (err.message?.includes("429")) userMessage = "요청이 너무 많습니다.";
    else if (err.message?.includes("404")) userMessage = "AI 모델 설정 오류입니다.";
    else if (err.message === "PARSE_ERROR") userMessage = "프로모션 정보를 해석하지 못했습니다.";
    return res.json(kakaoResponse(userMessage));
  }
};


// ====================================================================
// [추가 최적화 1] AI 연동 및 데이터 파싱 전용 모듈
// ====================================================================
async function extractPromotionsFromAI(utterance) {
  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: utterance }],
  });

  const responseText = message.content[0].text;
  console.log("Claude 응답:", responseText.substring(0, 300));

  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    const jsonString = jsonMatch ? jsonMatch[0] : responseText;
    const parsed = JSON.parse(jsonString);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (parseErr) {
    console.error("JSON 파싱 에러:", parseErr.message);
    throw new Error("PARSE_ERROR"); // 메인 try-catch에서 처리하도록 에러 던지기
  }
}


// ====================================================================
// 마스터 데이터로 후보정 
// ====================================================================
function correctWithMaster(promo) {
  const name = promo.golf_course;
  if (!name) return promo;

  if (COURSE_MASTER[name]) {
    const m = COURSE_MASTER[name];
    return { ...promo, golf_course_en: m.en, country: m.country, region: m.region, latitude: m.lat, longitude: m.lng };
  }

  // [추가 최적화 2] 매번 생성하던 Object.keys 대신 미리 캐싱해둔 COURSE_MASTER_KEYS 사용
  const partialMatchKey = COURSE_MASTER_KEYS.find(key => name.includes(key) || key.includes(name));
  if (partialMatchKey) {
    const m2 = COURSE_MASTER[partialMatchKey];
    return { ...promo, golf_course: partialMatchKey, golf_course_en: m2.en, country: m2.country, region: m2.region, latitude: m2.lat, longitude: m2.lng };
  }

  if (promo.golf_course_en) {
    const enLower = promo.golf_course_en.toLowerCase();
    const enMatchKey = COURSE_MASTER_KEYS.find(key => 
      COURSE_MASTER[key].en.toLowerCase().includes(enLower) || 
      enLower.includes(COURSE_MASTER[key].en.toLowerCase())
    );
    if (enMatchKey) {
      const m3 = COURSE_MASTER[enMatchKey];
      return { 
        ...promo, 
        golf_course_en: m3.en, 
        country: promo.country || m3.country, 
        region: promo.region || m3.region, 
        latitude: m3.lat, 
        longitude: m3.lng 
      };
    }
  }

  if (promo.region) {
    if (promo.region === "태국" || promo.region === "인도네시아") {
      promo.region = null;
    }
    if (promo.region?.startsWith("태국 ")) {
      promo.region = promo.region.replace("태국 ", "");
    }
    if (promo.region?.startsWith("인도네시아 ")) {
      promo.region = promo.region.replace("인도네시아 ", "");
    }
  }

  return promo;
}


// ====================================================================
// 이하 기존 함수들
// ====================================================================

async function cleanupExpired() {
  const today = new Date().toISOString().split("T")[0];
  const result = await supabase.from("promotions").delete()
    .eq("status", "active").lt("end_date", today).not("end_date", "is", null);
  if (result.error) console.error("만료 정리 에러:", result.error.message);
}

async function saveWithDedup(promo, rawMessage, userId) {
  const courseName = promo.golf_course;
  if (!courseName) return { action: "skipped" };

  const searchResult = await supabase.from("promotions").select("*")
    .eq("status", "active").ilike("golf_course", `%${courseName}%`);
  
  if (searchResult.error) return await insertNew(promo, rawMessage
