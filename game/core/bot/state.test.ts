import { describe, expect, it } from "vitest";
import type { Vec2XZ } from "@/shared/types";
import {
  BOT_LINE_MS,
  BOT_SPEED,
  currentLine,
  damp,
  dampAngle,
  electOwner,
  isOwner,
  pathDuration,
  poseAlongPath,
  SMOOTH_LAMBDA,
} from "./state";

const STRAIGHT: Vec2XZ[] = [
  [0, 0],
  [10, 0],
];

describe("소유자 선출", () => {
  it("누가 계산해도 같은 사람이 나온다", () => {
    /**
     * 이게 이 설계의 전부다. 목록만 같으면 협상 없이 같은 답이 나오므로
     * 합의 프로토콜이 필요 없다.
     */
    const ids = ["p_c", "p_a", "p_b"];
    expect(electOwner(ids)).toBe("p_a");
    expect(electOwner([...ids].reverse())).toBe("p_a");
    expect(electOwner(["p_b", "p_c", "p_a"])).toBe("p_a");
  });

  it("소유자가 나가면 다음 사람이 이어받는다", () => {
    expect(electOwner(["p_a", "p_b", "p_c"])).toBe("p_a");
    expect(electOwner(["p_b", "p_c"])).toBe("p_b");
    expect(electOwner(["p_c"])).toBe("p_c");
  });

  it("아무도 없으면 소유자도 없다", () => {
    // 빈 섬에서 봇이 혼자 돌아다닐 이유가 없다.
    expect(electOwner([])).toBeNull();
    expect(isOwner("p_a", [])).toBe(false);
  });

  it("혼자 있으면 내가 소유자다", () => {
    expect(isOwner("p_a", ["p_a"])).toBe(true);
  });
});

describe("경로 위 위치", () => {
  it("경과 시간과 속도로 정확히 나아간다", () => {
    // 프레임마다 적분하지 않는다는 게 핵심 — 탭이 백그라운드에 있다 와도 안 어긋난다.
    const half = poseAlongPath(STRAIGHT, 5 / BOT_SPEED);
    expect(half.x).toBeCloseTo(5, 5);
    expect(half.moving).toBe(true);
  });

  it("도착하면 끝점에 멈춘다", () => {
    const done = poseAlongPath(STRAIGHT, 999);
    expect(done.x).toBeCloseTo(10, 5);
    expect(done.moving).toBe(false);
  });

  it("출발 전이나 시간이 음수여도 시작점에 있다", () => {
    // 시계 보정으로 시각이 살짝 과거가 될 수 있다. 그때 봇이 뒤로 가면 안 된다.
    expect(poseAlongPath(STRAIGHT, -3).x).toBeCloseTo(0, 5);
  });

  it("꺾인 경로도 구간을 넘어가며 따라간다", () => {
    const corner: Vec2XZ[] = [
      [0, 0],
      [10, 0],
      [10, 10],
    ];
    const past = poseAlongPath(corner, 15 / BOT_SPEED);
    expect(past.x).toBeCloseTo(10, 5);
    expect(past.z).toBeCloseTo(5, 5);
  });

  it("바라보는 방향이 진행 방향과 맞는다", () => {
    // 캐릭터의 로컬 전방은 -Z 다. 북쪽(-Z)으로 갈 때 yaw 가 0 이어야 한다.
    const north = poseAlongPath(
      [
        [0, 0],
        [0, -10],
      ],
      0.1,
    );
    expect(Math.abs(north.yaw)).toBeCloseTo(0, 5);

    const east = poseAlongPath(STRAIGHT, 0.1);
    expect(east.yaw).toBeCloseTo(Math.PI / 2, 5);
  });

  it("점 하나짜리 경로는 제자리에 선다", () => {
    const still = poseAlongPath([[3, 4]], 10);
    expect([still.x, still.z]).toEqual([3, 4]);
    expect(still.moving).toBe(false);
  });

  it("같은 시각이면 누가 계산하든 같은 자리다", () => {
    // 결정만 나누고 위치는 각자 계산한다는 설계가 성립하는 근거.
    const a = poseAlongPath(STRAIGHT, 1.234);
    const b = poseAlongPath(STRAIGHT, 1.234);
    expect(a).toEqual(b);
  });
});

describe("걷는 시간", () => {
  it("거리 ÷ 속도다", () => {
    expect(pathDuration(STRAIGHT)).toBeCloseTo(10 / BOT_SPEED, 5);
  });
});

describe("대사", () => {
  it("시간이 지나면 다음 줄로 넘어간다", () => {
    const lines = ["첫 줄", "둘째 줄"];
    expect(currentLine(lines, 0)).toBe("첫 줄");
    expect(currentLine(lines, BOT_LINE_MS + 10)).toBe("둘째 줄");
  });

  it("다 끝나면 말풍선이 사라진다", () => {
    // 영영 떠 있으면 안내가 아니라 간판이다.
    expect(currentLine(["하나"], BOT_LINE_MS * 3)).toBeNull();
    expect(currentLine([], 0)).toBeNull();
  });
});

describe("렌더 위치 스무딩", () => {
  it("목표를 향해 다가가되 한 번에 도달하지 않는다", () => {
    /**
     * 결정이 늦게 도착한 만큼 권위 위치는 이미 앞서 있다. 거기 바로 갖다 놓으면
     * peer 화면에서 봇이 건너뛴다 — 소유자만 멀쩡히 보이고 남들은 순간이동을 본다.
     */
    const step = damp(0, 10, SMOOTH_LAMBDA, 1 / 60);
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(10);
  });

  it("프레임이 길든 짧든 같은 시간에 같은 만큼 온다", () => {
    // dt 로 그냥 곱하면 프레임레이트에 따라 속도가 달라진다. 지수 감쇠는 안 그렇다.
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 10, SMOOTH_LAMBDA, 1 / 60);
    let b = 0;
    for (let i = 0; i < 6; i++) b = damp(b, 10, SMOOTH_LAMBDA, 1 / 6);
    expect(a).toBeCloseTo(b, 1);
  });

  it("각도는 최단 방향으로 돈다", () => {
    // -3.0 에서 3.0 으로 갈 땐 한 바퀴 도는 게 아니라 경계를 넘어야 한다.
    const next = dampAngle(-3.0, 3.0, SMOOTH_LAMBDA, 1 / 60);
    expect(next).toBeLessThan(-3.0);
  });

  it("충분히 오래 지나면 목표에 닿는다", () => {
    let value = 0;
    for (let i = 0; i < 600; i++) value = damp(value, 7, SMOOTH_LAMBDA, 1 / 60);
    expect(value).toBeCloseTo(7, 4);
  });
});
