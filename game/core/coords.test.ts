import { describe, expect, it } from "vitest";
import { ISLAND_GRID } from "@/shared/constants";
import { type GridSpec, gridIndex } from "@/shared/types";
import {
  cellToIndex,
  cellToWorld,
  damp,
  dampAngle,
  directionFromYaw,
  gridExtent,
  indexToCell,
  isInsideGrid,
  lerpAngle,
  moveToward,
  normalizeXZ,
  shortestAngleDelta,
  TAU,
  worldToCell,
  wrapAngle,
  yawFromDirection,
} from "./coords";

/** 손으로 검산 가능한 3x2 미니 그리드. 전역 상수를 쓰면 테스트가 못 읽힌다. */
const TINY: GridSpec = {
  cols: 3,
  rows: 2,
  cellSize: 2,
  originX: -3,
  originZ: -2,
};
const cell = (col: number, row: number) => ({
  col: gridIndex(col),
  row: gridIndex(row),
});

describe("월드 ↔ 그리드", () => {
  it("칸 중심을 왕복해도 같은 칸으로 돌아온다", () => {
    for (let row = 0; row < TINY.rows; row++) {
      for (let col = 0; col < TINY.cols; col++) {
        const [x, z] = cellToWorld(TINY, cell(col, row));
        expect(worldToCell(TINY, x, z)).toEqual(cell(col, row));
      }
    }
  });

  it("칸의 왼쪽 위 모서리는 그 칸에 속하고, 오른쪽 아래 모서리는 다음 칸이다", () => {
    // originX=-3, cellSize=2 이므로 col 0 은 [-3, -1)
    expect(worldToCell(TINY, -3, -2).col).toBe(0);
    expect(worldToCell(TINY, -1.001, -2).col).toBe(0);
    expect(worldToCell(TINY, -1, -2).col).toBe(1);
  });

  it("그리드 밖에서는 음수/초과 인덱스를 그대로 준다 (판정은 isInsideGrid 가 한다)", () => {
    const outside = worldToCell(TINY, -10, -10);
    expect(outside.col).toBeLessThan(0);
    expect(isInsideGrid(TINY, outside)).toBe(false);
    expect(isInsideGrid(TINY, cell(2, 1))).toBe(true);
    expect(isInsideGrid(TINY, cell(3, 1))).toBe(false);
  });

  it("1차원 인덱스를 왕복해도 같은 칸이다", () => {
    for (let i = 0; i < TINY.cols * TINY.rows; i++) {
      expect(cellToIndex(TINY, indexToCell(TINY, i))).toBe(i);
    }
    expect(cellToIndex(TINY, cell(-1, 0))).toBe(-1);
  });

  it("gridExtent 는 미터 단위 크기다", () => {
    expect(gridExtent(TINY)).toEqual([6, 4]);
    // 섬 격자는 크기가 바뀔 수 있다. 숫자를 베끼는 대신 스펙에서 유도한다 —
    // 안 그러면 섬을 넓힐 때마다 뜻 없이 깨진다.
    expect(gridExtent(ISLAND_GRID)).toEqual([
      ISLAND_GRID.cols * ISLAND_GRID.cellSize,
      ISLAND_GRID.rows * ISLAND_GRID.cellSize,
    ]);
  });
});

describe("스칼라 유틸", () => {
  it("moveToward 는 목표를 지나치지 않는다", () => {
    expect(moveToward(0, 10, 3)).toBe(3);
    expect(moveToward(0, 10, 100)).toBe(10);
    expect(moveToward(10, 0, 100)).toBe(0);
    expect(moveToward(-5, 5, 2)).toBe(-3);
  });

  it("normalizeXZ 는 대각선을 길이 1 로 만든다 (대각선이 √2 배 빨라지는 버그 방지)", () => {
    const [x, z] = normalizeXZ(1, 1);
    expect(Math.hypot(x, z)).toBeCloseTo(1, 10);
    expect(normalizeXZ(0, 0)).toEqual([0, 0]);
  });
});

describe("각도", () => {
  it("wrapAngle 은 [-π, π) 로 접는다", () => {
    expect(wrapAngle(0)).toBeCloseTo(0, 10);
    expect(wrapAngle(TAU)).toBeCloseTo(0, 10);
    expect(wrapAngle(TAU * 3 + 1)).toBeCloseTo(1, 10);
    for (let a = -20; a < 20; a += 0.37) {
      const w = wrapAngle(a);
      expect(w).toBeGreaterThanOrEqual(-Math.PI);
      expect(w).toBeLessThan(Math.PI);
    }
  });

  it("shortestAngleDelta 는 179° → -179° 를 -2° 로 본다 (캐릭터가 팽 도는 버그)", () => {
    const deg = (d: number) => (d * Math.PI) / 180;
    expect(shortestAngleDelta(deg(179), deg(-179))).toBeCloseTo(deg(2), 6);
    expect(shortestAngleDelta(deg(-179), deg(179))).toBeCloseTo(deg(-2), 6);
  });

  it("yaw ↔ 방향 왕복", () => {
    const directions: Array<[number, number]> = [
      [0, -1], // 북
      [1, 0], // 동
      [0, 1], // 남
      [-1, 0], // 서
      [1, -1],
      [-1, 1],
    ];
    for (const [dx, dz] of directions) {
      const [nx, nz] = normalizeXZ(dx, dz);
      const [rx, rz] = directionFromYaw(yawFromDirection(dx, dz));
      expect(rx).toBeCloseTo(nx, 10);
      expect(rz).toBeCloseTo(nz, 10);
    }
  });

  it("yaw 0 은 북쪽(-Z)을 본다 — 캐릭터 로컬 전방 규약", () => {
    const [x, z] = directionFromYaw(0);
    expect(x).toBeCloseTo(0, 10);
    expect(z).toBeCloseTo(-1, 10);
  });

  it("lerpAngle 은 ±π 이음매를 가로질러 짧은 쪽으로 간다", () => {
    const deg = (d: number) => (d * Math.PI) / 180;
    const mid = lerpAngle(deg(170), deg(-170), 0.5);
    // 0° 쪽이 아니라 180° 쪽으로 가야 한다.
    expect(Math.abs(mid)).toBeCloseTo(Math.PI, 6);
  });
});

describe("프레임레이트 독립 감쇠", () => {
  // 이 프로젝트에서 가장 중요한 테스트 중 하나다.
  // 카메라 "느낌"이 120Hz 모니터와 30fps 모바일에서 달라지는 원인이 여기 있다.
  it("damp: dt 를 어떻게 쪼개도 결과가 같다", () => {
    const oneStep = damp(0, 10, 4, 1 / 30);
    let split = 0;
    for (let i = 0; i < 4; i++) split = damp(split, 10, 4, 1 / 120);
    expect(split).toBeCloseTo(oneStep, 10);
  });

  it("반례: 고정 계수 lerp 는 프레임레이트에 따라 결과가 달라진다", () => {
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const oneStep = lerp(0, 10, 0.1);
    let split = 0;
    for (let i = 0; i < 4; i++) split = lerp(split, 10, 0.1);
    // 30fps 에서 1, 120fps 에서 3.44 — 3배 넘게 차이난다.
    expect(oneStep).toBeCloseTo(1, 6);
    expect(split).toBeGreaterThan(3);
  });

  it("damp 는 목표를 지나치지 않고 수렴한다", () => {
    let value = 0;
    for (let i = 0; i < 200; i++) {
      value = damp(value, 10, 8, 1 / 60);
      expect(value).toBeLessThanOrEqual(10);
    }
    expect(value).toBeCloseTo(10, 6);
  });

  it("dampAngle 도 dt 분할에 불변이고, 최단 경로로 돈다", () => {
    const deg = (d: number) => (d * Math.PI) / 180;
    const oneStep = dampAngle(deg(170), deg(-170), 6, 1 / 30);
    let split = deg(170);
    for (let i = 0; i < 4; i++) split = dampAngle(split, deg(-170), 6, 1 / 120);
    expect(split).toBeCloseTo(oneStep, 10);
    // 170° 에서 출발해 +방향(180° 쪽)으로 넘어갔거나 이미 음수로 접혔어야 한다.
    expect(Math.abs(shortestAngleDelta(deg(170), oneStep))).toBeLessThan(
      deg(21),
    );
  });
});
