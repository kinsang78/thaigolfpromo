// ============================================================
// 타이인니 골프 프로모션 — Golfdigg 가격 수집기
//
// golf_courses 테이블에서 가격 미보유 태국 골프장만 자동 조회하여 수집
// agency_prices가 아닌 golf_courses 테이블에 직접 저장
//
// 사용법:
//   node agency-scraper.js           — 가격 미보유 건만 수집 (기본)
//   node agency-scraper.js all       — 태국 전체 골프장 가격 업데이트
//
// 환경: .env에 SUPABASE_URL, SUPABASE_SERVICE_KEY 필요
// ============================================================

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ====================================================================
// Golfdigg 슬러그 리스트 (태국 전체 — 검증 완료)
// ====================================================================
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

// ====================================================================
// 지역 자동 추정 (신규 INSERT 시 사용)
// ====================================================================
function guessRegion(slug, name) {
    const s = (slug + " " + name).toLowerCase();
    if (s.includes("phuket") || s.includes("phang")) return "푸켓";
    if (s.includes("chiangmai") || s.includes("chiang mai") || s.includes("chiang-mai") || s.includes("gassan") || s.includes("hariphunchai")) return "치앙마이";
    if (s.includes("chiang rai") || s.includes("chiangrai") || s.includes("happy-city")) return "치앙라이";
    if (s.includes("hua hin") || s.includes("cha-am") || s.includes("seapine") || s.includes("black-mountain") || s.includes("palm-hills")) return "후아힌";
    if (s.includes("pattaya") || s.includes("chonburi") || s.includes("sriracha") || s.includes("siracha") || s.includes("bangpra") || s.includes("laem-chabang")) return "파타야";
    if (s.includes("kanchanaburi")) return "칸차나부리";
    if (s.includes("khao yai") || s.includes("khao-yai") || s.includes("tosca") || s.includes("rancho-charnvee") || s.includes("mountain-creek") || s.includes("bonanza") || s.includes("kirimaya")) return "카오야이";
    if (s.includes("ayutthaya") || s.includes("wangnoi") || s.includes("bang-pa-in")) return "아유타야";
    if (s.includes("korat") || s.includes("nakhon")) return "코랏";
    if (s.includes("samui")) return "코사무이";
    if (s.includes("rayong")) return "라용";
    if (s.includes("khon kaen") || s.includes("singha-park")) return "콘깬";
    if (s.includes("bhumbibol") || s.includes("mae-mo")) return "람빵";
    if (s.includes("sirikit")) return "우타라딧";
    if (s.includes("ubon")) return "콘깬";
    if (s.includes("chulabhorn")) return "차이야품";
    if (s.includes("dancoon")) return "사콘나콘";
    return "방콕";
}

// ====================================================================
// Golfdigg RSC 수집 함수
// ====================================================================
async function fetchFromGolfdigg(slug) {
    const tokens = ["1sypa", "1gvzm", "1"];

    for (const token of tokens) {
        try {
            const url = `https://golfdigg.com/en/courses/${slug}?_rsc=${token}`;
            const res = await fetch(url, {
                headers: { "rsc": "1", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
            });
            if (!res.ok) continue;
            const text = await res.text();

            const wdMatch = text.match(/"greenFeeWD":"([\d,]+)"/);
            const weMatch = text.match(/"greenFeeWE":"([\d,]+)"/);
            if (!wdMatch && !weMatch) continue;

            const weekday = wdMatch ? parseInt(wdMatch[1].replace(/,/g, "")) : null;
            const weekend = weMatch ? parseInt(weMatch[1].replace(/,/g, "")) : null;

            // 이름 파싱
            let name = null;
            const courseMatch = text.match(/"course":\{[^}]*?"name":"([^"]+)"/);
            if (courseMatch) {
                name = courseMatch[1];
            } else {
                const nameMatch = text.match(/"name":"([^"]+)"/);
                if (nameMatch) name = nameMatch[1];
            }
            const badNames = ["viewport", "next", "locale", "en", "description"];
            if (!name || badNames.includes(name.toLowerCase())) {
                name = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
            }

            return { name, weekday, weekend, ok: true };
        } catch (e) {
            continue;
        }
    }
    return { ok: false };
}

// ====================================================================
// 메인 실행
// ====================================================================
async function main() {
    const mode = process.argv[2] || "missing";

    console.log("====================================================");
    console.log("  타이인니 골프 프로모션 — Golfdigg 가격 수집기");
    console.log("====================================================");
    console.log(`  모드: ${mode === "all" ? "전체 업데이트" : "가격 미보유 건만"}`);
    console.log(`  시간: ${new Date().toLocaleString("ko-KR")}`);
    console.log("====================================================\n");

    // DB에서 기존 golf_courses 조회
    const { data: existing, error: dbErr } = await supabase
        .from("golf_courses")
        .select("id, name_ko, name_en, golfdigg_slug, normal_weekday_am")
        .eq("country", "태국");

    if (dbErr) {
        console.error("❌ DB 조회 실패:", dbErr.message);
        return;
    }

    // 매칭 맵 생성 (slug 기준 + 영문명 정규화 기준)
    const slugMap = {};
    const nameMap = {};
    for (const c of existing) {
        if (c.golfdigg_slug) slugMap[c.golfdigg_slug] = c;
        if (c.name_en) nameMap[c.name_en.toLowerCase().replace(/[^a-z0-9]/g, "")] = c;
    }

    // 대상 slug 결정
    let targetSlugs;
    if (mode === "all") {
        targetSlugs = ALL_SLUGS;
    } else {
        // 미보유만: DB에서 가격 NULL인 골프장 + DB에 없는 slug
        targetSlugs = ALL_SLUGS.filter(slug => {
            const match = slugMap[slug];
            if (!match) return true;  // DB에 slug 매칭 없음 → 수집 시도
            return match.normal_weekday_am === null;  // 가격 없는 것만
        });
    }

    console.log(`대상: ${targetSlugs.length}개 (전체 ${ALL_SLUGS.length}개 중)\n`);

    if (targetSlugs.length === 0) {
        console.log("✅ 가격 미보유 골프장이 없습니다. 모든 데이터가 완비되어 있습니다.");
        return;
    }

    let updated = 0, inserted = 0, failed = 0, noPrice = 0;

    for (let i = 0; i < targetSlugs.length; i++) {
        const slug = targetSlugs[i];
        const result = await fetchFromGolfdigg(slug);

        if (!result.ok) {
            console.log(`  [${i+1}/${targetSlugs.length}] ❌ ${slug} — 수집 실패 (RSC 토큰 만료 가능)`);
            failed++;
            await delay(500);
            continue;
        }

        if (result.weekday === null && result.weekend === null) {
            console.log(`  [${i+1}/${targetSlugs.length}] ⚠️ ${result.name} — Golfdigg에 가격 미등록`);
            noPrice++;
            await delay(400);
            continue;
        }

        const nameKey = result.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        const match = slugMap[slug] || nameMap[nameKey];

        const priceData = {
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
        };

        if (match) {
            // 기존 골프장 → 가격만 UPDATE
            const { error } = await supabase
                .from("golf_courses")
                .update(priceData)
                .eq("id", match.id);

            if (error) {
                console.log(`  [${i+1}/${targetSlugs.length}] ❌ ${match.name_ko || result.name} — UPDATE 실패: ${error.message}`);
                failed++;
            } else {
                console.log(`  [${i+1}/${targetSlugs.length}] 🔄 ${match.name_ko || result.name} — 주중:${result.weekday} / 주말:${result.weekend}`);
                updated++;
            }
        } else {
            // DB에 없는 신규 골프장 → INSERT
            const region = guessRegion(slug, result.name);
            const { error } = await supabase
                .from("golf_courses")
                .insert({
                    name_en: result.name,
                    country: "태국",
                    region: region,
                    ...priceData,
                });

            if (error) {
                console.log(`  [${i+1}/${targetSlugs.length}] ❌ ${result.name} — INSERT 실패: ${error.message}`);
                failed++;
            } else {
                console.log(`  [${i+1}/${targetSlugs.length}] ✅ ${result.name} (${region}) — 주중:${result.weekday} / 주말:${result.weekend} [신규]`);
                inserted++;
            }
        }

        await delay(400);
    }

    console.log("\n====================================================");
    console.log("  수집 완료!");
    console.log(`  업데이트: ${updated}개 / 신규: ${inserted}개`);
    console.log(`  실패: ${failed}개 / 가격없음: ${noPrice}개`);
    console.log("  가격 기준: 그린피 (캐디·카트 별도) / 출처: Golfdigg");
    console.log("====================================================\n");
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

main();
