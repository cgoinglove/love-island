import type { Vec2XZ } from "@/shared/types";

/** 게시판 자리. island.ts 의 LANDMARKS 에 같은 좌표가 비워져 있다. */
export const MAILBOX_POSITION: Vec2XZ = [0, 6];

/** 탭했을 때 실제로 걸어가는 지점. 게시판 남쪽에 서서 마주 본다. */
export const MAILBOX_APPROACH: Vec2XZ = [0, 11.5];

export const GUESTBOOK_PANEL_ID = "guestbook";
