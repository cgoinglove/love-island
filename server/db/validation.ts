import "server-only";
import { createSelectSchema } from "drizzle-zod";
import { guestbook } from "./schema";

/**
 * DB 에서 읽은 행이 정말 우리가 아는 모양인지 확인한다.
 *
 * TypeScript 의 $inferSelect 는 컴파일 타임 약속일 뿐이고, 실제 테이블은
 * 마이그레이션이 어긋나거나 누가 psql 로 컬럼을 바꾸면 얼마든지 달라질 수 있다.
 * drizzle-zod 로 테이블 정의에서 런타임 스키마를 뽑아두면 그 드리프트가
 * "사용자에게 이상한 값이 보이는" 대신 "서버 로그에 잡히는" 문제가 된다.
 */
export const guestbookRow = createSelectSchema(guestbook);
