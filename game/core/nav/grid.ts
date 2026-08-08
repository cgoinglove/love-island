import {
  cellToIndex,
  cellToWorld,
  isInsideGrid,
  worldToCell,
} from "@/game/core/coords";
import type { GridCell, GridSpec, Vec2XZ } from "@/shared/types";

/**
 * 통행 가능 마스크. 칸 하나당 1바이트.
 *
 * ⚠ 이 마스크의 의미는 "여기 땅이 있다"가 **아니라** "몸의 중심이 여기 올 수 있다"이다.
 * 즉 캐릭터 두께가 이미 반영된 configuration space 다.
 *
 * 왜 이렇게 정의하는가 — 한 번 크게 데었기 때문이다.
 * 전에는 A* 가 "땅이 있나"(점 하나)를 보고, 이동은 "몸이 들어가나"(원)를 봤다.
 * 그러자 A* 가 0.5m 짜리 나무 틈으로 경로를 냈고 반지름 0.35m 인 몸은 거기 끼었다.
 * 경로는 멀쩡히 나오는데 캐릭터는 영원히 도착하지 못했다.
 *
 * 계획과 이동이 **같은 배열**을 보게 만들면 그 어긋남이 구조적으로 불가능해진다.
 */
export interface NavGrid {
  readonly spec: GridSpec;
  readonly walkable: Uint8Array;
}

/**
 * 몸이 차지하는 자리를 훑는 샘플 점. 중심 + 원주 8방향.
 * 원주만 보면 지름보다 좁은 기둥을 놓치고, 더 촘촘히 보면 굽는 시간만 길어진다.
 */
const FOOTPRINT: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2],
];

/**
 * 판정 함수를 받아 마스크를 굽는다.
 *
 * @param isPassable 그 지점에 땅이 있고 장애물이 없는가 (점 판정)
 * @param radius 캐릭터 반지름(m). 0 이면 점으로 취급한다 (테스트용)
 */
export function buildNavGrid(
  spec: GridSpec,
  isPassable: (x: number, z: number) => boolean,
  radius = 0,
): NavGrid {
  // 1단계: 점 판정. isPassable 은 지형·장애물을 다 보므로 칸당 한 번만 부른다.
  const ground = new Uint8Array(spec.cols * spec.rows);
  for (let row = 0; row < spec.rows; row++) {
    for (let col = 0; col < spec.cols; col++) {
      const [x, z] = cellToWorld(spec, { col, row } as GridCell);
      ground[row * spec.cols + col] = isPassable(x, z) ? 1 : 0;
    }
  }

  if (radius <= 0) return { spec, walkable: ground };

  // 2단계: 몸 두께를 먹인다. 1단계 결과를 배열 조회로만 훑으므로 싸다.
  const walkable = new Uint8Array(ground.length);
  for (let row = 0; row < spec.rows; row++) {
    for (let col = 0; col < spec.cols; col++) {
      const [cx, cz] = cellToWorld(spec, { col, row } as GridCell);
      let fits = true;
      for (const offset of FOOTPRINT) {
        const cell = worldToCell(
          spec,
          cx + offset[0] * radius,
          cz + offset[1] * radius,
        );
        // 그리드 밖은 막힌 것으로 본다. 가장자리에서 튀어나가지 않게.
        if (
          !isInsideGrid(spec, cell) ||
          ground[cell.row * spec.cols + cell.col] !== 1
        ) {
          fits = false;
          break;
        }
      }
      walkable[row * spec.cols + col] = fits ? 1 : 0;
    }
  }
  return { spec, walkable };
}

export function isWalkableIndex(grid: NavGrid, index: number): boolean {
  return grid.walkable[index] === 1;
}

export function isWalkableCell(grid: NavGrid, cell: GridCell): boolean {
  const index = cellToIndex(grid.spec, cell);
  return index >= 0 && grid.walkable[index] === 1;
}

/**
 * 몸의 중심이 이 지점에 올 수 있는가.
 *
 * 마스크에 이미 두께가 반영돼 있으므로 여기서 또 원주를 훑지 않는다 —
 * 두 번 먹이면 실제보다 두 배 뚱뚱한 몸이 되어 멀쩡한 길이 막힌다.
 */
export function canStandAt(grid: NavGrid, x: number, z: number): boolean {
  return isWalkableCell(grid, worldToCell(grid.spec, x, z));
}

/** 별칭. "월드 좌표로 묻는다"는 뜻이 더 분명한 자리에서 쓴다. */
export const isWalkableWorld = canStandAt;

/**
 * 바다나 나무를 탭했을 때 가장 가까운 갈 수 있는 칸을 찾는다.
 * 이게 없으면 물을 찍었을 때 아무 일도 안 일어나고, 사용자는 앱이 고장난 줄 안다.
 */
export function nearestWalkableCell(
  grid: NavGrid,
  cell: GridCell,
  maxRing = 40,
): GridCell | null {
  if (isWalkableCell(grid, cell)) return cell;

  for (let ring = 1; ring <= maxRing; ring++) {
    for (let offset = -ring; offset <= ring; offset++) {
      const candidates: GridCell[] = [
        { col: cell.col + offset, row: cell.row - ring } as GridCell,
        { col: cell.col + offset, row: cell.row + ring } as GridCell,
        { col: cell.col - ring, row: cell.row + offset } as GridCell,
        { col: cell.col + ring, row: cell.row + offset } as GridCell,
      ];
      for (const candidate of candidates) {
        if (
          isInsideGrid(grid.spec, candidate) &&
          isWalkableCell(grid, candidate)
        ) {
          return candidate;
        }
      }
    }
  }
  return null;
}

/** 월드 좌표를 가장 가까운 갈 수 있는 지점으로 스냅한다. */
export function snapToWalkable(
  grid: NavGrid,
  x: number,
  z: number,
): Vec2XZ | null {
  const cell = nearestWalkableCell(grid, worldToCell(grid.spec, x, z));
  return cell === null ? null : cellToWorld(grid.spec, cell);
}
