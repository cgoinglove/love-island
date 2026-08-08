# 0002. 아키텍처 경계를 ESLint 대신 Biome 으로 강제한다

## 상태

채택 (2026-08)

## 맥락

기획서 §7.2 는 `eslint-plugin-boundaries` 로 레이어 의존 규칙을 강제하자고 한다.
그런데 이 프로젝트의 린터/포매터는 이미 Biome 2.4 다. boundaries 를 쓰려면 ESLint 를
따로 얹어 린터를 두 개 운영해야 한다 — 설정 파일 두 벌, CI 스텝 두 개, 에디터 확장 두 개.

"아키텍처는 문서가 아니라 실행 가능한 제약일 때만 유지된다"가 §7.2 의 요지이므로,
강제 자체를 포기하는 선택지는 없다. 문제는 어느 도구로 하느냐다.

## 결정

Biome 의 `style/noRestrictedImports` 를 `overrides[].includes` 와 조합해서 쓴다.
파일 경로별로 "이 레이어에서 금지된 import 패턴 목록"을 선언하는 방식이다.

`biome.json` 에 여섯 개의 override 를 뒀다:

| 대상 | 금지 |
|---|---|
| `shared/**` | 모든 내부 레이어 + three·react·next·node:\* |
| `game/**` | features·server·app |
| `game/core/**` | 위 + 상위 game 모듈(player·world·camera·net·hud) |
| 순수 로직 파일 4개 | 위 + three·react — vitest 로 돌아야 하므로 |
| `features/**` | 다른 feature 전부 + server·app |
| `server/**` | game·features·app·three |

그리고 전역 규칙 하나로 `@/features/*/**` 를 막아 배럴 패턴(§3)을 강제한다 —
feature 의 공개 창구는 `index.ts` 뿐이다.

## 결과

- 린터 하나. `pnpm lint` 가 포맷·린트·아키텍처를 한 번에 본다
- `eslint-plugin-boundaries` 의 `capture` 문법이 없다. "feature A 는 feature A 내부만"을
  직접 표현할 수 없어서, **feature 안에서는 `@/` 별칭 대신 상대경로를 쓴다**는 규약으로 우회했다
  (`features/**` 에서 `@/features/**` 전체를 금지). 규약이 하나 늘어난 대신 도구는 하나 줄었다
- 규칙이 실제로 발동하는지 확인하려면 일부러 위반하는 파일을 만들어 `pnpm lint` 를 돌려보면 된다.
  이 ADR 을 쓰기 전에 6개 규칙 전부 그렇게 확인했다
- 새 레이어를 추가할 때 `biome.json` override 를 손으로 늘려야 한다. 레이어는 자주 안 늘어나니 감수한다
