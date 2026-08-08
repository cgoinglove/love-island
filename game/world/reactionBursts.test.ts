import { describe, expect, it } from "vitest";
import { REACTION_KINDS } from "@/shared/presence";
import {
  buildBurst,
  fireworkBurstHeight,
  type Random,
  travel,
} from "./reactionBursts";

/** 시드 고정 난수. 같은 시드면 같은 버스트가 나와야 테스트가 성립한다. */
function seeded(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function all(kind: (typeof REACTION_KINDS)[number]) {
  return buildBurst(kind, 3, -7, seeded(42));
}

/**
 * 궤적 공식.
 *
 * 셰이더와 CPU 에 같은 식이 두 벌 있고 하나는 GLSL 이라 공유할 수가 없다.
 * 부호가 뒤집힌 채 한동안 굴러갔던 적이 있는데 — (v₀ + g/k)·decay - (g/k)·t 로
 * 적었더니 저항이 약할 때 중력 항이 통째로 상쇄되어 **색종이가 떨어지지 않고
 * 떠올랐다.** 눈으로는 "파티클이 좀 이상하다" 정도로만 보였다.
 * 아래 검산이 있었으면 첫날 잡혔을 것이다.
 */
describe("travel — 저항이 걸린 등가속 운동", () => {
  const NO_DRAG = 1e-6;

  it("저항이 없으면 자유낙하 공식과 같다", () => {
    // h = ½gt². 1초 뒤 -4.9m.
    expect(travel(0, -9.8, NO_DRAG, 1)).toBeCloseTo(-4.9, 3);
    expect(travel(0, -9.8, NO_DRAG, 2)).toBeCloseTo(-19.6, 2);
  });

  it("위로 던지면 올라갔다 내려온다", () => {
    // v₀=5, g=-9.8 이면 최고점은 t≈0.51s, 1s 뒤엔 +0.1m 로 돌아와 있다.
    expect(travel(5, -9.8, NO_DRAG, 1)).toBeCloseTo(0.1, 3);
    expect(travel(5, -9.8, NO_DRAG, 2)).toBeLessThan(0);
  });

  it("수평 성분은 중력을 안 받고 저항만 받는다", () => {
    const far = travel(10, 0, NO_DRAG, 1);
    const dragged = travel(10, 0, 2, 1);
    expect(far).toBeCloseTo(10, 3);
    expect(dragged).toBeLessThan(far);
    expect(dragged).toBeGreaterThan(0);
  });

  it("저항이 있으면 종단 속도로 수렴한다", () => {
    // v_∞ = g/k. 충분히 오래 지나면 그 속도로 등속 낙하한다.
    const k = 3;
    const g = -12;
    const terminal = g / k;
    const late = travel(0, g, k, 6) - travel(0, g, k, 5);
    expect(late).toBeCloseTo(terminal, 2);
  });
});

describe("buildBurst", () => {
  it("모든 종류가 입자를 만든다", () => {
    for (const kind of REACTION_KINDS) {
      expect(all(kind).length, kind).toBeGreaterThan(10);
    }
  });

  it("모든 입자가 바닥 높이를 안다", () => {
    // 이걸 빼먹은 종류는 땅을 뚫고 사라진다. 새 종류를 추가할 때 가장 놓치기 쉬운 값이다.
    for (const kind of REACTION_KINDS) {
      for (const p of all(kind)) {
        expect(p.floor, kind).toBeGreaterThan(0);
        // 터지는 자리의 지면이지 원점이 아니다.
        expect(p.floor, kind).toBeLessThan(5);
      }
    }
  });

  it("입자가 유한하고 살아 있는 값만 갖는다", () => {
    // NaN 하나가 섞이면 셰이더에서 입자가 통째로 사라지는데 원인을 찾기가 아주 어렵다.
    for (const kind of REACTION_KINDS) {
      for (const p of all(kind)) {
        for (const value of [p.ox, p.oy, p.oz, p.vx, p.vy, p.vz, p.size]) {
          expect(Number.isFinite(value), kind).toBe(true);
        }
        expect(p.life, kind).toBeGreaterThan(0);
        // 음수 딜레이는 "이미 지나간 시각에 태어남" 이라 영영 안 보인다.
        expect(p.delay, kind).toBeGreaterThanOrEqual(0);
        expect(p.size, kind).toBeGreaterThan(0);
      }
    }
  });

  it("터지는 자리를 그대로 따라간다", () => {
    // 감정표현은 보낸 사람 자리에서 터져야 한다. 원점에서 터지면 누가 보냈는지 모른다.
    // 폭죽만 예외로 비스듬히 올라가므로 몇 미터 옆에서 터진다.
    for (const kind of REACTION_KINDS) {
      const slack = kind === "firework" ? 6 : 1.5;
      for (const p of all(kind)) {
        expect(Math.abs(p.ox - 3), kind).toBeLessThan(slack);
        expect(Math.abs(p.oz + 7), kind).toBeLessThan(slack);
        expect(p.oy, kind).toBeGreaterThan(0);
      }
    }
  });

  it("하트는 떠오르고 색종이는 떨어진다", () => {
    // 중력 부호가 뒤집히면 하트가 바닥에 쏟아진다. 느낌을 정하는 값이라 못박아둔다.
    for (const p of buildBurst("heart", 0, 0, seeded(1))) {
      expect(p.gravity).toBeGreaterThan(0);
      expect(p.vy).toBeGreaterThan(0);
    }
    for (const p of buildBurst("confetti", 0, 0, seeded(1))) {
      expect(p.gravity).toBeLessThan(0);
      expect(p.vy).toBeGreaterThan(0);
    }
  });

  it("폭죽은 도화선이 타고 나서 터진다", () => {
    const particles = buildBurst("firework", 0, 0, seeded(7));
    const fuse = fireworkBurstHeight();
    const shells = particles.filter((p) => p.delay < 0.5);
    const sparks = particles.filter((p) => p.delay >= 0.5);

    expect(shells.length).toBeGreaterThan(0);
    expect(sparks.length).toBeGreaterThan(50);

    // 껍질은 땅 가까이서 출발하고, 불꽃은 껍질이 도달한 높이에서 태어난다.
    for (const shell of shells) expect(shell.oy).toBeLessThan(2);
    const primary = sparks.filter((p) => p.delay < 0.6);
    expect(primary.length).toBeGreaterThan(50);
    for (const spark of primary) expect(spark.oy).toBeCloseTo(fuse, 5);

    // 껍질은 터지는 순간 사라져야 한다. 안 그러면 불꽃 한가운데 점이 남는다.
    for (const shell of shells) {
      expect(shell.delay + shell.life).toBeLessThanOrEqual(
        Math.min(...sparks.map((s) => s.delay)) + 0.01,
      );
    }
  });

  it("올라가는 꼬리가 터지는 높이까지 닿는다", () => {
    /**
     * ⚠ 실제로 났던 버그다. 터지는 높이는 SHELL_SPEED * power 로 구하면서
     *   정작 꼬리는 SHELL_SPEED 로 그렸다. 밤의 큰 발(power 2~3)은 꼬리가 10m 에서
     *   끊기고 폭발은 25m 에서 일어났는데, 그 높이는 화면 위로 잘려 아무도 못 봤다.
     *   "밤 폭죽이 나약하다" 의 정체가 이것이었다.
     */
    for (const power of [1, 1.8, 2.5, 3]) {
      const particles = buildBurst("firework", 0, 0, seeded(11), power);
      const shell = particles.find((p) => p.delay === 0);
      expect(shell, `power ${power}`).toBeDefined();
      const reached =
        (shell?.oy ?? 0) +
        travel(shell?.vy ?? 0, shell?.gravity ?? 0, shell?.drag ?? 1, 0.55);
      expect(reached, `power ${power}`).toBeCloseTo(
        fireworkBurstHeight(power),
        5,
      );
    }
  });

  it("폭죽이 카메라에 담기는 높이에서 터진다", () => {
    /**
     * 카메라가 23° 숙이고 세로 화각이 40° 라, 화면에서 하늘로 보이는 띠는
     * 수평 아래 3°~14° 뿐이다. 70m 거리로 환산하면 지면 기준 0.5m ~ 15m.
     * 규모를 아무리 키워도 터지는 높이는 그 한가운데 있어야 한다 —
     * 규모는 높이가 아니라 **퍼지는 반지름**으로 낸다.
     */
    for (const power of [1, 2, 3]) {
      const height = fireworkBurstHeight(power);
      expect(height, `power ${power}`).toBeGreaterThan(6.5);
      expect(height, `power ${power}`).toBeLessThan(9.5);
    }
  });

  it("규모를 키우면 더 크게 퍼진다", () => {
    // "웅장하게" 가 요구사항이다. 배수를 올렸는데 그림이 그대로면 의미가 없다.
    const spread = (power: number) => {
      const particles = buildBurst("firework", 0, 0, seeded(5), power);
      const stars = particles.filter((p) => p.delay >= 0.5);
      return Math.max(...stars.map((p) => Math.hypot(p.vx, p.vy, p.vz)));
    };
    expect(spread(3)).toBeGreaterThan(spread(1) * 1.6);
  });

  it("원으로 터진다 — 별들이 같은 속도로 날아간다", () => {
    /**
     * 실제 폭죽이 동그랗게 보이는 이유는 별이 전부 같은 속도로 날아가
     * 얇은 구 껍데기 위에 놓이기 때문이다. 속도를 넓게 뿌리면 구 안쪽이 채워져
     * 화면에서는 그냥 뿌연 얼룩이 된다.
     */
    const particles = buildBurst("firework", 0, 0, seeded(13), 2.5);
    const burstY = fireworkBurstHeight(2.5);
    // 1차 폭발의 바깥 껍데기만 본다.
    // 연쇄와 안쪽 층은 일부러 느리고, 섬광 덩어리는 아예 안 움직인다(크기로 걸러낸다).
    const shell = particles.filter(
      (p) => p.delay === 0.55 && p.oy === burstY && p.size < 1,
    );
    expect(shell.length).toBeGreaterThan(100);

    const speeds = shell.map((p) => Math.hypot(p.vx, p.vy, p.vz));
    const min = Math.min(...speeds);
    const max = Math.max(...speeds);
    // 가장 빠른 별이 가장 느린 별의 1.15배를 넘지 않는다 = 껍데기가 얇다.
    expect(max / min).toBeLessThan(1.15);
  });

  it("연쇄가 일어난다 — 터진 원이 다시 터진다", () => {
    const particles = buildBurst("firework", 0, 0, seeded(17), 2.5);
    const burstY = fireworkBurstHeight(2.5);

    // 1차보다 늦게, 1차가 아닌 자리에서 태어나는 입자가 있어야 연쇄다.
    const secondary = particles.filter((p) => p.delay > 0.7);
    expect(secondary.length).toBeGreaterThan(50);
    const origins = new Set(
      secondary.map((p) => `${p.ox.toFixed(2)},${p.oy.toFixed(2)}`),
    );
    expect(origins.size).toBeGreaterThanOrEqual(5);
    for (const p of secondary) {
      expect(Math.abs(p.oy - burstY)).toBeGreaterThan(0.05);
    }
  });

  it("연쇄가 원 바깥쪽에서 터진다", () => {
    /**
     * 연쇄가 1차 원 한가운데서 겹치면 그냥 한 덩어리로 뭉쳐 보인다.
     * `BREAK_LAYERS.at` 을 저항의 시간상수보다 크게 잡아야 자식이 부모 원의
     * 바깥쪽에서 터지고, 그래야 이펙트가 넓게 흩어진다.
     */
    const particles = buildBurst("firework", 0, 0, seeded(29), 2.5);
    const burstY = fireworkBurstHeight(2.5);
    const primary = particles.filter((p) => p.delay === 0.55 && p.size < 1);
    const primaryRadius = Math.max(
      ...primary.map((p) => Math.hypot(p.vx, p.vy, p.vz) / p.drag),
    );

    const children = particles.filter((p) => p.delay > 0.7 && p.delay < 1.5);
    const offsets = [
      ...new Set(children.map((p) => `${p.ox},${p.oy},${p.oz}`)),
    ].map((key) => {
      const [ox, oy, oz] = key.split(",").map(Number) as [
        number,
        number,
        number,
      ];
      return Math.hypot(ox, oy - burstY, oz);
    });

    expect(offsets.length).toBeGreaterThanOrEqual(5);
    // 자식이 부모 반지름의 절반보다 바깥에서 터진다.
    const average = offsets.reduce((sum, d) => sum + d, 0) / offsets.length;
    expect(average).toBeGreaterThan(primaryRadius * 0.5);
  });

  it("연쇄의 연쇄까지 간다 — 3단이다", () => {
    /**
     * 2차만 있으면 "한 번 더 터졌다" 로 끝나고, 3차가 있어야 하늘이 계속
     * 번져 나가는 것처럼 보인다. 단계는 **딜레이 계단**으로 드러난다:
     * 도화선 → 1차(0.55) → 2차(1.10) → 3차(1.55).
     */
    for (const seed of [17, 31, 47]) {
      const particles = buildBurst("firework", 0, 0, seeded(seed), 2.5);
      const levels = [...new Set(particles.map((p) => p.delay.toFixed(3)))]
        .map(Number)
        .filter((d) => d >= 0.55)
        .sort((a, b) => a - b);

      // 0.55 · 0.60(안쪽 층) · 1.10 · 1.55 — 넷 이상이어야 3단이다.
      expect(levels.length, `시드 ${seed}`).toBeGreaterThanOrEqual(4);
      expect(Math.max(...levels), `시드 ${seed}`).toBeGreaterThan(1.4);

      // 3차 폭발이 실제로 입자를 만들고, 여러 자리에서 동시에 터진다.
      const third = particles.filter((p) => p.delay > 1.4);
      expect(third.length, `시드 ${seed}`).toBeGreaterThan(100);
      const thirdOrigins = new Set(
        third.map((p) => `${p.ox.toFixed(2)},${p.oz.toFixed(2)}`),
      );
      expect(thirdOrigins.size, `시드 ${seed}`).toBeGreaterThanOrEqual(10);
    }
  });

  it("작은 입자를 많이 쓴다", () => {
    /**
     * 큰 점 몇 개는 물감이고 작은 점 수천 개라야 불꽃이다.
     * 눈으로만 맞추면 다음에 크기를 만질 때 또 되돌아간다.
     */
    const particles = buildBurst("firework", 0, 0, seeded(19), 2.5);
    // 섬광 덩어리(크기 1 이상)는 빼고 별만 센다.
    const stars = particles.filter((p) => p.delay >= 0.55 && p.size < 1);
    expect(stars.length).toBeGreaterThan(3000);
    for (const star of stars) expect(star.size).toBeLessThan(0.3);
  });

  it("원이 느긋하게 퍼지고 그동안 살아 있다", () => {
    /**
     * 퍼지는 속도(저항)와 밝은 시간(수명)은 **따로** 조절해야 하는 값이다.
     * 저항을 올려 빨리 퍼지게 했더니 순식간에 지나갔고, 낮췄더니 다 퍼지기 전에
     * 별이 흐려졌다. 수명이 시간상수(1/k)의 네 배는 돼야 둘 다 성립한다.
     */
    const particles = buildBurst("firework", 0, 0, seeded(23), 2.5);
    const shell = particles.filter((p) => p.delay === 0.55 && p.size < 1);
    expect(shell.length).toBeGreaterThan(100);
    for (const star of shell) {
      expect(star.life).toBeGreaterThan((1 / star.drag) * 4);
    }
  });

  it("눈부신 흰 덩어리를 남기지 않는다", () => {
    /**
     * 한때 터진 자리에 반지름의 1.5배짜리 흰 불덩이를 얹고 실제 광원까지 켰다.
     * 밤바다 사진처럼 그럴싸했지만 화면에서는 색이 날아가 하얀 얼룩이 됐고,
     * 그 얼룩이 정작 봐야 할 **원의 모양을 덮었다.**
     * 입자 하나가 별보다 훨씬 커지면 그때가 다시 그렇게 되는 순간이다.
     */
    for (const kind of REACTION_KINDS) {
      for (const p of all(kind)) expect(p.size, kind).toBeLessThan(0.7);
    }
  });

  it("반응이 지체 없이 시작된다", () => {
    /**
     * 1·2·3 을 눌렀을 때 "굼뜨다" 고 느껴지면 대개 첫 입자가 늦게 태어나서다.
     * 종류를 불문하고 **누르는 즉시** 뭔가 보여야 한다.
     */
    for (const kind of REACTION_KINDS) {
      const delays = all(kind).map((p) => p.delay);
      expect(Math.min(...delays), kind).toBeLessThan(0.05);
      // 도화선(폭죽)까지 포함해도 0.6초 안에는 절정이 온다.
      expect(Math.min(...delays.filter((d) => d > 0)), kind).toBeLessThan(0.6);
    }
  });

  it("종류마다 제 모양만 쓴다", () => {
    // shape 가 섞이면 하트 버스트에 색종이가 끼어든다.
    for (const p of buildBurst("heart", 0, 0, seeded(3)))
      expect(p.shape).toBe(0);
    for (const p of buildBurst("confetti", 0, 0, seeded(3)))
      expect(p.shape).toBe(1);
    for (const p of buildBurst("firework", 0, 0, seeded(3)))
      expect(p.shape).toBe(2);
  });

  it("같은 시드면 같은 버스트가 나온다", () => {
    const a = buildBurst("confetti", 1, 2, seeded(9));
    const b = buildBurst("confetti", 1, 2, seeded(9));
    expect(a.map((p) => p.vx)).toEqual(b.map((p) => p.vx));
  });
});
