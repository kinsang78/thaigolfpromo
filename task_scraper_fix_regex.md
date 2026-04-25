# 작업 지시서: agency-scraper.js 최종 수정 — 이스케이프된 JSON 파싱

파일 위치: `agency-scraper.js` (프로젝트 루트)

---

## 원인

HTML에 데이터가 이스케이프된 JSON 형태로 들어있음:
- 실제: `\"greenFeeWD\":\"5000\"`
- 기존 정규식: `"greenFeeWD":"5000"` → 매칭 실패

---

## 수정 내용

### 1단계: 디버그 코드 제거

파일 맨 아래에 있는 디버그 코드 전체 삭제. 복원 방법:

```js
// main();  // 임시 주석 처리
debugTest();

async function debugTest() { ... }
```

↓ 복원

```js
main();
```

---

### 2단계: fetchFromGolfdigg 정규식 수정

`fetchFromGolfdigg` 함수 안의 정규식을 이스케이프된 따옴표도 매칭하도록 수정.

#### 기존 코드 찾기:
```js
        // 가격 파싱: "greenFeeWD":"5,500" 또는 "greenFeeWD":"650" 형태
        const wdMatch = html.match(/"greenFeeWD"\s*:\s*"([\d,]+)"/);
        const weMatch = html.match(/"greenFeeWE"\s*:\s*"([\d,]+)"/);
```

#### 아래로 교체:
```js
        // 가격 파싱: \"greenFeeWD\":\"5000\" 형태 (HTML 내부 이스케이프된 JSON)
        // 일반 따옴표와 이스케이프된 따옴표 둘 다 매칭
        const wdMatch = html.match(/\\?"greenFeeWD\\?"\s*:\s*\\?"([\d,]+)\\?"/);
        const weMatch = html.match(/\\?"greenFeeWE\\?"\s*:\s*\\?"([\d,]+)\\?"/);
```

#### 기존 코드 찾기:
```js
        // 골프장 영문명 파싱: "course":{"id":"...","name":"NIKANTI GOLF CLUB",...
        let name = slugToName(slug);
        const courseNameMatch = html.match(/"course"\s*:\s*\{[^}]*?"name"\s*:\s*"([^"]+)"/);
```

#### 아래로 교체:
```js
        // 골프장 영문명 파싱: \"course\":{\"id\":\"...\",\"name\":\"ALPINE GOLF CLUB\",...
        let name = slugToName(slug);
        const courseNameMatch = html.match(/\\?"course\\?"\s*:\s*\{[^}]*?\\?"name\\?"\s*:\s*\\?"([^"\\]+)\\?"/);
```

---

## 테스트

```
node agency-scraper.js
```

이번에는 실제로 가격이 파싱되어야 함.

---

## 성공 확인 후

```
git add agency-scraper.js
git commit -m "fix: agency-scraper 이스케이프된 JSON 패턴 매칭 수정"
git push
```
