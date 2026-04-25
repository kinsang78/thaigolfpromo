# 작업 지시서: greenFee 주변 문자열 확인

파일 위치: `agency-scraper.js` (프로젝트 루트)

---

## 작업

기존 `debugTest()` 함수 내부의 for 루프에서 마지막 `console.log("'greenFee' 포함 여부:", ...);` 줄 **바로 아래**에 아래 코드를 추가:

```js
            // greenFee 주변 문자열 추출 (앞뒤 100자씩)
            const greenFeeIdx = html.indexOf("greenFee");
            if (greenFeeIdx !== -1) {
                const start = Math.max(0, greenFeeIdx - 50);
                const end = Math.min(html.length, greenFeeIdx + 300);
                console.log("greenFee 주변 문자열:");
                console.log(html.substring(start, end));
            }

            // 두 번째, 세 번째 greenFee 등장 위치도 확인
            let searchFrom = greenFeeIdx + 1;
            for (let i = 0; i < 3; i++) {
                const nextIdx = html.indexOf("greenFee", searchFrom);
                if (nextIdx === -1) break;
                console.log(`\ngreenFee 등장 ${i+2}번째 (위치 ${nextIdx}):`);
                console.log(html.substring(Math.max(0, nextIdx - 30), Math.min(html.length, nextIdx + 200)));
                searchFrom = nextIdx + 1;
            }

            // "id" 패턴도 확인 - 24자리 hex 근처
            const idHexMatch = html.match(/[a-f0-9]{24}/);
            if (idHexMatch) {
                const idIdx = html.indexOf(idHexMatch[0]);
                console.log("\n24자리 hex id 주변:");
                console.log(html.substring(Math.max(0, idIdx - 50), Math.min(html.length, idIdx + 100)));
            }
```

---

## 실행 후

`node agency-scraper.js` 실행하고 결과를 **alpine-golf-club 한 개만** 복사해서 공유해줘.
다른 골프장은 패턴이 같을 테니 한 개면 충분해.

**⚠️ git 커밋/push 하지 마세요.**
