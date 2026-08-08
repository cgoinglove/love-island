import { z } from "zod";
import {
  beatPresence,
  leavePresence,
  sweepStalePresence,
} from "@/server/db/queries/presence";
import {
  outgoingRoomEvent,
  outgoingSignal,
  presenceBeat,
} from "@/shared/presence";

/**
 * 방의 심장박동. POST 한 번에 위치 교환 · WebRTC 악수 중계 · 방 사건 전달을 다 한다.
 *
 * 초당 5번까지 불리는 엔드포인트라 하는 일이 적어야 한다 —
 * 검증하고, 쿼리 하나 부르고, 돌려준다. 그게 전부다.
 */

/** 100번에 1번 꼴로 죽은 행을 청소한다. 매번 하면 쓰기 경합만 늘어난다. */
const SWEEP_CHANCE = 0.01;

const beatBody = presenceBeat.extend({
  signals: z.array(outgoingSignal).max(24).default([]),
  events: z.array(outgoingRoomEvent).max(8).default([]),
  cursor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = beatBody.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "INVALID" }, { status: 400 });
  }

  const { signals, events, cursor, ...beat } = parsed.data;

  try {
    const result = await beatPresence({ beat, signals, events, cursor });
    if (Math.random() < SWEEP_CHANCE) {
      // 응답을 붙잡아 둘 이유가 없다. 실패해도 다음 기회에 또 돈다.
      void sweepStalePresence().catch(() => {});
    }
    return Response.json(result);
  } catch (error) {
    console.error("[presence] 갱신 실패", error);
    return Response.json({ error: "INTERNAL" }, { status: 500 });
  }
}

/**
 * 탭을 닫을 때 keepalive 요청으로 온다.
 * 안 와도 TTL 이 정리하므로 실패를 신경 쓰지 않는다.
 */
export async function DELETE(request: Request) {
  const playerId = new URL(request.url).searchParams.get("playerId");
  if (!playerId) return new Response(null, { status: 204 });

  try {
    await leavePresence(playerId);
  } catch (error) {
    console.error("[presence] 퇴장 처리 실패", error);
  }
  return new Response(null, { status: 204 });
}
