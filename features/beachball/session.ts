"use client";

import { useEffect } from "react";
import { emitRoomEvent } from "@/game/net/presence";
import { registerBallHandler } from "@/game/net/roomEvents";
import { parseBall } from "@/shared/presence";
import { BALL_HOME, BALL_RADIUS } from "./constants";
import type { BallState } from "./physics";

/**
 * 공의 현재 상태 — **리액트 밖에** 산다.
 *
 * 초당 60번 바뀌는 값이라 zustand 에 두면 공 하나가 화면 전체를 초당 60번
 * 다시 그리게 만든다. 캐릭터 좌표·차오르는 게이지와 같은 이유로 여기서도
 * 그냥 상자 하나를 두고 직접 만진다.
 */
export const ball: BallState = {
  x: BALL_HOME[0],
  y: BALL_RADIUS,
  z: BALL_HOME[1],
  vx: 0,
  vy: 0,
  vz: 0,
};

/**
 * 마지막으로 찬 사람이 나인가.
 *
 * 골이 들어갔을 때 **한 사람만** 폭죽을 쏘아야 한다. 모두가 각자 판정해서
 * 각자 쏘면 사람 수만큼 터진다. 마지막으로 찬 사람은 자기가 안다 —
 * 그게 이 한 줄로 충분한 이유고, 아무도 심판을 맡지 않아도 된다.
 */
export const kicker = { mine: false };

function apply(next: BallState): void {
  ball.x = next.x;
  ball.y = next.y;
  ball.z = next.z;
  ball.vx = next.vx;
  ball.vy = next.vy;
  ball.vz = next.vz;
}

/**
 * 내가 찼다 — 모두에게 알린다.
 *
 * 상태를 **통째로** 실어 보낸다(자리 + 속도). 그러면 받는 쪽은 그 자리에서
 * 자기 계산을 다시 시작하면 되고, 다음 발길질까지 통신이 0 이다.
 * 폭죽이 규모와 터질 자리를 한 번에 싣는 것과 같은 방식이다.
 */
export function announceKick(next: BallState): void {
  apply(next);
  kicker.mine = true;
  emitRoomEvent(
    "ball",
    [next.x, next.y, next.z, next.vx, next.vy, next.vz]
      .map((v) => v.toFixed(2))
      .join(","),
  );
}

/** 남이 찬 발길질을 받는다. */
export function useBallEvents(): void {
  useEffect(
    () =>
      registerBallHandler((event) => {
        const kick = parseBall(event.text);
        if (!kick) return;
        apply(kick);
        // 남이 찼으니 골이 들어가도 그쪽이 축포를 쏜다.
        kicker.mine = false;
      }),
    [],
  );
}
