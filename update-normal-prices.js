// ============================================================
// Golfdigg 전체 골프장 가격 수집 + golf_courses 테이블 통합
// 실행: node update-normal-prices.js
// 
// 동작:
//   1) 120개 Golfdigg 골프장을 RSC 방식으로 수집
//   2) golf_courses에 이미 있으면 → 가격 UPDATE
//   3) 없으면 → 새로 INSERT (한글명은 매핑되는 것만)
// ============================================================

require('dotenv').config();
var supabase = require('@supabase/supabase-js').createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ====================================================================
// Golfdigg 120개 슬러그 전체 리스트
// ====================================================================
var ALL_SLUGS = [
  "nikanti-golf-club",
  "bangkok-golf-club",
  "burapha-golf-and-resort",
  "rachakram-golf-club",
  "blue-canyon-country-club-canyon-course",
  "blue-canyon-country-club-phuket-lake-course",
  "krung-kavee-golf-and-country-club-estate",
  "pinehurst-golf-and-country-club",
  "the-wangnoi",
  "rayong-green-valley-country-club",
  "treasure-hill-golf-club",
  "black-mountain-golf-club",
  "palm-hills-golf-club-and-residence",
  "seapine-golf-course",
  "lake-view-resort-and-golf-club",
  "green-valley-country-club",
  "bangsai-country-club",
  "the-vintage-club",
  "phoenix-gold-golf-and-country-club-pattaya",
  "katathong-golf-resort-and-spa",
  "krungthep-kreetha-golf-course",
  "alpine-golf-club",
  "muang-kaew-golf-club",
  "summit-windmill-golf-club",
  "thana-city-country-club",
  "panya-indra-golf-club",
  "lotus-valley-golf-resort",
  "the-royal-golf-and-country-club",
  "suwan-golf-and-country-club",
  "flora-ville-golf-and-country-club",
  "cascata-golf-club",
  "the-rg-city-golf-club",
  "bangpakong-riverside-country-club",
  "royal-lakeside-golf-club",
  "siam-country-club-old-course",
  "siam-country-club-plantation",
  "siam-country-club-waterside",
  "siam-country-club-rolling-hills",
  "pattavia-century-golf-club",
  "pleasant-valley-golf-and-country-club",
  "khao-kheow-country-club",
  "mountain-shadow-golf-club",
  "crystal-bay-golf-club",
  "pattaya-country-club",
  "phoenix-gold-golf-bangkok",
  "unico-grande-golf-course",
  "royal-bang-pa-in-golf-club",
  "ayutthaya-golf-club",
  "legacy-golf-club",
  "thanont-golf-view-sport-club",
  "royal-gems-golf-and-sports-club",
  "royal-gems-golf-city",
  "navatanee-golf-course",
  "river-dale-golf-club",
  "lam-luk-ka-country-club",
  "thai-country-club",
  "amata-spring-country-club",
  "cheevalee-golf-resort",
  "pattana-sports-resort",
  "parichat-international-golf-links",
  "bangpra-golf-club",
  "the-royal-gems-golf-city-dream-6",
  "greenwood-golf-resort",
  "siracha-international-golf-club",
  "the-wangnoi-ayutthaya",
  "bangkok-golf-club-night-golf",
  "le-bali-golf-resort-spa",
  "chatrium-golf-resort-soi-dao",
  "grand-prix-golf-club",
  "blue-sapphire-golf-leisure-resort",
  "nichigo-resort-country-club",
  "mission-hills-kanchanaburi-golf-club-resort",
  "evergreen-hills-golf-club-and-resort",
  "dynasty-golf-and-country-club",
  "khao-cha-ngum-golf-club",
  "panama-golf-club",
  "royal-ratchaburi-golf-club",
  "phunaka-golf-course",
  "phuket-country-club",
  "red-mountain-golf-club",
  "loch-palm-golf-club",
  "laguna-golf-phuket",
  "mission-hills-phuket-golf-resort",
  "aquella-golf-resort-country-club",
  "santiburi-samui-country-club",
  "rajjaprabha-dam-golf-course",
  "ranong-kraburi-golf-club",
  "gassan-khuntan-golf-and-resort",
  "gassan-legacy-golf-club",
  "gassan-panorama-golf-club",
  "chiangmai-highlands-golf-resort-spa",
  "alpine-golf-resort-chiangmai",
  "summit-green-valley-chiangmai-country-club",
  "mae-jo-golf-resort-spa",
  "royal-chiangmai-golf-resort",
  "north-hill-chiang-mai-golf",
  "chiangmai-inthanon-golf-resort",
  "gold-canyon-country-club",
  "lanna-golf-course",
  "hariphunchai-golf-club",
  "khao-yai-country-club",
  "tosca-valley-country-club",
  "rancho-charnvee-resort-country-club",
  "mountain-creek-golf-resort-residences",
  "bonanza-golf-and-country-club",
  "kirimaya-golf-resort-spa",
  "panorama-golf-and-country-club",
  "korat-country-club-golf-and-resort",
  "sirikit-dam-golf-course",
  "victory-park-golf-country-club",
  "ubon-ratana-dam-golf-course",
  "singha-park-khon-kaen-golf-club",
  "dancoon-golf-club",
  "chulabhorn-dam-golf-course",
  "bhumbibol-dam-golf-course",
  "mae-mo-golf-course",
  "victory-park-golf-club",
  "santiburi-country-club-chiang-rai",
  "waterford-valley-chiangrai",
  "happy-city-golf-and-resort",
];

// ====================================================================
// 한글명 매핑 (기존 COURSE_MASTER 기준 + golfdigg_slug)
// ====================================================================
var KOREAN_NAMES = {
  "alpine-golf-club": "알파인",
  "royal-bang-pa-in-golf-club": "로얄방파인",
  "the-vintage-club": "더 빈티지 클럽",
  "legacy-golf-club": "레가시",
  "ekachai-golf-and-country-club": "에카차이",
  "krung-kavee-golf-and-country-club-estate": "크룽까비",
  "grand-prix-golf-club": "그랑프리 CC",
  "bangpakong-riverside-country-club": "방파콩리버사이드",
  "green-valley-country-club": "방콕그린벨리",
  "thanya-golf-club": "탄야",
  "bangsai-country-club": "방사이",
  "navatanee-golf-course": "나바타나",
  "lake-view-resort-and-golf-club": "레이크뷰",
  "suwan-golf-and-country-club": "수파부룩",
  "lakewood-country-club": "레이크우드",
  "muang-ake-vista-golf-course": "무앙엑",
  "uniland-golf-and-country-club": "유니랜드",
  "khao-kheow-country-club": "캥카찬",
  "eastern-star-country-club-golf-course": "이스턴스타",
  "greenwood-golf-resort": "그린우드",
  "crystal-bay-golf-club": "크리스탈베이",
  "siam-country-club-old-course": "시암CC",
  "ayutthaya-golf-club": "아유타야 골프클럽",
  "gassan-legacy-golf-club": "가산 레거시",
  "gassan-panorama-golf-club": "가산 파노라마",
  "khao-yai-country-club": "카오야이CC",
  "siam-country-club-rolling-hills": "롤링힐스",
  "siam-country-club-plantation": "플랜테이션",
  "siam-country-club-waterside": "워터사이드",
};

// 지역 추정 (슬러그 키워드 기반)
function guessRegion(slug, courseName) {
  var s = (slug + " " + courseName).toLowerCase();
  if (s.indexOf("phuket") !== -1) return "푸켓";
  if (s.indexOf("chiangmai") !== -1 || s.indexOf("chiang mai") !== -1 || s.indexOf("chiang-mai") !== -1) return "치앙마이";
  if (s.indexOf("chiang rai") !== -1 || s.indexOf("chiangrai") !== -1) return "치앙라이";
  if (s.indexOf("hua hin") !== -1 || s.indexOf("cha-am") !== -1 || s.indexOf("seapine") !== -1) return "후아힌";
  if (s.indexOf("pattaya") !== -1 || s.indexOf("chonburi") !== -1 || s.indexOf("sriracha") !== -1 || s.indexOf("siracha") !== -1 || s.indexOf("bangpra") !== -1) return "파타야";
  if (s.indexOf("kanchanaburi") !== -1) return "칸차나부리";
  if (s.indexOf("khao yai") !== -1 || s.indexOf("khao-yai") !== -1) return "카오야이";
  if (s.indexOf("ayutthaya") !== -1 || s.indexOf("wangnoi") !== -1 || s.indexOf("bang-pa-in") !== -1) return "아유타야";
  if (s.indexOf("korat") !== -1 || s.indexOf("nakhon-ratchasima") !== -1) return "코랏";
  if (s.indexOf("samui") !== -1) return "코사무이";
  if (s.indexOf("rayong") !== -1) return "라용";
  if (s.indexOf("gassan") !== -1 || s.indexOf("lamphun") !== -1 || s.indexOf("hariphunchai") !== -1) return "치앙마이";
  if (s.indexOf("khon kaen") !== -1 || s.indexOf("khon-kaen") !== -1 || s.indexOf("singha-park") !== -1) return "콘깬";
  // 기본: 방콕 (대부분의 골프장이 방콕 근교)
  return "방콕";
}


// ====================================================================
// Golfdigg RSC 수집
// ====================================================================
async function fetchGolfdigg(slug) {
  var tokens = ["1sypa", "1gvzm", "1"];
  
  for (var t = 0; t < tokens.length; t++) {
    try {
      var url = "https://golfdigg.com/en/courses/" + slug + "?_rsc=" + tokens[t];
      var res = await fetch(url, {
        headers: { "rsc": "1", "User-Agent": "Mozilla/5.0" }
      });
      if (!res.ok) continue;
      var text = await res.text();

      // 가격 파싱
      var wdMatch = text.match(/"greenFeeWD":"([\d,]+)"/);
      var weMatch = text.match(/"greenFeeWE":"([\d,]+)"/);
      if (!wdMatch && !weMatch) continue;

      var weekday = wdMatch ? parseInt(wdMatch[1].replace(/,/g, "")) : null;
      var weekend = weMatch ? parseInt(weMatch[1].replace(/,/g, "")) : null;

      // 코스 이름
      var nameMatch = text.match(/"course":\{[^}]*?"name":"([^"]+)"/) ||
                      text.match(/"name":"([^"]+)"/);
      var name = nameMatch ? nameMatch[1] : slug.replace(/-/g, " ");
      if (["viewport", "next", "description"].indexOf(name.toLowerCase()) !== -1) {
        name = slug.replace(/-/g, " ");
      }

      return { name: name, weekday: weekday, weekend: weekend, ok: true };
    } catch (e) {
      continue;
    }
  }
  return { ok: false };
}


// ====================================================================
// 메인
// ====================================================================
async function main() {
  console.log("=== Golfdigg 전체 가격 수집 시작 (" + ALL_SLUGS.length + "개) ===\n");

  // 기존 golf_courses 조회 (golfdigg_slug 또는 name_en으로 매칭)
  var { data: existing } = await supabase.from("golf_courses").select("id, name_ko, name_en, golfdigg_slug");
  var existMap = {};
  if (existing) {
    existing.forEach(function(c) {
      if (c.golfdigg_slug) existMap[c.golfdigg_slug] = c;
      if (c.name_en) existMap[c.name_en.toLowerCase().replace(/[^a-z0-9]/g, "")] = c;
    });
  }

  var updated = 0, inserted = 0, failed = 0;

  for (var i = 0; i < ALL_SLUGS.length; i++) {
    var slug = ALL_SLUGS[i];
    var result = await fetchGolfdigg(slug);

    if (!result.ok) {
      console.log("[" + (i+1) + "] ❌ " + slug + " — 수집 실패");
      failed++;
      await delay(500);
      continue;
    }

    var koName = KOREAN_NAMES[slug] || null;
    var region = guessRegion(slug, result.name);

    // 기존 매칭 확인: slug 또는 영문명 정규화
    var nameKey = result.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    var match = existMap[slug] || existMap[nameKey];

    if (match) {
      // 기존 레코드 업데이트 (가격만)
      var { error } = await supabase.from("golf_courses").update({
        golfdigg_slug: slug,
        normal_weekday_am: result.weekday,
        normal_weekday_pm: result.weekday,
        normal_weekend_am: result.weekend,
        normal_weekend_pm: result.weekend,
        normal_price_includes: "green_fee_only",
        normal_price_source: "golfdigg",
        normal_price_currency: "THB",
        normal_price_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", match.id);

      if (error) {
        console.log("[" + (i+1) + "] ❌ " + result.name + " UPDATE 실패: " + error.message);
        failed++;
      } else {
        console.log("[" + (i+1) + "] 🔄 " + (match.name_ko || result.name) + " — WD:" + result.weekday + " / WE:" + result.weekend);
        updated++;
      }
    } else {
      // 신규 INSERT
      var { error } = await supabase.from("golf_courses").insert({
        name_ko: koName,
        name_en: result.name,
        country: "태국",
        region: region,
        golfdigg_slug: slug,
        normal_weekday_am: result.weekday,
        normal_weekday_pm: result.weekday,
        normal_weekend_am: result.weekend,
        normal_weekend_pm: result.weekend,
        normal_price_includes: "green_fee_only",
        normal_price_source: "golfdigg",
        normal_price_currency: "THB",
        normal_price_updated_at: new Date().toISOString(),
      });

      if (error) {
        console.log("[" + (i+1) + "] ❌ " + result.name + " INSERT 실패: " + error.message);
        failed++;
      } else {
        console.log("[" + (i+1) + "] ✅ " + (koName || result.name) + " — WD:" + result.weekday + " / WE:" + result.weekend + " [신규]");
        inserted++;
      }
    }

    await delay(400);
  }

  console.log("\n=== 수집 완료 ===");
  console.log("업데이트: " + updated + " / 신규: " + inserted + " / 실패: " + failed);
  console.log("가격 기준: 그린피 기준 (캐디·카트 별도) / 출처: Golfdigg");
}

function delay(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

main();
