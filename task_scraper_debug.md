# 작업 지시서: agency-scraper.js 디버그 로그 추가

파일 위치: `agency-scraper.js` (프로젝트 루트)

---

## 목적

실제로 Golfdigg 서버가 어떤 응답을 주는지 확인한다.
HTML이 정상인지, 가격 패턴이 있는지 등을 직접 눈으로 봐야 한다.

---

## 작업: 파일 맨 아래에 디버그 코드 추가

기존 `main()` 함수 호출은 **주석 처리**하고, 아래 디버그 함수를 추가 실행.

### 기존 코드 (파일 맨 아래)
```js
main();
```

### 수정 후
```js
// main();  // 임시 주석 처리
debugTest();

async function debugTest() {
    const slugs = [
        "alpine-golf-club",
        "nikanti-golf-club",
        "bangkok-golf-club",
        "rachakram-golf-club"
    ];

    for (const slug of slugs) {
        console.log("\n========================================");
        console.log("SLUG:", slug);
        console.log("========================================");

        try {
            const res = await fetch(`https://golfdigg.com/en/courses/${slug}`, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.5",
                }
            });

            console.log("Status:", res.status);
            console.log("Content-Type:", res.headers.get("content-type"));

            const html = await res.text();
            console.log("HTML 길이:", html.length);

            // 패턴 1: greenFeeWD
            const wdMatch = html.match(/"greenFeeWD"\s*:\s*"([\d,]+)"/);
            console.log("greenFeeWD:", wdMatch ? wdMatch[1] : "없음");

            // 패턴 2: greenFeeWE
            const weMatch = html.match(/"greenFeeWE"\s*:\s*"([\d,]+)"/);
            console.log("greenFeeWE:", weMatch ? weMatch[1] : "없음");

            // 패턴 3: course id
            const idMatch = html.match(/"course"\s*:\s*\{[^}]*?"id"\s*:\s*"([a-f0-9]{24})"/);
            console.log("course id:", idMatch ? idMatch[1] : "없음");

            // 패턴 4: seoTitle (참고)
            const seoMatch = html.match(/"seoTitle"\s*:\s*"([^"]+)"/);
            console.log("seoTitle:", seoMatch ? seoMatch[1].substring(0, 50) : "없음");

            // HTML 일부 출력 (처음 300자)
            console.log("HTML 앞부분:", html.substring(0, 300).replace(/\n/g, " "));

            // 혹시 cloudflare 차단 페이지인지 확인
            if (html.includes("Cloudflare") || html.includes("cf-browser-verification") || html.includes("Just a moment")) {
                console.log("⚠️ Cloudflare 차단 페이지 감지됨!");
            }

            // greenFee라는 문자열이 HTML에 존재하는지만 확인
            console.log("'greenFee' 포함 여부:", html.includes("greenFee"));

        } catch (e) {
            console.log("에러:", e.message);
        }

        await new Promise(r => setTimeout(r, 1000));
    }
}
```

---

## 실행 후

결과 전부 복사해서 공유해줘. 특히:
- `Status` 값
- `HTML 길이`
- `greenFeeWD`, `greenFeeWE`, `course id` 가 "없음"인지 값이 나오는지
- `Cloudflare 차단 페이지 감지됨!` 메시지가 뜨는지

**⚠️ 이 작업 후 git 커밋/push 하지 마세요.** 확인용 디버그 코드이므로 이후 원상복구 예정.
