import { describe, expect, it } from "vitest";
import {
  elevationAt,
  FURNITURE,
  ISLAND_BASE_RADIUS,
  isLandAt,
  LANDMARKS,
  SEA_LEVEL,
  SPAWN_POINT,
  shoreDistance,
  shoreRadiusAt,
} from "./island";

describe("해안선", () => {
  it("어느 각도에서도 섬이 사라지지 않는다", () => {
    /**
     * 하트라서 반지름 차이가 크다(가장 짧은 데가 가장 긴 데의 절반). 그건 의도다.
     * 여기서 막는 건 급수 계수를 잘못 만져서 어느 각도의 반지름이 0 이하로
     * 내려가는 것 — 그러면 섬에 구멍이 뚫리고 그 자리로 바다가 들어온다.
     */
    for (let angle = 0; angle < Math.PI * 2; angle += 0.02) {
      const radius = shoreRadiusAt(angle);
      expect(radius).toBeGreaterThan(ISLAND_BASE_RADIUS * 0.4);
      expect(radius).toBeLessThan(ISLAND_BASE_RADIUS * 1.1);
    }
  });

  it("하트 모양이다 — 러브 아일랜드니까", () => {
    const at = (deg: number) => shoreRadiusAt((deg * Math.PI) / 180);

    /**
     * 좌우 대칭. 접는 축은 꼭지(+Z)와 골(-Z)을 잇는 **세로축**이다.
     * 극좌표로는 r(θ) = r(180° − θ) — 사인 홀수 항만 남긴 급수의 성질이다.
     * (가로축 대칭 r(θ)=r(−θ) 로 잘못 적었다가 걸렸다. 하트는 그쪽으로는 안 접힌다.)
     */
    for (let deg = 1; deg < 90; deg += 3) {
      expect(at(deg), `${deg}°`).toBeCloseTo(at(180 - deg), 3);
    }

    // 남(+Z, 90°)이 가장 길다 — 하트의 아래 꼭지.
    // 북(-Z, 270°)이 가장 짧다 — 두 봉우리 사이의 골.
    const cleft = at(270);
    const point = at(90);
    expect(point).toBeGreaterThan(cleft * 1.7);

    // 봉우리 둘. 골보다 확실히 튀어나와야 두 개로 읽힌다.
    expect(at(210)).toBeGreaterThan(cleft * 1.5);
    expect(at(330)).toBeGreaterThan(cleft * 1.5);
  });

  it("완벽한 원이 아니다 (하모닉이 실제로 먹고 있다)", () => {
    const samples = Array.from({ length: 64 }, (_, i) =>
      shoreRadiusAt((i / 64) * Math.PI * 2),
    );
    const spread = Math.max(...samples) - Math.min(...samples);
    expect(spread).toBeGreaterThan(1.5);
  });

  it("2π 주기다 (한 바퀴 돌면 제자리)", () => {
    for (let angle = 0; angle < 6; angle += 0.5) {
      expect(shoreRadiusAt(angle)).toBeCloseTo(
        shoreRadiusAt(angle + Math.PI * 2),
        8,
      );
    }
  });

  it("shoreDistance 는 안쪽에서 음수, 바깥에서 양수", () => {
    // 절대 좌표를 박지 않는다 — 섬 크기를 바꿀 때마다 테스트가 같이 거짓말한다.
    const far = ISLAND_BASE_RADIUS * 1.5;
    expect(shoreDistance(0, 0)).toBeLessThan(0);
    expect(shoreDistance(far, 0)).toBeGreaterThan(0);
    expect(shoreDistance(0, -far)).toBeGreaterThan(0);
  });
});

describe("지형 높이", () => {
  it("섬 한가운데는 물 위, 먼 바다는 물 아래", () => {
    expect(elevationAt(0, 0)).toBeGreaterThan(SEA_LEVEL);
    expect(elevationAt(ISLAND_BASE_RADIUS, ISLAND_BASE_RADIUS)).toBeLessThan(
      SEA_LEVEL,
    );
  });

  it("해안선을 지나면 반드시 물에 잠긴다", () => {
    for (let angle = 0; angle < Math.PI * 2; angle += 0.2) {
      const radius = shoreRadiusAt(angle) + 4;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      expect(elevationAt(x, z)).toBeLessThan(SEA_LEVEL);
    }
  });

  it("높이가 급격히 튀지 않는다 (지형에 절벽 구멍이 없다)", () => {
    // 인접한 두 샘플의 높이 차가 크면 메시에 계단이 생기고 캐릭터가 공중에 뜬다.
    let maxJump = 0;
    for (let x = -20; x <= 20; x += 0.5) {
      for (let z = -20; z <= 20; z += 0.5) {
        maxJump = Math.max(
          maxJump,
          Math.abs(elevationAt(x, z) - elevationAt(x + 0.5, z)),
        );
      }
    }
    expect(maxJump).toBeLessThan(0.35);
  });

  it("isLandAt 은 섬 중앙과 스폰 지점에서 참", () => {
    expect(isLandAt(0, 0)).toBe(true);
    expect(isLandAt(SPAWN_POINT[0], SPAWN_POINT[1])).toBe(true);
    expect(isLandAt(ISLAND_BASE_RADIUS * 1.25, 0)).toBe(false);
  });
});

describe("해변 가구", () => {
  it("전부 마른 땅 위에 있다", () => {
    for (const item of FURNITURE) {
      expect(elevationAt(item.x, item.z), item.kind).toBeGreaterThan(0.15);
      expect(shoreDistance(item.x, item.z), item.kind).toBeLessThan(-1);
    }
  });

  it("야자수는 성기게 서 있다 — 숲이 아니라 해변이다", () => {
    /**
     * 흩뿌리기를 걷어낸 이유가 이것이다. 큰 것 몇 개가 빈 여백 위에 놓여야 섬처럼 보인다.
     * 개수를 못박는 대신 **밀도**를 본다 — 섬이 커지면 그루 수는 늘어도 되지만
     * 빽빽해지면 안 된다.
     */
    const palms = FURNITURE.filter((item) => item.kind === "palm");
    const area = Math.PI * ISLAND_BASE_RADIUS ** 2;
    expect(palms.length).toBeGreaterThan(1);
    // 1000m² 당 두 그루를 넘으면 숲이다.
    expect(palms.length / (area / 1000)).toBeLessThan(2);
  });

  it("야자수가 서로 멀찍이 떨어져 있다", () => {
    // 한쪽에 몰리면 반대쪽이 텅 비어 "가 볼 데가 없는 섬"이 된다.
    // 기준은 섬 크기에 비례한다 — 반지름이 줄면 같은 간격도 상대적으로는 넓다.
    const palms = FURNITURE.filter((item) => item.kind === "palm");
    for (const [i, a] of palms.entries()) {
      for (const b of palms.slice(i + 1)) {
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(
          ISLAND_BASE_RADIUS * 0.17,
        );
      }
    }
  });

  it("야자수는 몸으로 막는다 — 나무를 통과해 걸으면 안 된다", () => {
    /**
     * 예전 이 검사는 파라솔·선베드·비치볼을 종류별로 훑었는데, 그 가구들을
     * 걷어낸 뒤로 **빈 배열을 돌며 공허하게 통과**하고 있었다.
     * 실패할 수 없는 검사는 없느니만 못하므로 지금 있는 것으로 다시 적는다.
     */
    expect(FURNITURE.length).toBeGreaterThan(0);
    for (const item of FURNITURE) {
      // 밑동 굵기(0.44m)보다 넉넉해야 잎 사이로 몸이 끼지 않는다.
      expect(
        item.blockRadius,
        `${item.kind} @ ${item.x},${item.z}`,
      ).toBeGreaterThan(0.44);
    }
  });

  it("야자수가 컨텐츠 앞을 가리지 않는다", () => {
    /**
     * 실제로 났던 버그다 — 첫 화면에서 경력 책상과 사진첩이 잎사귀에 통째로 가려졌다.
     *
     * 카메라는 **방위가 고정**이라 늘 남쪽 위에 떠서 북쪽(-Z)을 본다. 그래서
     * 어떤 물체든 컨텐츠보다 z 가 큰 자리에 있으면 화면에서 그 앞을 막는다.
     * 스폰 좌우 (±13, 17) 에 세운 두 그루가 하필 스폰 → 책상 · 사진첩 시선 위였다.
     *
     * 시선을 정확히 계산하려면 카메라 파라미터(거리·부감·화각)를 여기로 복제해야 하는데,
     * 그건 튜닝 값이 바뀔 때마다 어긋난다. 대신 **컨텐츠에서 남쪽으로 뻗은 통로**를
     * 비워두게 한다 — 방위가 고정인 이상 시선은 언제나 이 통로 안을 지난다.
     */
    const CORRIDOR_HALF_WIDTH = 4;
    const CORRIDOR_LENGTH = 24;

    const blocked: string[] = [];
    for (const [lx, lz, , label] of LANDMARKS) {
      if (label === "스폰") continue;
      for (const palm of FURNITURE) {
        const behind = palm.z - lz; // 양수면 컨텐츠보다 남쪽 = 카메라 쪽
        if (behind <= 0 || behind > CORRIDOR_LENGTH) continue;
        if (Math.abs(palm.x - lx) > CORRIDOR_HALF_WIDTH) continue;
        blocked.push(`${label} ← ${palm.kind}(${palm.x}, ${palm.z})`);
      }
    }

    expect(
      blocked,
      "\n컨텐츠 남쪽(카메라 쪽)에 야자수가 서 있습니다. 화면에서 그 앞을 막습니다.\n",
    ).toEqual([]);
  });

  it("가구끼리 겹치지 않는다", () => {
    for (let i = 0; i < FURNITURE.length; i++) {
      for (let j = i + 1; j < FURNITURE.length; j++) {
        const a = FURNITURE[i];
        const b = FURNITURE[j];
        if (!a || !b) continue;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(
          a.blockRadius + b.blockRadius,
        );
      }
    }
  });
});
