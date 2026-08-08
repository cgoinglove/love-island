# 0001. src/ 대신 루트 레이아웃을 쓴다

## 상태

채택 (2026-08)

## 맥락

기획서 §3 은 `src/app`, `src/game`, `src/features` 형태를 전제한다.
그런데 이미 만들어진 프로젝트는 `create-next-app` 기본값대로 `app/`, `components/`, `lib/` 가
루트에 있고 `tsconfig.json` 의 `paths` 도 `"@/*": ["./*"]` 로 잡혀 있었다.

`src/` 로 옮기려면 세 디렉토리 이동 + paths 수정 + shadcn `components.json` 의 alias 재설정이
필요한데, 얻는 건 "설정 파일과 소스가 분리된다" 뿐이다.

## 결정

레이어 디렉토리(`game/`, `features/`, `server/`, `shared/`)를 루트에 그대로 만든다.
기획서의 구조에서 `src/` 접두사만 빼면 나머지는 동일하다.

## 결과

- 마이그레이션 비용 0, `@/...` import 경로가 기획서와 한 글자 차이(`@/src/game` → `@/game`)
- 루트 디렉토리 항목이 늘어난다. 레이어가 6개를 넘어가면 그때 다시 본다
- `biome.json` 의 경계 규칙 glob 이 `src/` 없는 형태로 고정된다 (§ADR 0002)
