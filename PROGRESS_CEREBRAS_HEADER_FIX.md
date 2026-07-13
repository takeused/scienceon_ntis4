# Cerebras 브라우저 헤더 오류 수정 기록

## 2026-07-13

- 증상: AI 키워드 생성 시 `Failed to read the 'headers' property from 'RequestInit': String contains non ISO-8859-1 code point` 오류가 발생했다.
- 원인: 브라우저 API 모드가 `STATE.cerebrasKey`의 존재 여부만 검사하고, 한글 설명이 붙은 저장값 전체를 `Authorization` 헤더에 넣었다.
- 수정: `normalizeCerebrasKey()`가 붙여넣은 문자열에서 `csk-` 형식의 ASCII 키만 추출한다.
- 수정: `isValidCerebrasKey()` 검증에 실패하면 `fetch()` 호출 전에 `AI_KEY_INVALID`로 중단한다.
- 수정: 설정 저장·상태 문구·연구–IP 분석 진입 안내에도 잘못된 키 형식을 구분해 표시한다.
- 회귀 테스트: 설명 문구가 붙은 키의 ASCII 헤더 정규화, 한글만 있는 잘못된 키의 사전 차단을 추가했다.
