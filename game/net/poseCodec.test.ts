import { describe, expect, it } from "vitest";
import {
  type DecodedPose,
  decodePose,
  encodePose,
  POSE_BYTES,
} from "./poseCodec";

function roundTrip(x: number, z: number, yaw: number, y = 0): DecodedPose {
  const view = new DataView(new ArrayBuffer(POSE_BYTES));
  encodePose(view, x, z, yaw, y);
  const out: DecodedPose = { x: 0, z: 0, yaw: 0, y: 0 };
  decodePose(view, out);
  return out;
}

describe("poseCodec", () => {
  it("한 세트가 8바이트다 (JSON 이면 50바이트쯤 된다)", () => {
    expect(POSE_BYTES).toBe(8);
  });

  it("높이도 함께 실려 간다", () => {
    /**
     * ⚠ 예전엔 x·z·yaw 만 실려 갔다. 받는 쪽은 그 좌표의 지면 높이에 캐릭터를
     *   붙여놓기 때문에, **남의 점프와 넉백이 통째로 사라졌다** —
     *   본인 화면에서만 뜨고 남에게는 땅에 붙어 미끄러지는 것으로 보였다.
     */
    /**
     * 열기구가 생기면서 실어 나를 높이가 26m 까지 늘었다(HEIGHT_RANGE).
     * 그만큼 눈금이 성겨졌지만 여전히 밀리미터 단위다 — 점프든 비행이든
     * 사람 눈에는 같은 자리다.
     */
    for (const y of [0, 0.61, 1.8, 4, 26]) {
      expect(roundTrip(3, -4, 1, y).y).toBeCloseTo(y, 2);
    }
  });

  it("왕복해도 센티미터 안쪽으로 돌아온다", () => {
    const cases: Array<[number, number, number]> = [
      [0, 0, 0],
      [12.345, -7.89, 1.234],
      [-16.5, 16.5, -3.1],
      [0.001, -0.001, 0.0001],
    ];
    /**
     * 눈금은 섬 크기를 따라간다 — 섬이 세 배가 되면서 좌표 범위도 ±140 이
     * 됐고, 한 눈금이 4.3mm 다. 사람 눈에는 여전히 같은 자리다.
     */
    for (const [x, z, yaw] of cases) {
      const out = roundTrip(x, z, yaw);
      expect(out.x).toBeCloseTo(x, 2);
      expect(out.z).toBeCloseTo(z, 2);
      expect(out.yaw).toBeCloseTo(yaw, 3);
    }
  });

  it("섬 전체에서 오차가 1cm 를 넘지 않는다", () => {
    let worst = 0;
    // 섬 전체 — 가장자리까지 훑는다. 중앙만 보면 범위를 늘렸을 때 못 잡는다.
    for (let x = -56; x <= 56; x += 3.7) {
      for (let z = -56; z <= 56; z += 5.3) {
        const out = roundTrip(x, z, 0);
        worst = Math.max(worst, Math.abs(out.x - x), Math.abs(out.z - z));
      }
    }
    expect(worst).toBeLessThan(0.01);
  });

  it("범위를 벗어난 좌표는 잘린다 (터지지 않는다)", () => {
    // 검증을 통과한 값만 오지만, 전송 계층이 서버 검증을 신뢰하면 안 된다.
    const out = roundTrip(9999, -9999, 0);
    expect(Number.isFinite(out.x)).toBe(true);
    expect(Math.abs(out.x)).toBeLessThanOrEqual(140);
    expect(Math.abs(out.z)).toBeLessThanOrEqual(140);
  });

  it("yaw 가 ±π 를 넘어가도 같은 각도로 돌아온다", () => {
    // 시뮬레이션은 yaw 를 [-π, π) 로 접어두지만, 여기서도 한 번 더 접는다.
    const out = roundTrip(0, 0, Math.PI * 2 + 0.5);
    expect(out.yaw).toBeCloseTo(0.5, 3);

    const negative = roundTrip(0, 0, -Math.PI * 3);
    expect(Math.abs(Math.abs(negative.yaw) - Math.PI)).toBeLessThan(0.01);
  });

  it("같은 입력은 같은 바이트를 만든다 (결정적)", () => {
    const a = new DataView(new ArrayBuffer(POSE_BYTES));
    const b = new DataView(new ArrayBuffer(POSE_BYTES));
    encodePose(a, 3.14, -2.72, 1.41, 0);
    encodePose(b, 3.14, -2.72, 1.41, 0);
    expect(new Uint8Array(a.buffer)).toEqual(new Uint8Array(b.buffer));
  });
});
