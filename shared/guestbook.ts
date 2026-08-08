import { z } from "zod";
import { MESSAGE_MAX, NICKNAME_MAX } from "./constants";

/**
 * 방명록의 **통신 계약**. 클라이언트와 서버가 이 파일 하나를 함께 본다.
 *
 * 기획서 §6.1 은 Drizzle 테이블에서 drizzle-zod 로 타입을 파생시키자고 하는데,
 * 그러면 feature 코드가 @/server/db/schema 를 import 하게 되고 drizzle-orm 이
 * 클라이언트 번들에 끌려 들어간다 — §2.2 의 "server 는 클라이언트 번들에 안 들어간다"와 충돌한다.
 *
 * 그래서 경계를 이렇게 잡았다:
 *   shared/guestbook.ts  ← 계약 (양쪽이 본다)
 *   server/db/schema.ts  ← 테이블 (길이 제한은 shared/constants 에서 가져온다)
 *   server/db/validation ← drizzle-zod 로 DB 행을 검증 (마이그레이션 후 스키마 드리프트 감지)
 * 자세한 건 docs/adr/0003 참고.
 */

export const createGuestbookInput = z.object({
  nickname: z
    .string()
    .trim()
    .min(1, "이름을 적어주세요")
    .max(NICKNAME_MAX, `이름은 ${NICKNAME_MAX}자까지`)
    // \p{C} = 제어문자·서식문자. 보이지 않는 문자로 레이아웃을 깨는 걸 막는다.
    .regex(/^[^\p{C}]+$/u, "쓸 수 없는 문자가 있어요"),
  message: z
    .string()
    .trim()
    .min(1, "한 마디 남겨주세요")
    .max(MESSAGE_MAX, `${MESSAGE_MAX}자까지 쓸 수 있어요`)
    /**
     * 줄바꿈은 허용하고 나머지 제어문자만 막는다.
     *
     * \p{Cc} 를 통째로 막았더니 여러 줄 쪽지가 전부 거부됐다 — 입력칸은 textarea 라
     * 사용자는 당연히 엔터를 치는데, 저장 단계에서 "쓸 수 없는 문자가 있어요"만
     * 나오고 어디가 문제인지 알 수가 없었다. 화면은 whitespace-pre-wrap 으로
     * 줄바꿈을 그대로 보여주고 있었으니 계약 쪽이 틀렸던 것이다.
     */
    .regex(/^(?:[^\p{Cc}]|\n)*$/u, "쓸 수 없는 문자가 있어요"),
  room: z.string().min(1).max(32),
  /** 쪽지를 떨어뜨릴 위치. 섬 밖 좌표가 들어오면 바다에 쪽지가 뜬다. */
  posX: z.number().finite().min(-38).max(38),
  posZ: z.number().finite().min(-38).max(38),
});

export type CreateGuestbookInput = z.infer<typeof createGuestbookInput>;

/**
 * 밖으로 나가는 모양. ipHash 와 hiddenAt 은 여기 없다 —
 * 응답 스키마를 화이트리스트로 두면 실수로 민감한 컬럼이 새어 나갈 수 없다.
 */
export const guestbookEntry = z.object({
  id: z.uuid(),
  nickname: z.string(),
  message: z.string(),
  room: z.string(),
  posX: z.number(),
  posZ: z.number(),
  /** ISO 8601 문자열. JSON 을 건너오면 Date 가 아니라 문자열이다. */
  createdAt: z.string(),
});

export type GuestbookEntry = z.infer<typeof guestbookEntry>;

/**
 * 무한 스크롤 한 페이지.
 *
 * OFFSET 이 아니라 **커서(마지막 항목의 createdAt)** 로 넘긴다.
 * OFFSET 은 페이지가 깊어질수록 DB 가 앞의 행을 전부 세고 버려야 하고,
 * 스크롤하는 도중에 새 쪽지가 들어오면 같은 항목이 두 번 보인다.
 */
export const guestbookPage = z.object({
  entries: z.array(guestbookEntry),
  /** 다음 페이지를 요청할 커서. null 이면 마지막 페이지. */
  nextCursor: z.string().nullable(),
});

export type GuestbookPage = z.infer<typeof guestbookPage>;
