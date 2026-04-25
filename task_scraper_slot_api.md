# 작업 지시서: agency-scraper.js 슬롯 API 방식으로 전환

파일 위치: `agency-scraper.js` (프로젝트 루트)

---

## 변경 내용

`fetchFromGolfdigg(slug)` 함수를 아래 2단계 방식으로 교체한다.
나머지 코드(main, DB 저장, guessRegion 등)는 전혀 변경하지 않는다.

### 동작 방식
1. slug 페이지 HTML에서 `refId` 패턴으로 courseId 추출
2. courseId로 슬롯 API 호출 — 실행일 기준 8~14일 후 평일 3일 + 주말 2일 조회
3. 슬롯 목록에서 최저가 추출 → weekday/weekend 반환

---

## 기존 함수 전체 교체

아래 두 함수를 찾아서 전부 교체한다:
- `async function fetchFromGolfdigg(slug)` (전체)
- `function slugToName(slug)` (전체, 있으면)

### 새 코드

```js
async function fetchFromGolfdigg(slug) {
    try {
        // 1단계: HTML 페이지에서 courseId(refId) 추출
        const pageUrl = `https://golfdigg.com/en/courses/${slug}`;
        const pageRes = await fetch(pageUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
            }
        });

        if (!pageRes.ok) return { ok: false };

        const html = await pageRes.text();

        // courseId 추출: "refId":"55dad832e4b02c4f23055720" 패턴
        const refIdMatch = html.match(/"refId"\s*:\s*"([a-f0-9]{24})"/);
        if (!refIdMatch) {
            console.log(`    ※ courseId 추출 실패: ${slug}`);
            return { ok: false };
        }
        const courseId = refIdMatch[1];

        // 골프장 영문명 추출
        let name = slugToName(slug);
        const seoMatch = html.match(/"seoTitle"\s*:\s*"([^"]+)"/);
        if (seoMatch) {
            const raw = seoMatch[1].split("|")[0].trim();
            name = raw === raw.toUpperCase()
                ? raw.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
                : raw;
        }

        // 2단계: 조회 날짜 생성 (실행일 기준 8~14일 후)
        const dates = getQueryDates();

        // 3단계: 슬롯 API 호출 → 날짜별 최저가 수집
        let weekdayPrices = [];
        let weekendPrices = [];

        for (const { date, isWeekend } of dates) {
            await delay(300);
            try {
                const apiUrl = `https://api.golfdigg.com/golfdigg/slot/v4/list/?courseId=${courseId}&date=${date}`;
                const apiRes = await fetch(apiUrl, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                        "Accept": "application/json",
                    }
                });
                if (!apiRes.ok) continue;

                const data = await apiRes.json();
                if (!data.success || !data.model || !data.model.slots) continue;

                const slots = data.model.slots;
                if (slots.length === 0) continue;

                // NORMAL 카테고리 슬롯만 필터링, 최저가 추출
                const normalSlots = slots.filter(s =>
                    s.status === "OPEN" && s.priceCategory === "NORMAL" && s.price && s.price.price > 0
                );
                if (normalSlots.length === 0) continue;

                const minPrice = Math.min(...normalSlots.map(s => s.price.price));

                if (isWeekend) {
                    weekendPrices.push(minPrice);
                } else {
                    weekdayPrices.push(minPrice);
                }
            } catch (e) {
                continue;
            }
        }

        const weekday = weekdayPrices.length > 0
            ? Math.round(weekdayPrices.reduce((a, b) => a + b, 0) / weekdayPrices.length)
            : null;
        const weekend = weekendPrices.length > 0
            ? Math.round(weekendPrices.reduce((a, b) => a + b, 0) / weekendPrices.length)
            : null;

        return { name, weekday, weekend, ok: true };

    } catch (e) {
        return { ok: false };
    }
}

// 실행일 기준 8~14일 후 날짜 생성 (평일 3일 + 주말 2일)
function getQueryDates() {
    const dates = [];
    const now = new Date();
    let weekdayCount = 0;
    let weekendCount = 0;

    for (let i = 8; i <= 21 && (weekdayCount < 3 || weekendCount < 2); i++) {
        const d = new Date(now);
        d.setDate(now.getDate() + i);
        const dow = d.getDay(); // 0=일, 6=토
        const isWeekend = (dow === 0 || dow === 6);

        if (isWeekend && weekendCount < 2) {
            dates.push({ date: d.toISOString().split("T")[0], isWeekend: true });
            weekendCount++;
        } else if (!isWeekend && weekdayCount < 3) {
            dates.push({ date: d.toISOString().split("T")[0], isWeekend: false });
            weekdayCount++;
        }
    }
    return dates;
}

function slugToName(slug) {
    return slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
```

---

## 변경 완료 후 테스트

main() 실행 전에 아래 임시 테스트 코드를 파일 맨 아래에 추가해서 3개만 먼저 확인:

```js
// 임시 테스트 (확인 후 삭제)
async function test() {
    const slugs = ["alpine-golf-club", "rachakram-golf-club", "nikanti-golf-club"];
    for (const slug of slugs) {
        const r = await fetchFromGolfdigg(slug);
        console.log(slug, JSON.stringify(r));
        await delay(500);
    }
}
test();
```

결과 확인 후 임시 코드 삭제하고 정식 실행:
```
node agency-scraper.js
```

완료 후:
```
git add agency-scraper.js
git commit -m "fix: agency-scraper 슬롯 API 방식으로 전환 (courseId 자동 추출 + 1주일 후 날짜 조회)"
git push
```
