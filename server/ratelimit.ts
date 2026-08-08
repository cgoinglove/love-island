import "server-only";
import { createHash } from "node:crypto";
import { countRecentByIp } from "@/server/db/queries/guestbook";
import { getEnv } from "@/server/env";
import {
  RATE_LIMIT_MAX_POSTS,
  RATE_LIMIT_WINDOW_MINUTES,
} from "@/shared/constants";

/**
 * IP 원본은 어디에도 저장하지 않는다. salt 를 섞은 단방향 해시만 남긴다.
 *
 * salt 가 없으면 IPv4 는 전체가 43억 개뿐이라 해시를 전부 미리 계산해서
 * 되돌릴 수 있다 — 해시했다는 사실만으로는 익명화가 아니다.
 */
export function hashIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  return createHash("sha256")
    .update(`${getEnv().IP_HASH_SALT}:${ip}`)
    .digest("hex");
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
}

/**
 * DB 를 세어서 제한한다. 인메모리 카운터를 쓰지 않는 이유:
 * Vercel 서버리스는 요청마다 다른 인스턴스로 갈 수 있어서, 인메모리 카운터는
 * 인스턴스 수만큼 제한을 곱해준다 — 사실상 없는 것과 같다.
 */
export async function checkGuestbookRateLimit(
  ipHash: string,
): Promise<RateLimitResult> {
  const recent = await countRecentByIp(ipHash, RATE_LIMIT_WINDOW_MINUTES);
  return {
    allowed: recent < RATE_LIMIT_MAX_POSTS,
    remaining: Math.max(0, RATE_LIMIT_MAX_POSTS - recent),
  };
}
