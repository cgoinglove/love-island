import { describe, expect, it } from "vitest";
import { type GridSpec, gridIndex, type Vec2XZ } from "@/shared/types";
import { findCellPath, findPath, hasLineOfSight, smoothPath } from "./astar";
import { buildNavGrid, type NavGrid } from "./grid";

/**
 * ASCII 로 그린 맵에서 NavGrid 를 만든다.
 * '.' 통행 가능, '#' 막힘. 칸 1m, 원점 (0,0) 이라 칸 (c,r) 의 중심은 (c+0.5, r+0.5).
 */
function mapOf(rows: string[]): NavGrid {
  const first = rows[0] ?? "";
  const spec: GridSpec = {
    cols: first.length,
    rows: rows.length,
    cellSize: 1,
    originX: 0,
    originZ: 0,
  };
  return buildNavGrid(spec, (x, z) => {
    const row = rows[Math.floor(z)];
    return row?.[Math.floor(x)] === ".";
  });
}

const cell = (col: number, row: number) => ({
  col: gridIndex(col),
  row: gridIndex(row),
});

describe("findCellPath", () => {
  it("뻥 뚫린 맵에서는 직선 거리에 해당하는 칸 수만 쓴다", () => {
    const grid = mapOf(["......", "......", "......"]);
    const path = findCellPath(grid, cell(0, 0), cell(5, 0));
    expect(path).toHaveLength(6);
  });

  it("출발과 도착이 같으면 한 칸짜리 경로", () => {
    const grid = mapOf(["..", ".."]);
    expect(findCellPath(grid, cell(1, 1), cell(1, 1))).toEqual([3]);
  });

  it("벽에 난 틈으로 돌아간다", () => {
    const grid = mapOf([
      "..........",
      "..........",
      "####.#####",
      "..........",
      "..........",
    ]);
    const path = findCellPath(grid, cell(0, 0), cell(9, 4));
    expect(path.length).toBeGreaterThan(0);
    // 반드시 틈(col 4, row 2)을 지나야 한다.
    expect(path).toContain(2 * 10 + 4);
  });

  it("도달할 수 없으면 빈 배열", () => {
    const grid = mapOf(["...#...", "...#...", "...#..."]);
    expect(findCellPath(grid, cell(0, 1), cell(6, 1))).toEqual([]);
  });

  it("모서리를 자르지 않는다 (나무 두 그루 사이의 없는 틈으로 빠져나가지 않는다)", () => {
    // (1,1) 에서 (2,2) 로 가는 대각선은 양옆이 모두 막혀 있어 지나갈 수 없다.
    const grid = mapOf(["....", "..#.", ".#..", "...."]);
    const path = findCellPath(grid, cell(1, 1), cell(2, 2));
    // 우회는 가능하지만 두 칸짜리(=대각선 한 방) 경로여서는 안 된다.
    expect(path.length).toBeGreaterThan(2);
  });

  it("막힌 칸을 목적지로 줘도 가장 가까운 갈 수 있는 칸으로 밀어준다", () => {
    const grid = mapOf(["....", "..#.", "...."]);
    const path = findCellPath(grid, cell(0, 0), cell(2, 1));
    expect(path.length).toBeGreaterThan(0);
  });

  it("경로의 각 칸은 실제로 통행 가능하고 서로 인접해 있다", () => {
    const grid = mapOf([
      "..........",
      ".####.###.",
      "..........",
      ".###.####.",
      "..........",
    ]);
    const path = findCellPath(grid, cell(0, 0), cell(9, 4));
    expect(path.length).toBeGreaterThan(0);
    for (let i = 0; i < path.length; i++) {
      const index = path[i] as number;
      expect(grid.walkable[index]).toBe(1);
      if (i === 0) continue;
      const previous = path[i - 1] as number;
      const dCol = Math.abs((index % 10) - (previous % 10));
      const dRow = Math.abs(Math.floor(index / 10) - Math.floor(previous / 10));
      expect(Math.max(dCol, dRow)).toBe(1);
    }
  });
});

describe("hasLineOfSight", () => {
  const grid = mapOf(["......", "..##..", "......"]);

  it("뚫린 직선은 보인다", () => {
    expect(hasLineOfSight(grid, [0.5, 0.5], [5.5, 0.5])).toBe(true);
  });

  it("벽을 관통하지 않는다", () => {
    expect(hasLineOfSight(grid, [2.5, 0.5], [2.5, 2.5])).toBe(false);
  });

  it("몸 두께는 마스크가 이미 알고 있다", () => {
    // radius 0 으로 구운 그리드는 점으로 취급하므로 1칸 틈을 지난다.
    const thin = mapOf(["...", "#.#", "..."]);
    expect(hasLineOfSight(thin, [1.5, 0.5], [1.5, 2.5])).toBe(true);

    // 같은 맵을 radius 0.9 로 구우면 가운데 칸이 통째로 막힌다.
    const thick = buildNavGrid(
      thin.spec,
      (x, z) => thin.walkable[Math.floor(z) * 3 + Math.floor(x)] === 1,
      0.9,
    );
    expect(hasLineOfSight(thick, [1.5, 0.5], [1.5, 2.5])).toBe(false);
  });
});

describe("smoothPath", () => {
  it("뻥 뚫린 곳에서는 중간 웨이포인트를 전부 걷어낸다", () => {
    const grid = mapOf(["........", "........", "........"]);
    const raw: Vec2XZ[] = Array.from({ length: 8 }, (_, i) => [i + 0.5, 0.5]);
    expect(smoothPath(grid, raw)).toHaveLength(2);
  });

  it("두 점 이하면 그대로 둔다", () => {
    const grid = mapOf(["..", ".."]);
    const raw: Vec2XZ[] = [
      [0.5, 0.5],
      [1.5, 1.5],
    ];
    expect(smoothPath(grid, raw)).toEqual(raw);
  });

  it("꺾여야 하는 곳의 꼭짓점은 남긴다", () => {
    const grid = mapOf(["......", "####..", "......"]);
    const raw: Vec2XZ[] = [
      [0.5, 2.5],
      [1.5, 2.5],
      [2.5, 2.5],
      [3.5, 2.5],
      [4.5, 2.5],
      [4.5, 1.5],
      [4.5, 0.5],
    ];
    const smoothed = smoothPath(grid, raw);
    expect(smoothed.length).toBeGreaterThan(2);
    expect(smoothed.length).toBeLessThan(raw.length);
  });
});

describe("findPath (월드 좌표)", () => {
  const grid = mapOf([
    "..........",
    "..........",
    "####.#####",
    "..........",
    "..........",
  ]);

  it("출발점은 빼고 웨이포인트만 돌려준다", () => {
    const from: Vec2XZ = [0.5, 0.5];
    const path = findPath(grid, from, [9.5, 4.5]);
    expect(path.length).toBeGreaterThan(0);
    expect(path[0]).not.toEqual(from);
  });

  it("마지막 웨이포인트는 목적지 근처다", () => {
    const path = findPath(grid, [0.5, 0.5], [9.5, 4.5]);
    const last = path[path.length - 1] as Vec2XZ;
    expect(Math.hypot(last[0] - 9.5, last[1] - 4.5)).toBeLessThan(1.5);
  });

  it("도달 불가면 빈 배열 (캐릭터는 그냥 제자리에 선다)", () => {
    const walled = mapOf(["...#...", "...#...", "...#..."]);
    expect(findPath(walled, [0.5, 1.5], [6.5, 1.5])).toEqual([]);
  });

  it("모든 웨이포인트는 설 수 있는 자리다", () => {
    const path = findPath(grid, [0.5, 0.5], [9.5, 4.5]);
    for (const [x, z] of path) {
      const col = Math.floor(x);
      const row = Math.floor(z);
      expect(grid.walkable[row * 10 + col]).toBe(1);
    }
  });
});
