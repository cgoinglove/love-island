/**
 * 방명록의 유일한 공개 창구.
 *
 * 밖에서는 이 파일에 있는 것만 쓸 수 있다 — biome 의 `@/features/*&#47;**` 금지 규칙이
 * 내부 파일 직접 import 를 에러로 막는다. Board.tsx 를 통째로 갈아엎어도
 * 이 세 개의 이름만 유지하면 다른 코드는 안 건드린다. (기획서 §3)
 */

export { Board } from "./Board";
export { GuestbookPanel } from "./GuestbookPanel";
export { Notes as GuestbookNotes } from "./Notes";
