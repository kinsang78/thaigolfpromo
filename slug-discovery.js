// ============================================================
// Golfdigg 전체 슬러그 재수집
//
// 여러 리스팅 페이지를 크롤해서 /en/courses/{slug} 패턴을 추출
// 현재 ALL_SLUGS와 비교해서 신규/변경/제거 대상을 출력
//
// 사용법: node slug-discovery.js
// ============================================================

// 현재 ALL_SLUGS (agency-scraper.js와 동일)
const CURRENT_SLUGS = [
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

// 크롤 대상 URL 리스트 (리스팅/프로모션 페이지)
const DISCOVERY_URLS = [
    "https://golfdigg.com/en",
    "https://golfdigg.com/en/hotdeals",
    "https://golfdigg.com/en/promotion",
    "https://golfdigg.com/en/courses",
    "https://golfdigg.com/en/golfdigg-today",
    "https://golfdigg.com/en/night-golf",
    // 지역별 (여러 패턴 시도)
    "https://golfdigg.com/en/search",
    "https://golfdigg.com/en/search?location=bangkok",
    "https://golfdigg.com/en/search?location=pattaya",
    "https://golfdigg.com/en/search?location=hua-hin",
    "https://golfdigg.com/en/search?location=phuket",
    "https://golfdigg.com/en/search?location=chiangmai",
    "https://golfdigg.com/en/search?location=khao-yai",
    "https://golfdigg.com/en/search?location=ayutthaya",
    "https://golfdigg.com/en/search?location=kanchanaburi",
    "https://golfdigg.com/en/search?location=rayong",
    // 카테고리
    "https://golfdigg.com/en/search?category=thailand",
    "https://golfdigg.com/en/courses?country=thailand",
];

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
};

async function fetchAndExtract(url) {
    try {
        const res = await fetch(url, { headers: HEADERS });
        if (!res.ok) return { url, status: res.status, slugs: [], size: 0 };

        const html = await res.text();

        // /en/courses/{slug} 패턴 추출 (영숫자 + 하이픈)
        const slugs = new Set();
        const pattern = /\/en\/courses\/([a-z0-9][a-z0-9-]*[a-z0-9])(?=[?#"'\s/\\]|$)/g;
        let m;
        while ((m = pattern.exec(html)) !== null) {
            // 너무 짧거나 명백히 잘못된 슬러그 제거
            if (m[1].length >= 5 && !m[1].includes("..")) {
                slugs.add(m[1]);
            }
        }

        return { url, status: res.status, slugs: Array.from(slugs), size: html.length };
    } catch (e) {
        return { url, error: e.message, slugs: [], size: 0 };
    }
}

async function main() {
    console.log("====================================================");
    console.log("  Golfdigg 슬러그 재수집");
    console.log("====================================================\n");

    const allFound = new Set();
    const sourceMap = {};  // slug -> [urls where found]

    for (const url of DISCOVERY_URLS) {
        const result = await fetchAndExtract(url);
        const sizeKb = Math.round(result.size / 1024);
        const statusTxt = result.status || `ERR(${result.error || "?"})`;
        console.log(`  [${statusTxt}] ${url.padEnd(62)} ${sizeKb}KB — ${result.slugs.length}개`);

        result.slugs.forEach(s => {
            allFound.add(s);
            if (!sourceMap[s]) sourceMap[s] = [];
            sourceMap[s].push(url);
        });

        await new Promise(r => setTimeout(r, 500));
    }

    console.log("");

    // ========== 비교 분석 ==========
    const currentSet = new Set(CURRENT_SLUGS);
    const foundArr = [...allFound].sort();

    const newSlugs = foundArr.filter(s => !currentSet.has(s));
    const missingFromSite = CURRENT_SLUGS.filter(s => !allFound.has(s)).sort();
    const common = CURRENT_SLUGS.filter(s => allFound.has(s));

    console.log("====================================================");
    console.log("  분석 결과");
    console.log("====================================================");
    console.log(`  Golfdigg에서 발견된 전체: ${allFound.size}개`);
    console.log(`  현재 ALL_SLUGS: ${CURRENT_SLUGS.length}개`);
    console.log(`  양쪽 일치: ${common.length}개`);
    console.log(`  🆕 Golfdigg에만 있음 (추가 대상): ${newSlugs.length}개`);
    console.log(`  ❌ 현재 ALL_SLUGS에만 있음 (제거/변경 대상): ${missingFromSite.length}개`);

    console.log("\n====================================================");
    console.log("  🆕 신규 슬러그 (ALL_SLUGS에 추가할 것들)");
    console.log("====================================================");
    newSlugs.forEach(s => {
        console.log(`  "${s}",`);
    });

    console.log("\n====================================================");
    console.log("  ❌ 제거/변경 대상 (Golfdigg에서 보이지 않는 기존 슬러그)");
    console.log("====================================================");
    missingFromSite.forEach(s => {
        // 현재 ALL_SLUGS 단어의 일부가 신규 슬러그에 포함되면 "변경 후보"로 표시
        const words = s.split("-").filter(w => w.length >= 4);
        const similar = newSlugs.filter(ns => {
            return words.some(w => ns.includes(w));
        });
        if (similar.length > 0) {
            console.log(`  ${s}`);
            console.log(`    → 유사: ${similar.join(", ")}`);
        } else {
            console.log(`  ${s}  (유사한 것 없음, 제거 후보)`);
        }
    });

    console.log("\n--- 완료 ---\n");
}

main();
