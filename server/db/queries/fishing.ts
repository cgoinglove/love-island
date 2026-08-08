import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import { and, count, eq, gt } from "drizzle-orm";
import { getDb } from "@/server/db";
import { catchLog } from "@/server/db/schema";
import type { Catchable } from "@/shared/fishing";
import { CATCH_HOURLY_LIMIT, rollCatch } from "@/shared/fishing";

/**
 * 낚시 한 번.
 *
 * ── 왜 서버가 굴리나 ──
 * 이 표에는 **진짜로 사주는** 커피 쿠폰이 있다. 클라이언트가 굴리면 개발자 도구를
 * 아는 사람은 누구나 치킨을 뽑는다. 주사위를 서버가 굴리고 결과를 남기면,
 * 보내온 코드가 진짜인지 확인할 수 있다.
 *
 * ── 남은 구멍과 그 대책 ──
 * 미니게임을 실제로 했는지는 서버가 알 수 없다. 그래서 **횟수 제한**이 유일한 방벽이다.
 * 시간당 30번이면 기댓값으로 치킨 하나 뽑는 데 몇 달이 걸린다 — 자동화해서 노릴
 * 값어치가 없어지는 선이다.
 */

/**
 * 사람이 옮겨 적을 코드.
 *
 * 헷갈리는 글자(0/O, 1/I/l)를 뺀다 — 캡처를 보고 손으로 치는 사람이 있고,
 * 그때 한 글자 틀리면 "쿠폰이 안 맞는다" 는 실랑이가 된다.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function makeCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += ALPHABET[(bytes[i] as number) % ALPHABET.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** 암호학적 난수. Math.random 은 예측 가능하고, 여기엔 상품이 걸려 있다. */
function secureRandom(): number {
  return randomInt(0, 2 ** 30) / 2 ** 30;
}

export async function countRecentCatches(ipHash: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const rows = await getDb()
    .select({ value: count() })
    .from(catchLog)
    .where(and(eq(catchLog.ipHash, ipHash), gt(catchLog.createdAt, since)));
  return rows[0]?.value ?? 0;
}

export interface CatchOutcome {
  item: Catchable;
  code: string | null;
  caughtAt: Date;
}

export async function recordCatch(
  room: string,
  playerId: string,
  ipHash: string,
): Promise<CatchOutcome> {
  const item = rollCatch(secureRandom);
  // 코드는 진짜 보상일 때만. 장화에 쿠폰 번호를 붙이면 그게 더 헷갈린다.
  const code = item.redeemable ? makeCode() : null;

  const [row] = await getDb()
    .insert(catchLog)
    .values({ room, playerId, itemId: item.id, code, ipHash })
    .returning({ createdAt: catchLog.createdAt });

  return { item, code, caughtAt: row?.createdAt ?? new Date() };
}

export { CATCH_HOURLY_LIMIT };
