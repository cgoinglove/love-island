import type { Vec2XZ } from "@/shared/types";

export const LAUNCHER_PANEL_ID = "fireworks.launcher";

/**
 * 발사대 자리. 노을 의자 **바로 옆**이다.
 *
 * 의자에 앉아 밤을 보던 자리에서 몇 걸음 거리에 둔 건 의도다 — 보는 것과 쏘는 것이
 * 같은 장소에 있어야 "저기서 쏘고 여기 앉아서 본다" 가 성립한다.
 * 둘이 오면 한 명은 쏘고 한 명은 앉아서 볼 수도 있다.
 */
export const LAUNCHER_POSITION: Vec2XZ = [6.2, -28.8];
/** 다가가 서는 자리. 발사대 뒤(섬 안쪽). */
export const LAUNCHER_APPROACH: Vec2XZ = [5.6, -27];

/**
 * 차오르는 데 걸리는 시간(초)과 규모의 범위.
 *
 * ⚠ 상한이 3 인 건 취향이 아니라 화각이다. 밤의 자동 연출이 2.1~3.0 을 쓰고
 *   (nightShow), 그 위로 올리면 터지는 원이 화면 위아래로 잘려 나간다 —
 *   보이는 하늘 띠가 11° 뿐이라 지름 14m 가 사실상 한계다(reactionBursts).
 *   가장 큰 걸 쏘면 밤 연출과 같은 크기가 나오는 셈이고, 그게 맞는 상한이다.
 */
export const CHARGE_SECONDS = 1.6;
export const MIN_POWER = 1;
export const MAX_POWER = 3;

/** 이보다 멀어지면 발사대를 떠난 것으로 본다. */
export const LEAVE_DISTANCE = 4.5;

/** 눌렀다 뗀 시간을 규모로 바꾼다. */
export function powerFor(heldSeconds: number): number {
  const filled = Math.min(1, Math.max(0, heldSeconds / CHARGE_SECONDS));
  return MIN_POWER + (MAX_POWER - MIN_POWER) * filled;
}

/**
 * 터질 자리 — 발사대에서 **바다 쪽으로** 날려 보낸다.
 *
 * ⚠ 예전엔 쏜 사람 자리에서 터졌다. 그러면 머리 위 20m 에서 터지는데,
 *   그건 폭죽이 아니라 화면을 덮는 입자 구름이다 — 폭죽이 폭죽으로 보이는 건
 *   **멀어서**다. 밤의 자동 연출이 물가에서 42~56m 밖에서 터지는 것과
 *   같은 자리로 보낸다.
 *
 * 세게 누를수록 멀리 나간다. 규모와 거리가 같이 커져야 "더 큰 걸 쐈다" 가
 * 화면에서 하나의 사건으로 읽힌다.
 */
export function targetFor(power: number, random: () => number): Vec2XZ {
  const reach = 34 + (power - MIN_POWER) * 13;
  // 매번 같은 자리에 터지면 두 번째부터는 아무도 안 본다. 좌우로 흩뜨린다.
  const drift = (random() - 0.5) * 26;
  return [LAUNCHER_POSITION[0] + drift, LAUNCHER_POSITION[1] - reach];
}
