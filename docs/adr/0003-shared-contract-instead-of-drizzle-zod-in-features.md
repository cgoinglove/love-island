# 0003. 통신 계약을 shared/ 에 두고, drizzle-zod 는 서버에만 쓴다

## 상태

채택 (2026-08)

## 맥락

기획서 §6.1 은 단일 진실 공급원을 이렇게 만들자고 한다:

```ts
// features/guestbook/schema.ts
import { createInsertSchema } from "drizzle-zod";
import { guestbook } from "@/server/db/schema";   // ← 여기
```

그런데 `features/guestbook/schema.ts` 는 브라우저에서도 돌아가는 파일이다.
여기서 `@/server/db/schema` 를 import 하면 `drizzle-orm/pg-core` 가 클라이언트 번들에
끌려 들어간다 — §2.2 의 "server/ 코드는 클라이언트 번들에 절대 들어가지 않는다" 와 정면으로 충돌한다.
biome 의 `features/**` 경계 규칙이 실제로 이 import 를 에러로 막는다.

두 규칙 중 하나는 져야 한다.

## 결정

경계 규칙을 이기게 두고, 단일 진실 공급원은 **층을 나눠서** 지킨다.

| 파일 | 역할 | 누가 보나 |
|---|---|---|
| `shared/constants.ts` | 길이 제한 등 **숫자** (`NICKNAME_MAX`, `MESSAGE_MAX`) | 전부 |
| `shared/guestbook.ts` | **통신 계약** — 입력 스키마와 공개 응답 스키마 (Zod) | 클라이언트 + 서버 |
| `server/db/schema.ts` | Drizzle 테이블. 컬럼 길이는 `shared/constants` 에서 가져온다 | 서버만 |
| `server/db/validation.ts` | `createSelectSchema` 로 뽑은 **DB 행** 스키마 | 서버만 |

즉 파생 방향이 `테이블 → 타입` 이 아니라 `상수 → (테이블, 계약)` 이다.
`MESSAGE_MAX` 를 200 → 300 으로 바꾸면 마이그레이션 · 서버 검증 · 클라이언트 검증 ·
입력창의 글자수 카운터가 한 번에 따라온다. 기획서가 원한 성질은 그대로 남는다.

drizzle-zod 는 버리지 않고 자리를 옮겼다. `server/db/validation.ts` 에서
DB 에서 읽은 행을 `guestbookRow.parse()` 로 통과시킨다.

## 결과

- 클라이언트 번들에 drizzle 이 없다. 경계 린트가 이걸 계속 지켜준다
- 테이블과 계약이 **두 파일**이다. 컬럼을 추가하고 응답에 안 넣으면 조용히 누락된다 —
  대신 응답 스키마가 화이트리스트라 그 반대(민감 컬럼 유출)는 구조적으로 불가능하다
- `guestbookRow.parse()` 덕분에 마이그레이션 드리프트가 "사용자에게 이상한 값이 보이는" 대신
  "서버 로그에 잡히는" 문제가 된다
- 컬럼을 늘릴 때 손댈 곳: `server/db/schema.ts` → `pnpm db:generate` → `shared/guestbook.ts`.
  순서를 지키면 타입 에러가 빠진 곳을 알려준다
