# 작업 지시서: COURSE_MASTER 동적화

## 배경
`api/parse-promotion.js`에서 골프장 마스터 데이터(COURSE_MASTER)가 46개만 하드코딩되어 있다.
실제 DB(golf_courses)에는 136개 이상의 골프장이 있어서, 새 프로모션 제보가 들어오면 매칭 실패 → golf_course_id가 NULL로 저장되는 문제가 있다.

## 목표
COURSE_MASTER를 하드코딩 대신 Supabase golf_courses 테이블에서 동적으로 로딩하도록 변경한다.

## 수정 대상
`api/parse-promotion.js` (Vercel Serverless Function)

## 현재 구조
```javascript
// 하드코딩된 46개
var COURSE_MASTER = {
  "로얄방파인": { en: "Royal Bang Pa-In Golf Club", country: "태국", region: "방콕", lat: 14.1692, lng: 100.5384 },
  "알파인": { en: "Alpine Golf & Sports Club", country: "태국", region: "방콕", lat: 14.1089, lng: 100.7105 },
  // ... 44개 더
};

var masterListText = Object.entries(COURSE_MASTER).map(function(entry) {
  return entry[0] + " -> " + entry[1].en + " | " + entry[1].country + " | " + entry[1].region;
}).join("\n");
```

## 변경 사항

### 1. COURSE_MASTER 하드코딩 제거
기존 `var COURSE_MASTER = { ... }` 전체를 제거한다.

### 2. DB에서 동적 로딩 함수 추가
```javascript
async function loadCourseMaster() {
  var result = await supabase
    .from("golf_courses")
    .select("id, name_ko, name_en, country, region, latitude, longitude");

  if (result.error) {
    console.error("마스터 로딩 에러:", result.error.message);
    return {};
  }

  var master = {};
  result.data.forEach(function(c) {
    // name_ko가 있으면 한글명으로 등록
    if (c.name_ko) {
      master[c.name_ko] = {
        id: c.id,
        en: c.name_en,
        country: c.country,
        region: c.region,
        lat: c.latitude,
        lng: c.longitude
      };
    }
    // name_en으로도 등록 (영문명으로 제보가 올 수 있음)
    if (c.name_en) {
      master[c.name_en] = {
        id: c.id,
        en: c.name_en,
        country: c.country,
        region: c.region,
        lat: c.latitude,
        lng: c.longitude
      };
    }
  });

  return master;
}
```

### 3. handler 함수에서 COURSE_MASTER를 동적 로딩
handler 함수의 시작 부분에서 호출:
```javascript
module.exports = async function handler(req, res) {
  // ... 기존 validation 코드 ...

  try {
    var COURSE_MASTER = await loadCourseMaster();
    var masterListText = Object.entries(COURSE_MASTER)
      .filter(function(entry) { return entry[1].en; })  // 영문명 키 중복 방지
      .map(function(entry) {
        return entry[0] + " -> " + entry[1].en + " | " + entry[1].country + " | " + entry[1].region;
      }).join("\n");

    // SYSTEM_PROMPT 내의 masterListText 참조가 동적으로 생성됨
    // ... 나머지 기존 로직 ...
```

### 4. SYSTEM_PROMPT를 함수 내부로 이동
현재 SYSTEM_PROMPT는 모듈 레벨에서 masterListText를 참조하고 있다.
COURSE_MASTER가 동적이 되면 SYSTEM_PROMPT도 handler 내부에서 생성해야 한다.

기존의 `var SYSTEM_PROMPT = [...]` 블록을 handler 함수 안으로 이동한다.
masterListText가 동적으로 생성된 후에 SYSTEM_PROMPT를 조립한다.

### 5. applyMaster 함수에서 golf_course_id도 설정
```javascript
function applyMaster(promo, master) {
  promo.golf_course_en = master.en;
  promo.country = master.country;
  promo.region = master.region;
  promo.latitude = master.lat;
  promo.longitude = master.lng;
  promo.golf_course_id = master.id;  // 추가
  return promo;
}
```

### 6. insertNew/saveWithDedup에서 golf_course_id 저장
insertNew 함수의 insert 객체에 추가:
```javascript
golf_course_id: promo.golf_course_id || null,
```

saveWithDedup 함수의 update 객체에도 추가:
```javascript
golf_course_id: promo.golf_course_id || best.golf_course_id,
```

## 주의사항
- `var` 키워드를 사용할 것 (기존 코드 스타일 유지, let/const 사용하지 않음)
- 기존 correctWithMaster() 함수의 4단계 매칭 로직은 그대로 유지
- Supabase 쿼리가 실패하면 빈 객체({})를 반환하여 기존처럼 Claude AI가 최대한 추정하도록 fallback
- SYSTEM_PROMPT의 masterListText에는 한글명 키만 포함 (영문명 키까지 넣으면 토큰 낭비)
- handler 함수 시작 시 매 호출마다 DB를 조회하게 됨. 현재 트래픽으로는 문제없음. 추후 캐싱 필요시 별도 대응.

## 테스트 방법
1. Vercel에 배포
2. 카카오 챗봇에서 기존 마스터에 없던 골프장 프로모션 텍스트 전송
3. Supabase에서 해당 프로모션의 golf_course_id가 정상 연결되었는지 확인

## 관련 파일
- `api/parse-promotion.js` (수정 대상)
- `package.json` (변경 없음)
- `vercel.json` (변경 없음)
