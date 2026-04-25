// ============================================================
// 51개 가격 미등록 슬러그의 Golfdigg 실제 상태 진단
//
// 각 slug에 대해:
//   - HTTP 상태 (200 / 404 / 기타)
//   - 페이지 존재 여부 (영문명 파싱 여부)
//   - 가격 존재 여부
//   - DB 매칭 여부 (영문명으로)
//
// 사용법: node diagnose-missing.js
// ============================================================

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// 51개 대상 slug (list-missing.js 결과)
const TARGET_SLUGS = [
    // [A] DB 있음 + 가격 NULL (2개)
    "navatanee-golf-course", "greenwood-golf-resort",
    // [B] DB 미연결 slug (49개)
    "legacy-golf-club", "thanont-golf-view-sport-club",
    "royal-gems-golf-and-sports-club", "royal-gems-golf-city", "river-dale-golf-club",
    "lam-luk-ka-country-club", "thai-country-club", "amata-spring-country-club",
    "cheevalee-golf-resort", "pattana-sports-resort", "parichat-international-golf-links",
    "bangpra-golf-club", "the-royal-gems-golf-city-dream-6", "siracha-international-golf-club",
    "the-wangnoi-ayutthaya", "bangkok-golf-club-night-golf", "le-bali-golf-resort-spa",
    "chatrium-golf-resort-soi-dao", "blue-sapphire-golf-leisure-resort",
    "nichigo-resort-country-club", "mission-hills-kanchanaburi-golf-club-resort",
    "khao-cha-ngum-golf-club", "panama-golf-club", "phunaka-golf-course",
    "phuket-country-club", "aquella-golf-resort-country-club",
    "rajjaprabha-dam-golf-course", "ranong-kraburi-golf-club",
    "chiangmai-highlands-golf-resort-spa", "alpine-golf-resort-chiangmai",
    "mae-jo-golf-resort-spa", "royal-chiangmai-golf-resort", "north-hill-chiang-mai-golf",
    "chiangmai-inthanon-golf-resort", "gold-canyon-country-club", "lanna-golf-course",
    "hariphunchai-golf-club", "tosca-valley-country-club", "rancho-charnvee-resort-country-club",
    "mountain-creek-golf-resort-residences", "sirikit-dam-golf-course",
    "victory-park-golf-country-club", "ubon-ratana-dam-golf-course",
    "chulabhorn-dam-golf-course", "bhumbibol-dam-golf-course", "mae-mo-golf-course",
    "victory-park-golf-club", "santiburi-country-club-chiang-rai",
    "waterford-valley-chiangrai"
];

async function fetchPage(slug) {
    try {
        const res = await fetch(`https://golfdigg.com/en/courses/${slug}`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            }
        });

        if (res.status === 404) return { status: 404 };
        if (!res.ok) return { status: res.status };

        const html = await res.text();

        const wdMatch = html.match(/\\?"greenFeeWD\\?"\s*:\s*\\?"([\d,]+)\\?"/);
        const weMatch = html.match(/\\?"greenFeeWE\\?"\s*:\s*\\?"([\d,]+)\\?"/);
        const nameMatch = html.match(/\\?"course\\?"\s*:\s*\{[^}]*?\\?"name\\?"\s*:\s*\\?"([^"\\]+)\\?"/);

        // "가격 미공개" 같은 다른 패턴 탐색 (진단용)
        const hasPriceOnRequest = html.includes("Price on request") || html.includes("가격 문의");
        const hasClosedMsg = html.includes("Temporarily Closed") || html.includes("Closed");

        return {
            status: 200,
            htmlSize: html.length,
            name: nameMatch ? nameMatch[1].trim() : null,
            weekday: wdMatch ? wdMatch[1] : null,
            weekend: weMatch ? weMatch[1] : null,
            priceOnRequest: hasPriceOnRequest,
            closed: hasClosedMsg,
        };
    } catch (e) {
        return { status: "ERR", error: e.message };
    }
}

function normalize(s) {
    return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function main() {
    console.log(`\n진단 대상: ${TARGET_SLUGS.length}개\n`);

    // DB에서 영문명 전체 로드 (매칭용)
    const { data: courses, error } = await supabase
        .from("golf_courses")
        .select("id, name_ko, name_en, golfdigg_slug")
        .eq("country", "태국");

    if (error) { console.error("DB 에러:", error.message); return; }

    const nameMap = {};
    courses.forEach(c => {
        if (c.name_en) nameMap[normalize(c.name_en)] = c;
    });

    const categories = {
        real404: [],
        hasPrice: [],
        priceOnRequest: [],
        closed: [],
        validNoPrice: [],
        otherError: [],
    };

    for (let i = 0; i < TARGET_SLUGS.length; i++) {
        const slug = TARGET_SLUGS[i];
        const result = await fetchPage(slug);

        let line = `[${String(i+1).padStart(2)}/${TARGET_SLUGS.length}] ${slug.padEnd(48)} `;

        if (result.status === 404) {
            line += "❌ 404 (페이지 없음)";
            categories.real404.push(slug);
        } else if (result.status !== 200) {
            line += `⚠️ HTTP ${result.status}`;
            categories.otherError.push(slug);
        } else {
            const nameKey = normalize(result.name);
            const dbMatch = nameMap[nameKey];
            const dbInfo = dbMatch ? ` [DB일치: ${dbMatch.name_ko || dbMatch.name_en}]` : " [DB 매칭 없음]";

            if (result.weekday || result.weekend) {
                line += `✅ ${result.name} — WD:${result.weekday} / WE:${result.weekend}${dbInfo}`;
                categories.hasPrice.push({ slug, name: result.name, wd: result.weekday, we: result.weekend, dbMatch });
            } else if (result.priceOnRequest) {
                line += `💬 ${result.name} — 가격 문의${dbInfo}`;
                categories.priceOnRequest.push({ slug, name: result.name, dbMatch });
            } else if (result.closed) {
                line += `🔒 ${result.name} — Closed${dbInfo}`;
                categories.closed.push({ slug, name: result.name, dbMatch });
            } else {
                line += `⚠️ ${result.name} — 가격 정보 없음${dbInfo}`;
                categories.validNoPrice.push({ slug, name: result.name, dbMatch });
            }
        }

        console.log(line);
        await new Promise(r => setTimeout(r, 500));
    }

    // ========== 요약 ==========
    console.log("\n==================================================");
    console.log("  진단 요약");
    console.log("==================================================");
    console.log(`  ❌ 404 페이지 없음              : ${categories.real404.length}개`);
    console.log(`  ✅ 가격 있음 (스크립트 버그?)    : ${categories.hasPrice.length}개`);
    console.log(`  💬 Price on request             : ${categories.priceOnRequest.length}개`);
    console.log(`  🔒 Closed                       : ${categories.closed.length}개`);
    console.log(`  ⚠️ 페이지 존재 + 가격 진짜 없음 : ${categories.validNoPrice.length}개`);
    console.log(`  ⚠️ 기타 에러                    : ${categories.otherError.length}개`);

    if (categories.hasPrice.length > 0) {
        console.log("\n--- 🚨 가격 있는데 놓친 것들 (조치 필요) ---");
        categories.hasPrice.forEach(c => {
            console.log(`  ${c.slug} | ${c.name} | WD:${c.wd} WE:${c.we} | DB: ${c.dbMatch ? (c.dbMatch.name_ko || c.dbMatch.name_en) : "없음"}`);
        });
    }

    if (categories.real404.length > 0) {
        console.log("\n--- ❌ 404 (ALL_SLUGS에서 제거 권장) ---");
        categories.real404.forEach(s => console.log(`  ${s}`));
    }

    console.log("\n진단 완료\n");
}

main();
