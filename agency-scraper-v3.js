// ============================================================
// 타이인니 골프 프로모션 — Golfdigg 실제 가격 수집기 v3.1
//
// [수정 이력]
// v3.0: slot API 전환 (응답 key 오해로 슬롯 0개 문제)
// v3.1: 실제 응답 구조 반영 (json.model.slots)
//       + success 플래그 체크
//       + caddySetting.priceBase 폴백 추가
//
// 사용법:
//   node agency-scraper-v3.js dry        — 샘플 3개로 API 응답 확인
//   node agency-scraper-v3.js all        — 전체 재수집 (권장)
//   node agency-scraper-v3.js missing    — 가격 미보유분만
//   node agency-scraper-v3.js test <slug> — 특정 골프장 1개만 테스트
//
// 환경: .env에 SUPABASE_URL, SUPABASE_SERVICE_KEY 필요
// ============================================================

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ====================================================================
// API 설정
// ====================================================================
const LIST_API = "https://api3.golfdigg.com/api/course/all/pageable";
const SLOT_API = "https://api.golfdigg.com/golfdigg/slot/v4/list/";
const PAGE_SIZE = 50;
const LIST_DELAY_MS = 300;
const SLOT_DELAY_MS = 400;

const COMMON_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://golfdigg.com",
    "Referer": "https://golfdigg.com/",
};

// ====================================================================
// 지역 매핑
// ====================================================================
const PROVINCE_TO_REGION = {
    "bangkok": "방콕", "nonthaburi": "방콕", "pathum thani": "방콕",
    "samut prakan": "방콕", "samut sakhon": "방콕", "nakhon pathom": "방콕",
    "chonburi": "파타야", "rayong": "라용",
    "prachuabkirikhan": "후아힌", "prachuap khiri khan": "후아힌", "phetchaburi": "후아힌",
    "ayutthaya": "아유타야", "phra nakhon si ayutthaya": "아유타야",
    "saraburi": "카오야이", "nakhon nayok": "카오야이", "prachin buri": "카오야이",
    "phuket": "푸켓", "phang nga": "푸켓",
    "krabi": "끄라비", "surat thani": "코사무이",
    "chiang mai": "치앙마이", "chiangmai": "치앙마이", "lamphun": "치앙마이",
    "chiang rai": "치앙라이", "chiangrai": "치앙라이",
    "lampang": "람빵", "khon kaen": "콘깬", "nakhon ratchasima": "코랏",
    "kanchanaburi": "칸차나부리", "chachoengsao": "방콕",
    "ranong": "라농", "songkhla": "핫야이",
    "ubon ratchathani": "우본", "udon thani": "우돈타니",
    "chaiyaphum": "차이야품", "sakon nakhon": "사콘나콘",
    "tak": "딱", "uttaradit": "우타라딧", "phitsanulok": "핏사눌록",
};

const CITY_OVERRIDE = {
    "hua hin": "후아힌", "cha-am": "후아힌", "cha am": "후아힌",
    "pak chong": "카오야이", "pakchong": "카오야이",
    "samui": "코사무이", "ko samui": "코사무이", "koh samui": "코사무이",
    "pattaya": "파타야", "sriracha": "파타야", "siracha": "파타야",
    "bang saen": "파타야", "ban chang": "라용",
};

function parseLocation(locationStr) {
    if (!locationStr) return { region: "기타" };
    const parts = locationStr.split("-").map(s => s.trim());
    const city = (parts[0] || "").toLowerCase();
    const province = (parts[parts.length - 1] || "").toLowerCase();
    for (const key in CITY_OVERRIDE) {
        if (city.includes(key)) return { region: CITY_OVERRIDE[key] };
    }
    if (PROVINCE_TO_REGION[province]) return { region: PROVINCE_TO_REGION[province] };
    for (const key in PROVINCE_TO_REGION) {
        if (province.includes(key)) return { region: PROVINCE_TO_REGION[key] };
    }
    return { region: "기타" };
}

// ====================================================================
// 날짜 유틸 — 다음 화요일/토요일
// ====================================================================
function getNextWeekday(targetDay) {
    const today = new Date();
    const day = today.getDay();
    let diff = targetDay - day;
    if (diff < 1) diff += 7;
    const t = new Date(today);
    t.setDate(today.getDate() + diff);
    const yyyy = t.getFullYear();
    const mm = String(t.getMonth() + 1).padStart(2, "0");
    const dd = String(t.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

// ====================================================================
// 코스 리스트 수집
// ====================================================================
async function fetchAllCourses() {
    const all = [];
    let page = 0, totalPages = 1;
    console.log("📡 Golfdigg allCourse API에서 전체 코스 리스트 조회 중...");
    while (page < totalPages) {
        const url = `${LIST_API}?page=${page}&size=${PAGE_SIZE}`;
        try {
            const res = await fetch(url, { headers: COMMON_HEADERS });
            if (!res.ok) { console.error(`  ❌ page=${page} 실패: ${res.status}`); break; }
            const json = await res.json();
            if (page === 0) {
                totalPages = json.totalPages;
                console.log(`  총 ${json.totalElements}개 / ${totalPages}페이지`);
            }
            all.push(...(json.content || []));
            page++;
            await delay(LIST_DELAY_MS);
        } catch (e) {
            console.error(`  ❌ page=${page}: ${e.message}`); break;
        }
    }
    console.log(`✅ 리스트 수집 완료: ${all.length}개\n`);
    return all;
}

// ====================================================================
// 슬롯 API 호출 — 실제 응답 구조: { success, status, model: { slots: [...] } }
// ====================================================================
async function fetchSlots(courseId, date, retryLeft = 1) {
    const url = `${SLOT_API}?courseId=${courseId}&date=${date}`;
    try {
        const res = await fetch(url, { headers: COMMON_HEADERS });
        if (!res.ok) {
            if (retryLeft > 0) { await delay(1000); return fetchSlots(courseId, date, retryLeft - 1); }
            return { ok: false, slots: [], status: res.status };
        }
        const json = await res.json();

        // API가 success:false를 반환하면 에러
        if (json?.success !== true) {
            return { ok: false, slots: [], error: `API success=false (status=${json?.status})` };
        }

        // 실제 응답 구조: model.slots
        const slots = Array.isArray(json?.model?.slots) ? json.model.slots : [];
        return { ok: true, slots };
    } catch (e) {
        if (retryLeft > 0) { await delay(1000); return fetchSlots(courseId, date, retryLeft - 1); }
        return { ok: false, slots: [], error: e.message };
    }
}

// ====================================================================
// 슬롯 1개의 올인가격(그린피+카트+캐디) 계산
// ====================================================================
function calcAllInclusive(slot) {
    if (!slot || !slot.price) return null;
    let total = Number(slot.price.price) || 0;
    if (total <= 0) return null;

    // freeCart=true → 카트비가 이미 price.price에 포함. 추가 안 함.
    if (!slot.freeCart && slot.cartSetting) {
        const cart = slot.cartSetting.priceSale
                  ?? slot.cartSetting.priceOriginal
                  ?? 0;
        total += Number(cart) || 0;
    }
    // freeCaddy=true → 캐디비가 이미 포함.
    // caddySetting은 priceSale / priceOriginal / priceBase 3단계 폴백
    if (!slot.freeCaddy && slot.caddySetting) {
        const caddy = slot.caddySetting.priceSale
                   ?? slot.caddySetting.priceOriginal
                   ?? slot.caddySetting.priceBase
                   ?? 0;
        total += Number(caddy) || 0;
    }
    return total;
}

// startDateString에서 현지 시각의 hour 추출
// "2026-04-27T07:38:00+0700" → 7
function getLocalHour(slot) {
    const s = slot?.startDateString || "";
    const m = s.match(/T(\d{2}):/);
    return m ? parseInt(m[1]) : null;
}

// 최빈값 — 같은 시간대 여러 슬롯 가운데 대표값 산출
function modeOf(arr) {
    if (!arr.length) return null;
    const counts = new Map();
    arr.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
    let best = null, bestCount = 0;
    counts.forEach((c, v) => { if (c > bestCount) { best = v; bestCount = c; } });
    return best;
}

// ====================================================================
// 시간대별 대표가격 추출
// ====================================================================
function extractPrice(slots, timeOfDay) {
    const normal = slots.filter(s => s.priceCategory === "NORMAL");
    const hourRange = timeOfDay === "am" ? [6, 10] : [11, 15];

    const filtered = normal.filter(s => {
        const h = getLocalHour(s);
        return h !== null && h >= hourRange[0] && h <= hourRange[1];
    });

    if (filtered.length === 0) {
        // 해당 시간대 슬롯 없으면 전체 NORMAL에서 최빈값으로 폴백
        if (normal.length === 0) return null;
        const prices = normal.map(calcAllInclusive).filter(p => p !== null);
        return prices.length ? modeOf(prices) : null;
    }

    const prices = filtered.map(calcAllInclusive).filter(p => p !== null);
    return prices.length ? modeOf(prices) : null;
}

// ====================================================================
// 코스 정규화
// ====================================================================
function normalizeCourse(raw) {
    if (raw.type && raw.type !== "COURSE") return null;
    const hasGolfTag = Array.isArray(raw.tags) && raw.tags.some(t => (t.name || "").toLowerCase() === "golf");
    if (!hasGolfTag) return null;
    const slug = raw.slugUrl;
    if (!slug || !raw.id) return null;

    const rawName = (raw.title || "").trim();
    const nameEn = rawName === rawName.toUpperCase()
        ? rawName.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
        : rawName;

    const { region } = parseLocation(raw.location);
    return {
        golfdiggId: raw.id,
        slug,
        nameEn,
        location: raw.location,
        region,
        latitude: raw.latitude ? parseFloat(raw.latitude) : null,
        longitude: raw.longitude ? parseFloat(raw.longitude) : null,
    };
}

// ====================================================================
// 코스 1개의 실제 가격 수집
// ====================================================================
async function collectPriceForCourse(course, weekdayDate, weekendDate) {
    const wdRes = await fetchSlots(course.golfdiggId, weekdayDate);
    await delay(SLOT_DELAY_MS);
    const weRes = await fetchSlots(course.golfdiggId, weekendDate);

    const wdAm = wdRes.ok ? extractPrice(wdRes.slots, "am") : null;
    const weAm = weRes.ok ? extractPrice(weRes.slots, "am") : null;
    const wePm = weRes.ok ? extractPrice(weRes.slots, "pm") : null;

    return {
        weekday_am: wdAm,
        weekday_pm: wdAm,            // 태국 평일은 오전/오후 구분 거의 없음
        weekend_am: weAm,
        weekend_pm: wePm || weAm,    // 주말 오후 슬롯 없으면 오전값 폴백
        slotCounts: { wd: wdRes.slots.length, we: weRes.slots.length },
        errors: { wd: wdRes.error, we: weRes.error },
    };
}

// ====================================================================
// 메인
// ====================================================================
async function main() {
    const mode = process.argv[2] || "all";
    const testSlug = mode === "test" ? process.argv[3] : null;

    const weekdayDate = getNextWeekday(2);
    const weekendDate = getNextWeekday(6);

    console.log("====================================================");
    console.log("  타이인니 골프 프로모션 — Slot API 실제가격 수집기 v3.1");
    console.log("====================================================");
    console.log(`  모드: ${mode}${testSlug ? ` (slug=${testSlug})` : ""}`);
    console.log(`  평일 조회일: ${weekdayDate} (화요일)`);
    console.log(`  주말 조회일: ${weekendDate} (토요일)`);
    console.log(`  실행 시각: ${new Date().toLocaleString("ko-KR")}`);
    console.log("====================================================\n");

    const rawCourses = await fetchAllCourses();
    if (rawCourses.length === 0) { console.error("❌ API 응답 비어있음"); return; }

    let courses = rawCourses.map(normalizeCourse).filter(Boolean);
    console.log(`📊 유효 골프 코스: ${courses.length}개\n`);

    // test 모드
    if (mode === "test") {
        if (!testSlug) { console.error("❌ test 모드는 slug 인자 필요"); return; }
        courses = courses.filter(c => c.slug === testSlug);
        if (courses.length === 0) { console.error(`❌ slug=${testSlug} 못 찾음`); return; }
        const c = courses[0];
        console.log(`[테스트] ${c.nameEn} (${c.region})`);
        console.log(`  slug=${c.slug}, courseId=${c.golfdiggId}`);
        const res = await collectPriceForCourse(c, weekdayDate, weekendDate);
        console.log(`  슬롯 수: 평일 ${res.slotCounts.wd} / 주말 ${res.slotCounts.we}`);
        if (res.errors.wd) console.log(`  평일 에러: ${res.errors.wd}`);
        if (res.errors.we) console.log(`  주말 에러: ${res.errors.we}`);
        console.log(`  평일: ${res.weekday_am ?? "-"} THB`);
        console.log(`  주말: 오전 ${res.weekend_am ?? "-"} / 오후 ${res.weekend_pm ?? "-"} THB`);
        return;
    }

    // dry 모드
    if (mode === "dry") {
        console.log("--- dry 모드: 샘플 3개 slot API 확인 ---\n");
        for (const c of courses.slice(0, 3)) {
            console.log(`[${c.nameEn}] (${c.region})`);
            const res = await collectPriceForCourse(c, weekdayDate, weekendDate);
            console.log(`  슬롯: 평일 ${res.slotCounts.wd} / 주말 ${res.slotCounts.we}`);
            console.log(`  평일: ${res.weekday_am ?? "-"} / 주말AM: ${res.weekend_am ?? "-"} / 주말PM: ${res.weekend_pm ?? "-"} THB\n`);
            await delay(SLOT_DELAY_MS);
        }
        return;
    }

    // DB 기존 조회
    const { data: existing, error: dbErr } = await supabase
        .from("golf_courses")
        .select("id, name_ko, name_en, golfdigg_slug, normal_weekday_am")
        .eq("country", "태국");
    if (dbErr) { console.error("❌ DB 조회 실패:", dbErr.message); return; }

    const slugMap = {}, nameMap = {};
    for (const c of existing) {
        if (c.golfdigg_slug) slugMap[c.golfdigg_slug] = c;
        if (c.name_en) nameMap[normalizeNameKey(c.name_en)] = c;
    }

    // 대상 결정
    let targets = courses;
    if (mode === "missing") {
        targets = courses.filter(c => {
            const match = slugMap[c.slug] || nameMap[normalizeNameKey(c.nameEn)];
            return !match || match.normal_weekday_am === null;
        });
    }

    const estimatedMinutes = Math.ceil(targets.length * 2 * SLOT_DELAY_MS / 1000 / 60);
    console.log(`🎯 수집 대상: ${targets.length}개 (slot API 호출 = ${targets.length * 2}회)`);
    console.log(`   예상 소요 시간: 약 ${estimatedMinutes}분\n`);

    let updated = 0, inserted = 0, failed = 0, noPrice = 0;

    for (let i = 0; i < targets.length; i++) {
        const c = targets[i];
        const prefix = `  [${i + 1}/${targets.length}]`;
        const res = await collectPriceForCourse(c, weekdayDate, weekendDate);

        if (res.weekday_am === null && res.weekend_am === null) {
            console.log(`${prefix} ⚠️ ${c.nameEn} — 슬롯/가격 없음 (평일 ${res.slotCounts.wd}/주말 ${res.slotCounts.we})`);
            noPrice++;
            await delay(SLOT_DELAY_MS);
            continue;
        }

        const match = slugMap[c.slug] || nameMap[normalizeNameKey(c.nameEn)];
        const priceData = {
            golfdigg_slug: c.slug,
            normal_weekday_am: res.weekday_am,
            normal_weekday_pm: res.weekday_pm,
            normal_weekend_am: res.weekend_am,
            normal_weekend_pm: res.weekend_pm,
            normal_price_includes: "green_fee_caddy_cart",
            normal_price_source: "golfdigg",
            normal_price_currency: "THB",
            normal_price_updated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        const priceStr = `평일:${res.weekday_am ?? "-"} / 주말AM:${res.weekend_am ?? "-"} / PM:${res.weekend_pm ?? "-"}`;

        if (match) {
            const { error } = await supabase.from("golf_courses").update(priceData).eq("id", match.id);
            if (error) { console.log(`${prefix} ❌ ${match.name_ko || c.nameEn} UPDATE 실패: ${error.message}`); failed++; }
            else { console.log(`${prefix} 🔄 ${match.name_ko || c.nameEn} — ${priceStr}`); updated++; }
        } else {
            const { error } = await supabase.from("golf_courses").insert({
                name_en: c.nameEn,
                country: "태국",
                region: c.region,
                latitude: c.latitude,
                longitude: c.longitude,
                ...priceData,
            });
            if (error) { console.log(`${prefix} ❌ ${c.nameEn} INSERT 실패: ${error.message}`); failed++; }
            else { console.log(`${prefix} ✅ ${c.nameEn} (${c.region}) — ${priceStr} [신규]`); inserted++; }
        }

        await delay(SLOT_DELAY_MS);
    }

    console.log("\n====================================================");
    console.log("  수집 완료!");
    console.log(`  업데이트: ${updated}개 / 신규: ${inserted}개`);
    console.log(`  실패: ${failed}개 / 슬롯 없음: ${noPrice}개`);
    console.log(`  가격: 그린피+카트+캐디 올인가 (NORMAL) / 출처: Golfdigg slot API`);
    console.log(`  조회: 평일 ${weekdayDate} / 주말 ${weekendDate}`);
    console.log("====================================================\n");
}

function normalizeNameKey(s) { return (s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(e => { console.error("치명적 에러:", e); process.exit(1); });
