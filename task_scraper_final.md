# 작업 지시서: agency-scraper.js 최종 수정 — HTML 직접 파싱

파일 위치: `agency-scraper.js` (프로젝트 루트)

---

## 배경

Golfdigg HTML 페이지 소스에 다음 두 패턴이 항상 존재함:
- courseId: `"course":{"id":"5b751218ef0ac89893d04186",...`
- 가격: `"greenFeeWD":"5,500","greenFeeWE":"6,500"`

슬롯 API 호출 불필요. HTML 파싱만으로 가격 수집 가능.

---

## 변경 내용

`fetchFromGolfdigg(slug)` 함수 전체를 아래로 교체한다.
`getQueryDates()` 함수는 더 이상 필요 없으므로 삭제한다.
나머지 코드는 전혀 변경하지 않는다.

---

## 교체할 함수

### 기존 코드에서 아래 두 함수를 찾아 전부 삭제:
1. `async function fetchFromGolfdigg(slug)` 전체
2. `function getQueryDates()` 전체

### 새 코드로 교체:

```js
async function fetchFromGolfdigg(slug) {
    try {
        const pageRes = await fetch(`https://golfdigg.com/en/courses/${slug}`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
            }
        });

        if (pageRes.status === 404) {
            return { ok: true, weekday: null, weekend: null, name: slugToName(slug) };
        }
        if (!pageRes.ok) {
            return { ok: false };
        }

        const html = await pageRes.text();

        // 가격 파싱: "greenFeeWD":"5,500" 또는 "greenFeeWD":"650" 형태
        const wdMatch = html.match(/"greenFeeWD"\s*:\s*"([\d,]+)"/);
        const weMatch = html.match(/"greenFeeWE"\s*:\s*"([\d,]+)"/);

        const weekday = wdMatch ? parseInt(wdMatch[1].replace(/,/g, "")) : null;
        const weekend = weMatch ? parseInt(weMatch[1].replace(/,/g, "")) : null;

        // 골프장 영문명 파싱: "course":{"id":"...","name":"NIKANTI GOLF CLUB",...
        let name = slugToName(slug);
        const courseNameMatch = html.match(/"course"\s*:\s*\{[^}]*?"name"\s*:\s*"([^"]+)"/);
        if (courseNameMatch) {
            const raw = courseNameMatch[1].trim();
            name = raw === raw.toUpperCase()
                ? raw.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
                : raw;
        }

        return { name, weekday, weekend, ok: true };

    } catch (e) {
        return { ok: false };
    }
}
```

---

## 변경 완료 후 테스트

```
node agency-scraper.js
```

정상 동작 확인 후:
```
git add agency-scraper.js
git commit -m "fix: agency-scraper HTML greenFeeWD/WE 직접 파싱으로 전환 (슬롯 API 제거)"
git push
```
