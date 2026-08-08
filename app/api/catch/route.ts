import {
  CATCH_HOURLY_LIMIT,
  countRecentCatches,
  recordCatch,
} from "@/server/db/queries/fishing";
import { hashIp } from "@/server/ratelimit";
import { catchRequest } from "@/shared/fishing";

/**
 * 낚싯대를 던진다.
 *
 * ⚠ 무엇이 잡혔는지는 **서버가 정한다.** 클라이언트는 "던졌다"만 말할 수 있다 —
 *   진짜 커피가 걸린 표라서, 결과를 클라이언트가 주장하게 두면 아무 의미가 없어진다.
 *
 * Route Handler 가 하는 일은 셋뿐이다: 검증 → 위임 → 직렬화. (기획서 §6.2)
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID" }, { status: 400 });
  }

  const parsed = catchRequest.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "INVALID" }, { status: 400 });
  }

  const ipHash = hashIp(request);

  try {
    /**
     * 미니게임을 실제로 했는지는 서버가 알 수 없다. 횟수 제한이 유일한 방벽이라,
     * 여기가 뚫리면 표 전체가 무의미해진다.
     */
    const recent = await countRecentCatches(ipHash);
    if (recent >= CATCH_HOURLY_LIMIT) {
      return Response.json({ error: "RATE_LIMITED" }, { status: 429 });
    }

    const outcome = await recordCatch(
      parsed.data.room,
      parsed.data.playerId,
      ipHash,
    );

    return Response.json({
      itemId: outcome.item.id,
      code: outcome.code,
      caughtAt: outcome.caughtAt.toISOString(),
    });
  } catch (error) {
    console.error("[catch] 낚시 실패", error);
    return Response.json({ error: "INTERNAL" }, { status: 500 });
  }
}
