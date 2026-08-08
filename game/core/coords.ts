import {
  type GridCell,
  type GridSpec,
  gridIndex,
  type Vec2XZ,
} from "@/shared/types";

/**
 * 좌표계와 각도에 관한 모든 변환. three 를 import 하지 않는다 — 그래야 vitest 로 돈다.
 * (biome.json 이 이 파일의 three/react import 를 에러로 막는다)
 *
 * 축 규약: +X 동쪽, -Z 북쪽, +Y 위. 캐릭터의 로컬 전방은 -Z.
 */

export const TAU = Math.PI * 2;

/** 그리드 전체 크기(미터). [폭(X), 깊이(Z)] */
export function gridExtent(spec: GridSpec): Vec2XZ {
  return [spec.cols * spec.cellSize, spec.rows * spec.cellSize];
}

/**
 * 월드 좌표 → 그리드 칸.
 * 그리드 밖이어도 음수/초과 인덱스를 그대로 돌려준다 — 판정은 isInsideGrid 로 따로 한다.
 */
export function worldToCell(spec: GridSpec, x: number, z: number): GridCell {
  return {
    col: gridIndex(Math.floor((x - spec.originX) / spec.cellSize)),
    row: gridIndex(Math.floor((z - spec.originZ) / spec.cellSize)),
  };
}

/** 그리드 칸 → 칸 중심의 월드 좌표. 오브젝트를 칸에 놓을 땐 언제나 중심을 쓴다. */
export function cellToWorld(spec: GridSpec, cell: GridCell): Vec2XZ {
  return [
    spec.originX + (cell.col + 0.5) * spec.cellSize,
    spec.originZ + (cell.row + 0.5) * spec.cellSize,
  ];
}

export function isInsideGrid(spec: GridSpec, cell: GridCell): boolean {
  return (
    cell.col >= 0 &&
    cell.col < spec.cols &&
    cell.row >= 0 &&
    cell.row < spec.rows
  );
}

/**
 * 칸 → 1차원 인덱스(row-major). walkable 마스크를 Uint8Array 하나로 들고 다니기 위한 것. (M1)
 * 그리드 밖이면 -1.
 */
export function cellToIndex(spec: GridSpec, cell: GridCell): number {
  if (!isInsideGrid(spec, cell)) return -1;
  return cell.row * spec.cols + cell.col;
}

export function indexToCell(spec: GridSpec, index: number): GridCell {
  return {
    col: gridIndex(index % spec.cols),
    row: gridIndex(Math.floor(index / spec.cols)),
  };
}

export function lengthXZ(x: number, z: number): number {
  return Math.hypot(x, z);
}

/** 길이 0 이면 [0, 0]. 대각선 입력이 √2 배 빨라지는 걸 막는다. */
export function normalizeXZ(x: number, z: number): Vec2XZ {
  const len = Math.hypot(x, z);
  if (len < 1e-6) return [0, 0];
  return [x / len, z / len];
}

/** current 를 target 쪽으로 최대 maxDelta 만큼 옮긴다. 넘어가지 않는다. */
export function moveToward(
  current: number,
  target: number,
  maxDelta: number,
): number {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

/** 각을 [-π, π) 로 접는다. */
export function wrapAngle(angle: number): number {
  const shifted = (angle + Math.PI) % TAU;
  return (shifted < 0 ? shifted + TAU : shifted) - Math.PI;
}

/**
 * from 에서 to 로 가는 최단 회전량.
 * 179° 에서 -179° 로 갈 때 +358° 가 아니라 -2° 가 나와야 한다. 캐릭터가 팽 도는 버그의 원인.
 */
export function shortestAngleDelta(from: number, to: number): number {
  return wrapAngle(to - from);
}

/**
 * 진행 방향 → yaw. 캐릭터의 로컬 전방이 -Z 라는 규약에 맞춰져 있다.
 * (three 에서 rotation.y = θ 는 (0,0,-1) 을 (-sinθ, 0, -cosθ) 로 보낸다)
 */
export function yawFromDirection(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

export function directionFromYaw(yaw: number): Vec2XZ {
  return [-Math.sin(yaw), -Math.cos(yaw)];
}

/** 각도 선형 보간. 최단 경로로 간다. 렌더 보간(alpha)에 쓴다. */
export function lerpAngle(from: number, to: number, t: number): number {
  return wrapAngle(from + shortestAngleDelta(from, to) * t);
}

/**
 * 프레임레이트 독립 지수 감쇠.
 *
 * lerp(a, b, 0.1) 을 매 프레임 돌리면 120Hz 모니터와 30fps 모바일에서 감속 곡선이 달라진다.
 * 카메라 "느낌"이 기기마다 다른 원인이 거의 항상 이것이다.
 * exp(-lambda * dt) 는 dt 를 어떻게 쪼개도 같은 결과가 나온다 (테스트로 증명해둔다).
 *
 * lambda 는 "초당 감쇠율" — 클수록 빠르게 붙는다. 카메라는 4~8, 캐릭터 회전은 10~16 정도.
 */
export function damp(
  current: number,
  target: number,
  lambda: number,
  dt: number,
): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}

/** damp 의 각도 버전. 최단 경로로 돈다. */
export function dampAngle(
  current: number,
  target: number,
  lambda: number,
  dt: number,
): number {
  const delta = shortestAngleDelta(current, target);
  return wrapAngle(current + delta * (1 - Math.exp(-lambda * dt)));
}
