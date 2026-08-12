import { describe, expect, it } from "vitest";
import { elevationAt } from "@/game/core/island";
import { fireworkBurstHeight } from "@/game/world/reactionBursts";
import {
  LETTERBOX_FRACTION,
  SEAT_BACK_HEIGHT,
  SEATS,
  SHOT_BACK,
  SHOT_FOV,
  SHOT_TARGET,
  SHOT_UP,
} from "./constants";

/**
 * 앉았을 때의 화면 구도.
 *
 * ── 왜 테스트로 박아두나 ──
 * 이 섬에서 가장 자주 되풀이된 실수가 **화각 밖에 물건을 놓는 것**이다.
 * 해가 화면 위로 사라졌고, 밤 폭죽이 25m 에서 터져 아무도 못 봤고, 여기서도
 * 처음 잡은 카메라는 의자를 통째로 프레임 밖으로 밀어냈다. 눈으로 확인하려면
 * 밤이 올 때까지 기다려야 하는데(주기 180초), 그러다 보니 다들 안 본다.
 *
 * 각도는 계산할 수 있다. 그러면 안 봐도 된다.
 */

/** 튜닝 기본값. game/dev/useTuning 의 곡률과 같아야 한다. */
const CURVATURE = 0.0013;

/** 밤 불꽃이 터지는 자리(game/world/nightShow). */
const SHELL_MIN_RADIUS = 72;
const SHELL_MAX_RADIUS = 84;
const SHELL_MIN_POWER = 2.1;
const SHELL_MAX_POWER = 3.0;

const seat = SEATS[0] as readonly [number, number];
const ground = elevationAt(seat[0], seat[1]);

const camera = { y: ground + SHOT_UP, z: seat[1] + SHOT_BACK };

/** 카메라 광축이 수평에서 들린 각(라디안). */
const axisPitch = Math.atan2(
  SHOT_TARGET[1] - camera.y,
  camera.z - SHOT_TARGET[2],
);

/**
 * 화면에 실제로 보이는 세로 반각.
 *
 * 위아래 검은 띠가 각각 화면 높이의 11% 를 먹으므로 그만큼 좁아진다.
 * 각도가 아니라 **탄젠트 공간에서** 잘라야 맞는다 — 투영은 선형이 아니다.
 */
const visibleHalfAngle = Math.atan(
  Math.tan((SHOT_FOV * Math.PI) / 360) * (1 - 2 * LETTERBOX_FRACTION),
);

/** 카메라 광축을 기준으로 이 점이 위아래로 몇 라디안에 있나. 양수면 위. */
function frameAngle(distance: number, height: number): number {
  // 세계가 거리 제곱으로 휘어 내려간다. 먼 것일수록 이 보정이 크다.
  const dropped = height - distance * distance * CURVATURE;
  return Math.atan2(dropped - camera.y, distance) - axisPitch;
}

describe("앉아서 보는 화면", () => {
  it("의자 등받이가 프레임 안에 남는다", () => {
    /**
     * 처음 잡은 값(5.6m 뒤 · 3.5m 위)에서는 등받이가 시선 아래 25° 로 내려가
     * 화면 밖으로 나갔다 — 하늘만 가득한 그림이었다. 앉은 사람과 의자가 안 보이면
     * 그건 "앉아서 보는 장면"이 아니라 그냥 하늘 사진이다.
     */
    const angle = frameAngle(SHOT_BACK, ground + SEAT_BACK_HEIGHT);
    expect(angle).toBeGreaterThan(-visibleHalfAngle);
    // 그렇다고 한가운데 오면 안 된다. 의자는 **아래쪽**을 받쳐야 한다.
    expect(angle).toBeLessThan(-0.05);
  });

  it("수평선이 화면 아래쪽 절반에 놓인다", () => {
    /**
     * 수평선은 곡률이 정한다 — 눈높이 h 에서 가장 높이 보이는 바다는
     * √(h/C) 거리에 있고, 그보다 멀면 다시 내려간다.
     */
    const distance = Math.sqrt(camera.y / CURVATURE);
    const angle = frameAngle(distance, 0);
    expect(angle).toBeLessThan(0);
    expect(angle).toBeGreaterThan(-visibleHalfAngle);
  });

  it("밤 폭죽이 수평선 위 프레임 안에서 터진다", () => {
    const horizonAngle = frameAngle(Math.sqrt(camera.y / CURVATURE), 0);

    for (const radius of [SHELL_MIN_RADIUS, SHELL_MAX_RADIUS]) {
      for (const power of [SHELL_MIN_POWER, SHELL_MAX_POWER]) {
        // 정북 방향의 발이 기준이다. 옆으로 벌어진 발은 더 멀고 더 낮게 걸린다.
        const distance = radius - Math.abs(camera.z);
        const angle = frameAngle(distance, fireworkBurstHeight(power));

        expect(angle).toBeGreaterThan(horizonAngle);
        expect(angle).toBeLessThan(visibleHalfAngle);
        expect(angle).toBeGreaterThan(-visibleHalfAngle);
      }
    }
  });
});
