import { elevationAt } from "@/game/core/island";
import type { Vec2XZ } from "@/shared/types";

/**
 * 바다 끝 의자 두 개.
 *
 * ── 왜 하필 여기인가 ──
 * 섬의 북쪽 끝, 하트의 오목한 만이다. 카메라는 늘 북쪽을 보고, 깃발도 밤
 * 불꽃놀이도 전부 북쪽 바다에서 벌어진다(SEA_BANNER · nightShow). 그러니까
 * 여기는 이 섬에서 **볼 것이 있는 유일한 방향을 정면으로 보는 자리**다.
 *
 * 물가에서 2.4m 안쪽이라 파도에 발이 잠기지 않고, 뒤로는 언덕이 없어서
 * 카메라가 뒤로 물러설 자리가 나온다.
 *
 * ⚠ 섬이 세 배가 되면서 자리도 새 해안선을 따라 나갔다. 다만 **두 의자 사이는
 *   3.8m 그대로다** — 섬 크기와 함께 곱하면 11m 떨어져 앉게 되는데,
 *   그건 옆자리가 아니라 남남이다.
 */
export const SEAT_PANEL_IDS = [
  "sunset-seat-left",
  "sunset-seat-right",
] as const;

export const SEATS: readonly Vec2XZ[] = [
  [-1.9, -29.3],
  [1.9, -29.3],
];

/** 의자로 걸어올 때 멈추는 자리. 의자 뒤(남쪽)에서 다가온다. */
export const SEAT_APPROACHES: readonly Vec2XZ[] = [
  [-1.9, -27.5],
  [1.9, -27.5],
];

/** 의자 사이 작은 탁자. */
export const SIDE_TABLE: Vec2XZ = [0, -29.1];

/**
 * 의자 등받이 꼭대기 높이(지면 위 m).
 *
 * Chairs.tsx 의 등받이 조각과 맞물린 값이다. 여기 있는 이유는 **카메라 구도가
 * 이 높이를 알아야** 하기 때문이다 — 등받이가 프레임 안에 남는지는 계산으로
 * 확인할 수 있고, framing.test.ts 가 그걸 한다.
 */
export const SEAT_BACK_HEIGHT = 1.4;

/** 위아래 검은 띠가 각각 먹는 화면 높이 비율. SeatHud 의 11vh 와 같아야 한다. */
export const LETTERBOX_FRACTION = 0.11;

/** 앉은 사람이 이만큼 벗어나면 일어난 것으로 본다(m). */
export const LEAVE_DISTANCE = 1.6;

/**
 * 앉았을 때 카메라가 가는 자리.
 *
 * ── 이 숫자들은 취향이 아니라 화각 계산이다 ──
 * 눈높이 3.2m(지면 0.36 + 2.8)에서 곡률 0.0013 이면 **수평선은 시선 아래 7.3°** 에
 * 있고 보이는 바다는 49m 까지다 — 섬을 세 배로 키우면서 배가 봉우리를 피해
 * 더 멀리 지나가야 했고, 그만큼 눈높이를 올려 수평선을 밀어냈다. 밤 불꽃은 64~78m 바다에서 높이 9m 로 터지는데(reactionBursts), 곡률이
 * 그 거리에서 6.4m 를 끌어내리므로 화면에서는 **시선 아래 2° ~ 위 7°** 다.
 * 7m 뒤에서 보면 등받이 꼭대기(지면 위 1.4m)가 시선 아래 6.6° 라,
 * **의자 등받이가 수평선에 걸리고 그 위로 불꽃이 뜬다.**
 *
 * ⚠ 처음엔 5.6m 뒤 3.5m 높이로 잡았는데, 그러면 등받이가 시선 아래 25° 로
 *   내려가 프레임 밖으로 나간다 — 하늘만 가득한 화면이 됐다. 앉은 사람과
 *   의자가 안 보이면 그건 "앉아서 보는 장면"이 아니라 그냥 하늘 사진이다.
 *   카메라 높이를 잴 때 **지면 높이(0.62m)를 두 번 세지 않도록** 조심할 것 —
 *   그 한 번의 착각이 등받이를 5° 아래로 밀어냈다.
 *   위아래 검은 띠가 11% 씩 더 잘라먹는 것도 계산에 넣어야 한다.
 */
export const SHOT_BACK = 7.0;
export const SHOT_UP = 2.8;
export const SHOT_FOV = 46;
/**
 * 바라보는 지점. 시선을 1.1° 만 들어 올려 하늘을 조금 더 넣는다.
 *
 * ⚠ z 는 **의자에서 42m 북쪽**이다. 섬을 세 배로 키우며 의자가 북쪽으로
 *   나갔는데 이 값을 안 옮겼더니 바라보는 지점이 의자 **뒤**가 되어,
 *   카메라가 뒤를 돌아보는 꼴이 됐다.
 */
export const SHOT_TARGET: readonly [number, number, number] = [0, 4.1, -71];
/** 이 자리까지 미끄러져 가는 시간(초). 1초쯤이라야 "옮겨갔다"로 읽힌다. */
export const SHOT_GLIDE = 0.95;

/** 의자가 놓인 땅의 높이. 지형이 바뀌면 같이 따라온다. */
export function seatGround(index: number): number {
  const seat = SEATS[index] ?? SEATS[0];
  if (!seat) return 0;
  return elevationAt(seat[0], seat[1]);
}
