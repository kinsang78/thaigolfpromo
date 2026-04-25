# 작업 지시서: agency-scraper.js 새 방식으로 전환

파일 위치: `agency-scraper.js` (프로젝트 루트)

---

## 변경 내용: fetchFromGolfdigg 함수만 교체

기존 RSC 방식(`?_rsc=`) 대신, 일반 HTML 페이지에서 직접 파싱하는 방식으로 변경.
페이지 소스에 `"greenFeeWD":"650","greenFeeWE":"1300"` 형태로 가격이 포함되어 있음.
나머지 코드(main, DB 저장, guessRegion 등)는 전혀 변경하지 않음.

---

## 기존 함수 (전체 교체)

아래 함수를 찾아서:

```js
async function fetchFromGolfdigg(slug) {
    const tokens = ["1sypa", "1gvzm", "1"];

    for (const token of tokens) {
        try {
            const url = `https://golfdigg.com/en/courses/${slug}?_rsc=${token}`;
```

(함수 끝 `}` 까지 전부)

---

## 새 함수로 교체

```js
async function fetchFromGolfdigg(slug) {
    try {
        const url = `https://golfdigg.com/en/courses/${slug}`;
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
            }
        });

        if (!res.ok) {
            return { ok: false };
        }

        const text = await res.text();

        // 가격 파싱: "greenFeeWD":"650" 또는 "greenFeeWD":650 형태
        const wdMatch = text.match(/"greenFeeWD"\s*:\s*"?([\d,]+)"?/);
        const weMatch = text.match(/"greenFeeWE"\s*:\s*"?([\d,]+)"?/);

        if (!wdMatch && !weMatch) {
            return { ok: true, weekday: null, weekend: null, name: slugToName(slug) };
        }

        const weekday = wdMatch ? parseInt(wdMatch[1].replace(/,/g, "")) : null;
        const weekend = weMatch ? parseInt(weMatch[1].replace(/,/g, "")) : null;

        // 골프장 영문명 파싱: seoTitle 또는 name 필드에서
        let name = null;
        const seoMatch = text.match(/"seoTitle"\s*:\s*"([^"]+)"/);
        if (seoMatch) {
            // "ALPINE GOLF CLUB | อัลไพน์ กอล์ฟ คลับ" → "Alpine Golf Club" 형태로 정제
            name = seoMatch[1].split("|")[0].trim();
            name = name.replace(/\s+/g, " ").trim();
            // 전부 대문자면 Title Case로 변환
            if (name === name.toUpperCase()) {
                name = name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
            }
        }
        if (!name) {
            name = slugToName(slug);
        }

        return { name, weekday, weekend, ok: true };

    } catch (e) {
        return { ok: false };
    }
}

// slug를 사람이 읽기 좋은 이름으로 변환 (fallback용)
function slugToName(slug) {
    return slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
```

---

## 변경 완료 후 테스트

아래 명령어로 테스트 실행 (가격 미보유 건만):
```
node agency-scraper.js
```

정상 동작 확인 후:
```
git add agency-scraper.js
git commit -m "fix: agency-scraper RSC 방식 → HTML 직접 파싱으로 전환"
git push
```
