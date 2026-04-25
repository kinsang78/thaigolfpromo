// ============================================================
// 51개 가격 미등록 코스 목록 추출 (DB 조회만, 네트워크 X)
//
// 사용법: node list-missing.js
// ============================================================

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// agency-scraper.js와 동일한 ALL_SLUGS 리스트
const ALL_SLUGS = [
    "nikanti-golf-club", "bangkok-golf-club", "burapha-golf-and-resort", "rachakram-golf-club",
    "blue-canyon-country-club-canyon-course", "blue-canyon-country-club-phuket-lake-course",
    "krung-kavee-golf-country-club-estate", "pinehurst-golf-country-club", "the-wangnoi",
    "rayong-green-valley-country-club", "treasure-hill-golf-club", "black-mountain-golf-club",
    "palm-hills-golf-club-and-residence", "seapine-golf-course", "lake-view-resort-golf-club",
    "green-valley-country-club", "bangsai-country-club", "the-vintage-club",
    "phoenix-gold-golf-and-country-club-pattaya", "katathong-golf-resort-spa", "krungthep-kreetha-golf-course",
    "alpine-golf-club", "legacy-golf-club", "muang-kaew-golf-club", "thanont-golf-view-sport-club",
    "royal-gems-golf-and-sports-club", "royal-gems-golf-city", "summit-windmill-golf-club",
    "thana-city-country-club", "navatanee-golf-course", "panya-indra-golf-club", "river-dale-golf-club",
    "lotus-valley-golf-resort", "the-royal-golf-country-club", "lam-luk-ka-country-club", "suwan-golf-country-club",
    "flora-ville-golf-country-club", "cascata-golf-club", "the-rg-city-golf-club", "bangpakong-riverside-country-club",
    "royal-lakeside-golf-club", "thai-country-club", "amata-spring-country-club", "siam-country-club-old-course",
    "siam-country-club-plantation", "siam-country-club-waterside", "siam-country-club-rolling-hills",
    "cheevalee-golf-resort", "pattana-sports-resort", "parichat-international-golf-links", "pattavia-century-golf-club",
    "pleasant-valley-golf-country-club", "khao-kheow-country-club", "mountain-shadow-golf-club",
    "bangpra-golf-club", "crystal-bay-golf-club", "pattaya-country-club", "phoenix-gold-golf-bangkok",
    "unico-grande-golf-course", "the-royal-gems-golf-city-dream-6", "royal-bang-pa-in-golf-club",
    "ayutthaya-golf-club", "greenwood-golf-resort", "siracha-international-golf-club", "the-wangnoi-ayutthaya",
    "bangkok-golf-club-night-golf", "le-bali-golf-resort-spa", "chatrium-golf-resort-soi-dao",
    "grand-prix-golf-club", "blue-sapphire-golf-leisure-resort", "nichigo-resort-country-club",
    "mission-hills-kanchanaburi-golf-club-resort", "evergreen-hills-golf-club-resort",
    "dynasty-golf-country-club", "khao-cha-ngum-golf-club", "panama-golf-club", "royal-ratchaburi-golf-club",
    "phunaka-golf-course", "phuket-country-club", "red-mountain-golf-club", "loch-palm-golf-club",
    "laguna-golf-phuket", "mission-hills-phuket-golf-resort", "aquella-golf-resort-country-club",
    "santiburi-samui-country-club", "rajjaprabha-dam-golf-course", "ranong-kraburi-golf-club",
    "gassan-khuntan-golf-resort", "gassan-legacy-golf-club", "gassan-panorama-golf-club",
    "chiangmai-highlands-golf-resort-spa", "alpine-golf-resort-chiangmai", "summit-green-valley-chiangmai-country-club",
    "mae-jo-golf-resort-spa", "royal-chiangmai-golf-resort", "north-hill-chiang-mai-golf",
    "chiangmai-inthanon-golf-resort", "gold-canyon-country-club", "lanna-golf-course",
    "hariphunchai-golf-club", "khao-yai-country-club", "tosca-valley-country-club", "rancho-charnvee-resort-country-club",
    "mountain-creek-golf-resort-residences", "bonanza-golf-country-club", "kirimaya-golf-resort-spa",
    "panorama-golf-and-country-club", "korat-country-club-golf-resort", "sirikit-dam-golf-course",
    "victory-park-golf-country-club", "ubon-ratana-dam-golf-course", "singha-park-khon-kaen-golf-club",
    "dancoon-golf-club", "chulabhorn-dam-golf-course", "bhumbibol-dam-golf-course",
    "mae-mo-golf-course", "victory-park-golf-club", "santiburi-country-club-chiang-rai",
    "waterford-valley-chiangrai", "happy-city-golf-resort"
];

async function main() {
    console.log(`전체 슬러그: ${ALL_SLUGS.length}개\n`);

    const { data: existing, error } = await supabase
        .from("golf_courses")
        .select("id, name_ko, name_en, golfdigg_slug, normal_weekday_am, region")
        .eq("country", "태국");

    if (error) {
        console.error("DB 조회 실패:", error.message);
        return;
    }

    const slugMap = {};
    existing.forEach(c => {
        if (c.golfdigg_slug) slugMap[c.golfdigg_slug] = c;
    });

    const noPriceInDB = [];       // DB에 있음 + 가격 NULL
    const notInDB = [];            // DB에 slug 매칭 없음
    const hasPriceInDB = [];       // DB에 있음 + 가격 있음 (참고용)

    ALL_SLUGS.forEach(slug => {
        const match = slugMap[slug];
        if (!match) {
            notInDB.push(slug);
        } else if (match.normal_weekday_am === null) {
            noPriceInDB.push({ slug, name: match.name_ko || match.name_en, region: match.region });
        } else {
            hasPriceInDB.push({ slug, name: match.name_ko || match.name_en, price: match.normal_weekday_am });
        }
    });

    console.log("====================================================");
    console.log(`  [A] DB에 있으나 가격 NULL: ${noPriceInDB.length}개`);
    console.log("====================================================");
    noPriceInDB.forEach((c, i) => {
        console.log(`  ${String(i+1).padStart(2)}. ${c.slug.padEnd(48)} | ${c.name || "-"} (${c.region || "-"})`);
    });

    console.log("\n====================================================");
    console.log(`  [B] DB에 slug 매칭 없음 (신규 후보): ${notInDB.length}개`);
    console.log("====================================================");
    notInDB.forEach((slug, i) => {
        console.log(`  ${String(i+1).padStart(2)}. ${slug}`);
    });

    console.log("\n====================================================");
    console.log(`  요약`);
    console.log("====================================================");
    console.log(`  [A] 가격없음 코스: ${noPriceInDB.length}개`);
    console.log(`  [B] DB에 없는 slug: ${notInDB.length}개`);
    console.log(`  합계 (51개 가격없음 해당): ${noPriceInDB.length + notInDB.length}개`);
    console.log(`  [C] 이미 가격 보유: ${hasPriceInDB.length}개 (참고)`);
}

main();
