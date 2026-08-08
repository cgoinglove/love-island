import {
  cellToIndex,
  cellToWorld,
  indexToCell,
  worldToCell,
} from "@/game/core/coords";
import type { GridCell, Vec2XZ } from "@/shared/types";
import {
  canStandAt,
  isWalkableIndex,
  type NavGrid,
  nearestWalkableCell,
} from "./grid";

/**
 * 8방향 A*. three 도 react 도 모르는 순수 함수라 vitest 로 검증한다.
 *
 * 성능보다 정확성을 우선한 구현이다. 96x96 = 9216 칸이면 최악의 경우도 1ms 안에 끝나고,
 * 경로 계산은 탭할 때 한 번만 돈다 — 매 프레임 도는 코드가 아니다.
 */

const SQRT2 = Math.SQRT2;

/** 대각선 이동 비용을 √2 로 두면 지그재그 대신 자연스러운 대각선이 나온다. */
function octileHeuristic(dCol: number, dRow: number): number {
  const a = Math.abs(dCol);
  const b = Math.abs(dRow);
  return a + b + (SQRT2 - 2) * Math.min(a, b);
}

/** fScore 를 보고 정렬하는 최소 힙. 인덱스만 담는다. */
function createHeap(fScore: Float64Array) {
  const heap: number[] = [];

  const scoreOf = (index: number) => fScore[index] ?? Number.POSITIVE_INFINITY;

  const swap = (a: number, b: number) => {
    const tmp = heap[a] as number;
    heap[a] = heap[b] as number;
    heap[b] = tmp;
  };

  return {
    get size() {
      return heap.length;
    },
    push(index: number) {
      heap.push(index);
      let child = heap.length - 1;
      while (child > 0) {
        const parent = (child - 1) >> 1;
        if (scoreOf(heap[parent] as number) <= scoreOf(heap[child] as number))
          break;
        swap(parent, child);
        child = parent;
      }
    },
    pop(): number | undefined {
      if (heap.length === 0) return undefined;
      const top = heap[0] as number;
      const last = heap.pop() as number;
      if (heap.length > 0) {
        heap[0] = last;
        let parent = 0;
        for (;;) {
          const left = parent * 2 + 1;
          const right = left + 1;
          let smallest = parent;
          if (
            left < heap.length &&
            scoreOf(heap[left] as number) < scoreOf(heap[smallest] as number)
          ) {
            smallest = left;
          }
          if (
            right < heap.length &&
            scoreOf(heap[right] as number) < scoreOf(heap[smallest] as number)
          ) {
            smallest = right;
          }
          if (smallest === parent) break;
          swap(parent, smallest);
          parent = smallest;
        }
      }
      return top;
    },
  };
}

/**
 * 칸 단위 경로 탐색. 출발/도착이 막힌 칸이면 가장 가까운 통행 가능 칸으로 밀어준다.
 * @returns 칸 인덱스 배열(출발 포함). 길이 0 이면 경로 없음.
 */
export function findCellPath(
  grid: NavGrid,
  from: GridCell,
  to: GridCell,
): number[] {
  const { spec } = grid;
  const start = nearestWalkableCell(grid, from);
  const goal = nearestWalkableCell(grid, to);
  if (start === null || goal === null) return [];

  const startIndex = cellToIndex(spec, start);
  const goalIndex = cellToIndex(spec, goal);
  if (startIndex < 0 || goalIndex < 0) return [];
  if (startIndex === goalIndex) return [startIndex];

  const size = spec.cols * spec.rows;
  const gScore = new Float64Array(size).fill(Number.POSITIVE_INFINITY);
  const fScore = new Float64Array(size).fill(Number.POSITIVE_INFINITY);
  const cameFrom = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);

  gScore[startIndex] = 0;
  fScore[startIndex] = octileHeuristic(
    goal.col - start.col,
    goal.row - start.row,
  );

  const open = createHeap(fScore);
  open.push(startIndex);

  while (open.size > 0) {
    const current = open.pop();
    if (current === undefined) break;
    if (current === goalIndex) return reconstruct(cameFrom, current);
    if (closed[current] === 1) continue;
    closed[current] = 1;

    const cell = indexToCell(spec, current);
    const currentG = gScore[current] ?? Number.POSITIVE_INFINITY;

    for (let dRow = -1; dRow <= 1; dRow++) {
      for (let dCol = -1; dCol <= 1; dCol++) {
        if (dCol === 0 && dRow === 0) continue;

        const col = cell.col + dCol;
        const row = cell.row + dRow;
        if (col < 0 || col >= spec.cols || row < 0 || row >= spec.rows)
          continue;

        const neighbor = row * spec.cols + col;
        if (!isWalkableIndex(grid, neighbor) || closed[neighbor] === 1)
          continue;

        // 모서리 자르기 금지: 대각선으로 가려면 양옆 두 칸이 모두 뚫려 있어야 한다.
        // 이걸 빼면 캐릭터가 나무 두 그루 사이의 존재하지 않는 틈으로 빠져나간다.
        if (dCol !== 0 && dRow !== 0) {
          const sideA = cell.row * spec.cols + col;
          const sideB = row * spec.cols + cell.col;
          if (!isWalkableIndex(grid, sideA) || !isWalkableIndex(grid, sideB))
            continue;
        }

        const step = dCol !== 0 && dRow !== 0 ? SQRT2 : 1;
        const tentative = currentG + step;
        if (tentative >= (gScore[neighbor] ?? Number.POSITIVE_INFINITY))
          continue;

        cameFrom[neighbor] = current;
        gScore[neighbor] = tentative;
        fScore[neighbor] =
          tentative + octileHeuristic(goal.col - col, goal.row - row);
        open.push(neighbor);
      }
    }
  }

  return [];
}

function reconstruct(cameFrom: Int32Array, goal: number): number[] {
  const path: number[] = [goal];
  let cursor = goal;
  while (true) {
    const previous = cameFrom[cursor];
    if (previous === undefined || previous < 0) break;
    path.push(previous);
    cursor = previous;
  }
  return path.reverse();
}

/**
 * 두 지점 사이에 몸이 지나갈 수 있는 직선이 있는가.
 * 칸의 절반 간격으로 샘플링한다 — 칸보다 성기게 보면 얇은 벽을 통과해버린다.
 * 두께는 마스크에 이미 들어 있어서 반지름을 따로 받지 않는다.
 */
export function hasLineOfSight(
  grid: NavGrid,
  from: Vec2XZ,
  to: Vec2XZ,
): boolean {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const distance = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(distance / (grid.spec.cellSize * 0.5)));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!canStandAt(grid, from[0] + dx * t, from[1] + dz * t)) return false;
  }
  return true;
}

/**
 * 스트링 풀링. A* 가 뱉은 칸 단위 계단 경로에서 불필요한 꺾임을 걷어낸다.
 *
 * 이 단계가 없으면 캐릭터가 45도씩 각지게 움직여서 즉시 "게임 AI" 처럼 보인다.
 * 앵커에서 시야가 닿는 가장 먼 점까지 직선으로 잇고, 거기서 다시 시작한다.
 */
export function smoothPath(grid: NavGrid, points: Vec2XZ[]): Vec2XZ[] {
  if (points.length <= 2) return points;

  const result: Vec2XZ[] = [points[0] as Vec2XZ];
  let anchor = 0;

  while (anchor < points.length - 1) {
    let furthest = anchor + 1;
    for (let candidate = points.length - 1; candidate > anchor; candidate--) {
      if (
        hasLineOfSight(
          grid,
          points[anchor] as Vec2XZ,
          points[candidate] as Vec2XZ,
        )
      ) {
        furthest = candidate;
        break;
      }
    }
    result.push(points[furthest] as Vec2XZ);
    anchor = furthest;
  }

  return result;
}

/**
 * 월드 좌표 → 월드 좌표 경로. 게임 코드가 실제로 부르는 함수는 이것 하나다.
 * @returns 웨이포인트 배열. 출발점은 포함하지 않는다 (이미 거기 서 있으므로).
 */
export function findPath(grid: NavGrid, from: Vec2XZ, to: Vec2XZ): Vec2XZ[] {
  const cells = findCellPath(
    grid,
    worldToCell(grid.spec, from[0], from[1]),
    worldToCell(grid.spec, to[0], to[1]),
  );
  if (cells.length === 0) return [];

  const worldPoints: Vec2XZ[] = [from];
  for (const index of cells) {
    worldPoints.push(cellToWorld(grid.spec, indexToCell(grid.spec, index)));
  }

  return smoothPath(grid, worldPoints).slice(1);
}
