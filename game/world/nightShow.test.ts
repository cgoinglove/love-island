import { describe, expect, it } from "vitest";
import { SEA_BANNER, shoreRadiusAt } from "@/game/core/island";
import {
  SHOOTING_STAR_DURATION,
  shellsToFire,
  shootingStarAt,
} from "./nightShow";

/**
 * 밤 연출.
 *
 * 시각만으로 정해지므로 통신이 0 이다 — 누가 신호를 보내는 방식이면
 * 그 사람이 나가는 순간 연출이 멈춘다.
 */
describe("불꽃놀이 연출", () => {
  const CYCLE = 180;

  /** 하루를 훑으며 터진 발을 모은다. */
  function overOneDay(startDay = 0) {
    const shots: string[] = [];
    const step = 0.1;
    for (let t = startDay * CYCLE; t < (startDay + 1) * CYCLE; t += step) {
      for (const shot of shellsToFire(t, CYCLE, step)) shots.push(shot.key);
    }
    return shots;
  }

  it("하룻밤에 세 번 열린다", () => {
    // 달이 25% · 50% · 80% 를 지날 때. 그 사이엔 조용해야 연출이 연출로 남는다.
    const shows = new Set(overOneDay().map((key) => key.split(":")[1]));
    expect(shows.size).toBe(3);
  });

  it("한 번에 3~6발이 올라간다", () => {
    for (let day = 0; day < 12; day += 1) {
      const byShow = new Map<string, number>();
      for (const key of overOneDay(day)) {
        const show = key.split(":")[1] as string;
        byShow.set(show, (byShow.get(show) ?? 0) + 1);
      }
      for (const [show, count] of byShow) {
        expect(count, `${day}일차 ${show}번째`).toBeGreaterThanOrEqual(3);
        expect(count, `${day}일차 ${show}번째`).toBeLessThanOrEqual(6);
      }
    }
  });

  it("같은 발을 두 번 세지 않는다", () => {
    // 프레임마다 불리므로 중복이 나오면 매 프레임 터진다.
    const keys = overOneDay();
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("느린 프레임에서도 발을 안 놓친다", () => {
    /**
     * 탭이 백그라운드에 있다 돌아오면 프레임 간격이 몇 초씩 벌어진다.
     * "지금 이 순간인가" 로만 보면 그 사이의 발이 통째로 사라진다.
     */
    const coarse: string[] = [];
    const step = 2.5;
    for (let t = 0; t < CYCLE; t += step) {
      for (const shot of shellsToFire(t, CYCLE, step)) coarse.push(shot.key);
    }
    expect(new Set(coarse).size).toBe(new Set(overOneDay()).size);
  });

  it("날마다 다른 불꽃이 나온다", () => {
    // 매일 똑같으면 두 번째 밤부터는 안 본다.
    const a = overOneDay(3).length;
    const b = overOneDay(4).length;
    const positions = new Set<string>();
    for (let t = 0; t < CYCLE * 2; t += 0.1) {
      for (const shot of shellsToFire(t, CYCLE, 0.1)) {
        positions.add(shot.at.map((v) => v.toFixed(1)).join(","));
      }
    }
    expect(positions.size).toBeGreaterThan(Math.max(a, b));
  });

  it("깃발보다 먼 바다에서, 그리고 화면 안에서 터진다", () => {
    /**
     * 세 가지를 동시에 만족해야 한다.
     *
     * ① 섬 위면 안 된다 — 눈높이라 눈부시고 걸어다니는 자리를 파티클이 덮는다.
     * ② **배너보다 멀어야** 한다. 앞에서 터지면 깃발을 가려서 "깃발 앞에서
     *    폭죽이 터지는" 그림이 된다 — 원근이 통째로 어긋나 보인다.
     * ③ 화면 안이어야 한다. 카메라는 북쪽을 보고 가로 화각이 ±33° 남짓이라
     *    그 바깥에서 터지면 아무도 못 본다.
     */
    const bannerDistance = Math.hypot(SEA_BANNER[0], SEA_BANNER[1]);

    for (let t = 0; t < CYCLE * 3; t += 0.1) {
      for (const shot of shellsToFire(t, CYCLE, 0.1)) {
        const angle = Math.atan2(shot.at[1], shot.at[0]);
        const radius = Math.hypot(shot.at[0], shot.at[1]);

        /**
         * 어느 방향으로 쏘든 해안선 한참 바깥 = 물 위.
         *
         * ⚠ 절대 반지름이 아니라 **해안선에서 얼마나 나갔나**로 잰다.
         *   섬 크기를 바꾸면 절대값은 통째로 거짓말이 되는데, 정작 지켜야 하는
         *   성질(물 위에서 터진다)은 해안선과의 관계다.
         */
        expect(radius - shoreRadiusAt(angle)).toBeGreaterThan(20);
        expect(radius).toBeGreaterThan(bannerDistance + 4);
        /**
         * 무한정 멀어져도 안 된다 — 곡률이 거리 제곱으로 끌어내린다.
         * 보는 자리는 북쪽 물가(노을 의자)이므로 거기서의 거리로 잰다.
         */
        expect(radius - shoreRadiusAt(angle)).toBeLessThan(65);

        /**
         * 정북 한가운데는 배너 자리라 비워두고, 너무 벌어져도 안 된다 —
         * 섬이 세 배가 되면서 하트의 북쪽 봉우리가 옆 방위까지 자라나
         * 거기서 쏘면 육지 위다.
         */
        const bearing = Math.atan2(shot.at[0], -shot.at[1]);
        expect(Math.abs(bearing)).toBeLessThan(0.32);
        expect(Math.abs(bearing)).toBeGreaterThan(0.12);
      }
    }
  });

  it("밤의 연출은 평소보다 크게 터진다", () => {
    // "어마무시하게" 가 요구사항이다. 평소 감정표현(1배)과 구분돼야 한다.
    for (let t = CYCLE * 0.6; t < CYCLE; t += 0.1) {
      for (const shot of shellsToFire(t, CYCLE, 0.1)) {
        expect(shot.power).toBeGreaterThan(2);
      }
    }
  });

  it("낮에는 안 터진다", () => {
    // 위상 0~0.5 는 낮이다. 대낮의 불꽃은 안 보이고 파티클 풀만 먹는다.
    for (let t = 0; t < CYCLE * 0.5; t += 0.1) {
      expect(shellsToFire(t, CYCLE, 0.1)).toHaveLength(0);
    }
  });

  it("같은 시각이면 누구에게나 같은 발이다", () => {
    // 이게 성립해야 통신 없이 모두가 같은 걸 본다.
    for (let t = CYCLE * 0.6; t < CYCLE * 0.95; t += 0.37) {
      expect(shellsToFire(t, CYCLE, 0.37)).toEqual(
        shellsToFire(t, CYCLE, 0.37),
      );
    }
  });
});

describe("별똥별", () => {
  it("별이 안 보이면 별똥별도 없다", () => {
    expect(shootingStarAt(1000, 0)).toBeNull();
    expect(shootingStarAt(1000, 0.3)).toBeNull();
  });

  it("매번 나오지는 않는다", () => {
    // 슬롯마다 나오면 그건 유성우가 아니라 장식이다.
    let hits = 0;
    let slots = 0;
    for (let t = 0; t < 2000; t += 6.5) {
      slots += 1;
      if (shootingStarAt(t, 1)) hits += 1;
    }
    expect(hits).toBeGreaterThan(0);
    expect(hits).toBeLessThan(slots);
  });

  it("잠깐 나타났다 사라진다", () => {
    // 시작 직후엔 있고, 지속시간이 지나면 없다.
    for (let t = 0; t < 3000; t += 6.5) {
      const star = shootingStarAt(t, 1);
      if (!star) continue;
      expect(shootingStarAt(t + SHOOTING_STAR_DURATION + 0.2, 1)).toBeNull();
      break;
    }
  });

  it("같은 시각이면 누구에게나 같은 별똥별이다", () => {
    for (let t = 0; t < 500; t += 6.5) {
      expect(shootingStarAt(t, 1)).toEqual(shootingStarAt(t, 1));
    }
  });
});
