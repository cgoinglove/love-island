import { describe, expect, it } from "vitest";
import { elevationAt } from "@/game/core/island";
import {
  boatsAt,
  crabsAt,
  finsAt,
  JUMP_SECONDS,
  jumpHeightAt,
  jumpPitchAt,
  jumpsAt,
  LANE_SPAN,
  whaleAt,
} from "./seaTraffic";

/**
 * 바다 생물의 규칙은 둘뿐이다.
 *
 *  1. **물 위에 있어야 한다.** 섬이 하트라 반지름이 각도마다 두 배 차이 나서,
 *     직선 항로든 원형 순찰이든 눈으로 대충 잡으면 반드시 어딘가에서 육지를 지난다.
 *  2. **시각만 같으면 결과가 같아야 한다.** 옆 사람과 같이 보는 게 전부인 연출이라
 *     한쪽 화면에만 배가 있으면 그건 없는 것보다 나쁘다.
 */

/** 이보다 얕으면 배가 바닥에 닿는다. 물가는 완만해서 -0.5m 면 이미 무릎이다. */
const FLOATABLE = -0.5;

describe("지나가는 배", () => {
  it("항로 어디에서도 육지 위로 올라가지 않는다", () => {
    const aground: string[] = [];
    // 한 바퀴가 가장 긴 항로도 96초면 다 돈다. 200초를 촘촘히 훑는다.
    for (let t = 0; t < 200; t += 0.25) {
      for (const boat of boatsAt(t)) {
        /**
         * 뱃전까지 본다. 중심만 재면 하트의 봉우리(x=±20 에서 z=-30 까지 밀고
         * 나온다)를 배 옆구리가 스치는 걸 놓친다.
         */
        for (const side of [-2.5, 0, 2.5]) {
          const depth = elevationAt(boat.x + side, boat.z);
          if (depth > FLOATABLE) {
            aground.push(
              `t=${t} 항로${boat.lane} (${boat.x.toFixed(1)}, ${boat.z})`,
            );
          }
        }
      }
    }
    expect(aground.slice(0, 3), "\n배가 육지 위를 지나갑니다.\n").toEqual([]);
  });

  it("같은 시각이면 어디서 계산해도 같은 자리다", () => {
    // 두 사람의 화면에서 배가 다른 자리에 있으면 "저 배 봐" 가 성립하지 않는다.
    expect(boatsAt(1234.5)).toEqual(boatsAt(1234.5));
  });

  it("끊기지 않고 이어서 지나간다", () => {
    /**
     * 항로 끝에서 반대편으로 되돌아가는 순간이 있다. 그 한 프레임에 배가
     * 화면을 가로질러 순간이동하는데, 그게 **보이는 자리**에서 일어나면 안 된다.
     */
    for (let t = 0; t < 200; t += 0.05) {
      const before = boatsAt(t);
      const after = boatsAt(t + 0.05);
      for (const [index, boat] of after.entries()) {
        const previous = before[index];
        if (!previous) continue;
        const step = Math.abs(boat.x - previous.x);
        /**
         * 되돌아가는 순간은 항로 끝, 즉 한참 화면 밖이다. 의자에서 보이는
         * 좌우 폭이 가장 넓은 항로도 24m 라, 그 세 배 밖이면 안 보인다.
         */
        if (step > 1) expect(Math.abs(boat.x)).toBeGreaterThan(LANE_SPAN - 1);
      }
    }
  });
});

describe("지느러미", () => {
  it("늘 물 위를 돈다", () => {
    for (let t = 0; t < 400; t += 1) {
      for (const fin of finsAt(t)) {
        expect(elevationAt(fin.x, fin.z)).toBeLessThan(FLOATABLE);
      }
    }
  });

  it("가는 방향을 보고 헤엄친다", () => {
    // yaw 가 진행 방향과 어긋나면 지느러미가 옆으로 미끄러지는 것처럼 보인다.
    for (const t of [0, 37, 88, 143]) {
      const now = finsAt(t);
      const next = finsAt(t + 0.5);
      for (const [index, fin] of now.entries()) {
        const ahead = next[index];
        if (!ahead) continue;
        const moved = Math.atan2(-(ahead.x - fin.x), -(ahead.z - fin.z));
        const gap = Math.abs(
          Math.atan2(Math.sin(moved - fin.yaw), Math.cos(moved - fin.yaw)),
        );
        expect(gap).toBeLessThan(0.2);
      }
    }
  });
});

describe("튀어오르는 물고기", () => {
  it("물에서만 튀어오른다", () => {
    for (let t = 0; t < 300; t += 0.2) {
      for (const jump of jumpsAt(t)) {
        expect(elevationAt(jump.x, jump.z)).toBeLessThan(FLOATABLE);
      }
    }
  });

  it("한 번의 도약이 끊기지 않고 이어진다", () => {
    /**
     * 슬롯 경계에 걸쳐 시작한 도약이 다음 슬롯에서 사라지면, 물고기가 공중에서
     * 증발한다. 그래서 jumpsAt 은 직전 슬롯도 같이 본다.
     */
    let seen = 0;
    for (let t = 0; t < 120; t += 0.05) {
      const jumps = jumpsAt(t);
      if (jumps.length === 0) continue;
      seen += 1;
      for (const jump of jumps) {
        expect(jump.progress).toBeGreaterThanOrEqual(0);
        expect(jump.progress).toBeLessThanOrEqual(1);
      }
    }
    // 4.5초마다 1.05초씩이므로 대략 23% 의 시간 동안 물고기가 나와 있다.
    expect(seen / (120 / 0.05)).toBeGreaterThan(0.15);
  });

  it("물 밖으로 나왔다 다시 잠긴다", () => {
    expect(jumpHeightAt(0)).toBeCloseTo(0);
    expect(jumpHeightAt(1)).toBeCloseTo(0);
    expect(jumpHeightAt(0.5)).toBeGreaterThan(1);
    // 나올 땐 위를, 들어갈 땐 아래를 본다.
    expect(jumpPitchAt(0)).toBeGreaterThan(0);
    expect(jumpPitchAt(1)).toBeLessThan(0);
  });

  it("도약 시간이 슬롯을 넘지 않는다", () => {
    // 넘으면 두 도약이 겹쳐서 같은 물고기가 둘로 보인다.
    expect(JUMP_SECONDS).toBeLessThan(4.5);
  });
});

describe("모래밭의 꽃게", () => {
  it("늘 마른 땅 위에 있다", () => {
    /**
     * 해안선에서 좌표를 뽑되 **뭍 쪽으로** 들어와야 한다. 부호를 뒤집으면
     * 게가 바다 위를 걸어다니고, 너무 들어오면 잔디밭에서 걸어다닌다.
     */
    for (let t = 0; t < 700; t += 2) {
      for (const crab of crabsAt(t)) {
        const ground = elevationAt(crab.x, crab.z);
        expect(ground).toBeGreaterThan(0.1);
        // 물가의 모래밭이지 언덕이 아니다. 얕은 턱(0.75)보다 조금만 위.
        expect(ground).toBeLessThan(0.95);
      }
    }
  });

  it("같은 시각이면 어디서 계산해도 같은 자리다", () => {
    expect(crabsAt(482.5)).toEqual(crabsAt(482.5));
  });

  it("옆으로 걷는다", () => {
    // 게는 진행 방향에 몸을 90° 튼다. 앞을 보고 걸으면 그건 게가 아니다.
    for (const t of [0, 61, 143]) {
      const now = crabsAt(t);
      const next = crabsAt(t + 0.5);
      for (const [index, crab] of now.entries()) {
        const ahead = next[index];
        if (!ahead) continue;
        const moved = Math.atan2(-(ahead.x - crab.x), -(ahead.z - crab.z));
        const gap = Math.abs(
          Math.atan2(Math.sin(moved - crab.yaw), Math.cos(moved - crab.yaw)),
        );
        expect(Math.abs(gap - Math.PI / 2)).toBeLessThan(0.25);
      }
    }
  });
});

describe("고래", () => {
  /** 시험용 하루. 실제 값(dayNight)과 무관하게 규칙만 본다. */
  const CYCLE = 180;

  it("하루에 낮 한 번 밤 한 번만 나온다", () => {
    const shows = new Set<number>();
    let onstage = 0;
    for (let t = 0; t < CYCLE; t += 0.25) {
      const whale = whaleAt(t, CYCLE);
      if (!whale) continue;
      shows.add(whale.key);
      onstage += 0.25;
    }
    expect(shows.size).toBe(2);
    /**
     * 없는 시간이 있는 시간보다 길어야 한다. 늘 앞바다에 떠 있으면 그건
     * 사건이 아니라 풍경이고, 두 번째 보는 순간 아무도 안 쳐다본다.
     */
    expect(onstage).toBeLessThan(CYCLE / 2);
  });

  it("한 번은 낮, 한 번은 밤에 나온다", () => {
    // 하루를 반으로 갈라 앞이 낮, 뒤가 밤이다(정오 0.25 · 자정 0.75).
    const phases = new Set<string>();
    for (let t = 0; t < CYCLE; t += 0.25) {
      if (whaleAt(t, CYCLE)) phases.add(t < CYCLE / 2 ? "낮" : "밤");
    }
    expect([...phases].sort()).toEqual(["낮", "밤"]);
  });

  it("육지 위로 올라오지 않는다", () => {
    for (let t = 0; t < CYCLE * 2; t += 0.25) {
      const whale = whaleAt(t, CYCLE);
      if (!whale) continue;
      expect(elevationAt(whale.x, whale.z)).toBeLessThan(FLOATABLE);
    }
  });

  it("분수 · 잠수 · 도약 · 착수를 순서대로 한 번씩 지난다", () => {
    /**
     * 물보라는 **대목이 바뀌는 순간**에 터진다. 단계가 뒤로 돌아가거나
     * 건너뛰면 같은 분수가 두 번 터지거나 착수가 통째로 빠진다.
     */
    const seen: number[] = [];
    let last = -1;
    for (let t = 0; t < CYCLE; t += 0.05) {
      const whale = whaleAt(t, CYCLE);
      if (!whale || whale.key !== 0) continue;
      if (whale.stage !== last) {
        seen.push(whale.stage);
        last = whale.stage;
      }
    }
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("도약할 때만 물 밖으로 크게 솟는다", () => {
    let peak = { y: -99, stage: -1 };
    for (let t = 0; t < CYCLE; t += 0.05) {
      const whale = whaleAt(t, CYCLE);
      if (whale && whale.y > peak.y) peak = { y: whale.y, stage: whale.stage };
    }
    /**
     * 몸의 절반 넘게 나와야 도약이다.
     *
     * ⚠ 무작정 높이 뛰면 안 된다 — 카메라가 쓸 수 있는 하늘은 수평선 위
     *   10° 뿐이라, 108m 밖에서 몸 꼭대기가 20m 를 넘으면 화면 밖으로 잘린다.
     *   30m 짜리가 34° 로 솟으면 코가 13m 언저리로 딱 들어온다. 한 번
     *   48° 로 세웠다가 코가 화면 위로 잘려 나갔다.
     */
    expect(peak.y).toBeGreaterThan(3.5);
    expect(peak.y).toBeLessThan(6);
    expect(peak.stage).toBe(4);
  });

  it("같은 시각이면 어디서 계산해도 같은 자세다", () => {
    /**
     * 결정성이 필요한 건 **같은 순간을 보는 두 사람**이다. 이게 깨지면
     * 옆 사람과 다른 고래를 보게 된다.
     *
     * ⚠ 어제와 오늘이 같을 필요는 없다. 헤엄치는 흔들림은 하루 주기와
     *   무관한 박자로 도므로(1.25 rad/s) 날마다 조금씩 다른 자세로 나타난다 —
     *   그게 오히려 맞다. 같은 쇼가 매번 프레임 단위로 똑같으면 그건 녹화다.
     */
    expect(whaleAt(41.5, CYCLE)).toEqual(whaleAt(41.5, CYCLE));
    expect(whaleAt(52.25, CYCLE)).toEqual(whaleAt(52.25, CYCLE));
  });

  it("물 위에 있는 동안 몸이 오르내린다", () => {
    /**
     * 자리만 옮겨 놓으면 **죽은 고래**다 — 30m 짜리가 수면을 미끄러져
     * 지나가는 건 헤엄치는 게 아니라 떠내려가는 것이다.
     */
    const heights: number[] = [];
    for (let t = 0.22 * CYCLE + 3; t < 0.22 * CYCLE + 11; t += 0.2) {
      const whale = whaleAt(t, CYCLE);
      if (whale) heights.push(whale.y);
    }
    const swing = Math.max(...heights) - Math.min(...heights);
    expect(swing).toBeGreaterThan(0.5);
  });
});

describe("지나가는 배 — 사라짐", () => {
  it("항로 끝에서는 이미 다 흐려져 있다", () => {
    /**
     * 되돌아가는 순간이 화면 안에 들어와도 깜빡이면 안 된다.
     * 끝에 닿기 전에 0 이 되어야 **안개에 녹아드는** 것으로 보인다.
     */
    for (let t = 0; t < 200; t += 0.25) {
      for (const boat of boatsAt(t)) {
        if (Math.abs(boat.x) > LANE_SPAN - 2)
          expect(boat.fade).toBeLessThan(0.1);
      }
    }
  });

  it("한복판에서는 또렷하다", () => {
    for (let t = 0; t < 200; t += 0.25) {
      for (const boat of boatsAt(t)) {
        if (Math.abs(boat.x) < LANE_SPAN * 0.5) expect(boat.fade).toBe(1);
      }
    }
  });
});
