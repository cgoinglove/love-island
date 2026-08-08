import "server-only";
import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { GUESTBOOK_PAGE_SIZE } from "@/shared/constants";
import type { CreateGuestbookInput, GuestbookEntry } from "@/shared/guestbook";
import { getDb } from "../index";
import { guestbook } from "../schema";
import { guestbookRow } from "../validation";

/**
 * 쿼리는 전부 여기 모은다. Route Handler 에 SQL 이 들어가는 순간
 * 그 핸들러는 HTTP 없이는 테스트할 수 없는 코드가 된다. (기획서 §6.2)
 */

/** DB 행 → 밖으로 나갈 모양. ipHash·hiddenAt 은 여기서 잘려나간다. */
function toPublicEntry(row: unknown): GuestbookEntry {
  const parsed = guestbookRow.parse(row);
  return {
    id: parsed.id,
    nickname: parsed.nickname,
    message: parsed.message,
    room: parsed.room,
    posX: parsed.posX,
    posZ: parsed.posZ,
    createdAt: parsed.createdAt.toISOString(),
  };
}

export interface GuestbookPageResult {
  entries: GuestbookEntry[];
  nextCursor: string | null;
}

/**
 * 최신순 한 페이지.
 *
 * 커서는 마지막으로 받은 항목의 createdAt 이다. `createdAt < cursor` 로 잘라내면
 * OFFSET 없이 어디서든 이어 읽을 수 있고, 읽는 도중 새 쪽지가 들어와도
 * 이미 본 항목이 다시 밀려 내려오지 않는다.
 *
 * createdAt 이 같은 행이 여럿이면 한 건이 새어나갈 수 있는데,
 * 이 사이트에서 같은 마이크로초에 두 쪽지가 들어올 일은 없다고 본다.
 */
export async function listGuestbookPage(
  room: string,
  cursor: string | null,
  limit = GUESTBOOK_PAGE_SIZE,
): Promise<GuestbookPageResult> {
  const conditions = [eq(guestbook.room, room), isNull(guestbook.hiddenAt)];
  if (cursor !== null) {
    const parsed = new Date(cursor);
    if (!Number.isNaN(parsed.getTime())) {
      conditions.push(lt(guestbook.createdAt, parsed));
    }
  }

  // 한 개 더 받아본다. 그게 오면 다음 페이지가 있다는 뜻이다.
  const rows = await getDb()
    .select()
    .from(guestbook)
    .where(and(...conditions))
    .orderBy(desc(guestbook.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const entries = rows.slice(0, limit).map(toPublicEntry);
  return {
    entries,
    nextCursor: hasMore ? (entries.at(-1)?.createdAt ?? null) : null,
  };
}

export async function insertGuestbookEntry(
  input: CreateGuestbookInput,
  ipHash: string,
): Promise<GuestbookEntry> {
  const [row] = await getDb()
    .insert(guestbook)
    .values({
      nickname: input.nickname,
      message: input.message,
      room: input.room,
      posX: input.posX,
      posZ: input.posZ,
      ipHash,
    })
    .returning();

  if (!row) throw new Error("방명록을 저장하지 못했습니다.");
  return toPublicEntry(row);
}

/** 최근 windowMinutes 분 안에 이 IP 가 남긴 글 수. 레이트 리밋 판정용. */
export async function countRecentByIp(
  ipHash: string,
  windowMinutes: number,
): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60_000);
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(guestbook)
    .where(and(eq(guestbook.ipHash, ipHash), gte(guestbook.createdAt, since)));

  return row?.count ?? 0;
}

/** soft delete. 행은 남기고 목록에서만 숨긴다. */
export async function hideGuestbookEntry(id: string): Promise<boolean> {
  const rows = await getDb()
    .update(guestbook)
    .set({ hiddenAt: new Date() })
    .where(and(eq(guestbook.id, id), isNull(guestbook.hiddenAt)))
    .returning({ id: guestbook.id });

  return rows.length > 0;
}
