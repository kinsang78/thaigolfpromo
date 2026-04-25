// ============================================================
// agency-scraper.js 정규식 수정이 제대로 동작하는지 확인하는
// 단건 테스트 스크립트 (DB 저장 없음, 화면 출력만)
//
// 사용법: node test-alpine.js
// ============================================================

async function fetchFromGolfdigg(slug) {
    const pageRes = await fetch(`https://golfdigg.com/en/courses/${slug}`, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        }
    });

    console.log(`[${slug}] HTTP Status: ${pageRes.status}`);

    if (!pageRes.ok) {
        console.log("  ❌ HTTP 에러");
        return;
    }

    const html = await pageRes.text();
    console.log(`  HTML 크기: ${html.length.toLocaleString()} bytes`);

    // greenFee 문자열이 HTML에 있는지 확인
    const hasGreenFee = html.includes('greenFee');
    console.log(`  'greenFee' 문자열 존재: ${hasGreenFee}`);

    // 실제 주변 문자열 출력 (진단용)
    const idx = html.indexOf('greenFeeWD');
    if (idx !== -1) {
        console.log(`  주변 문자열: ${html.substring(idx - 5, idx + 60)}`);
    }

    // 정규식 매칭
    const wdMatch = html.match(/\\?"greenFeeWD\\?"\s*:\s*\\?"([\d,]+)\\?"/);
    const weMatch = html.match(/\\?"greenFeeWE\\?"\s*:\s*\\?"([\d,]+)\\?"/);
    const nameMatch = html.match(/\\?"course\\?"\s*:\s*\{[^}]*?\\?"name\\?"\s*:\s*\\?"([^"\\]+)\\?"/);

    console.log(`  주중가격 매칭: ${wdMatch ? wdMatch[1] : "❌ NULL"}`);
    console.log(`  주말가격 매칭: ${weMatch ? weMatch[1] : "❌ NULL"}`);
    console.log(`  골프장명 매칭: ${nameMatch ? nameMatch[1] : "❌ NULL"}`);
    console.log("");
}

async function main() {
    console.log("=== Golfdigg 파싱 테스트 ===\n");

    // 가격 있는 것으로 알려진 샘플
    await fetchFromGolfdigg("alpine-golf-club");
    await fetchFromGolfdigg("black-mountain-golf-club");

    // 이전에 가격 미등록이던 샘플
    await fetchFromGolfdigg("nikanti-golf-club");

    console.log("=== 테스트 완료 ===");
}

main().catch(e => console.error("에러:", e));
