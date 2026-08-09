import { describe, expect, it } from "vitest";
import {
  BODY_RADIUS,
  characterGeometryFor,
  getArmGeometry,
  shoulderOf,
} from "./characterGeometry";

/** 팔의 로컬 경계상자. 어깨가 원점이다. */
function armBounds() {
  const geometry = getArmGeometry();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) throw new Error("경계상자를 못 구했습니다");
  return box;
}

describe("팔과 몸통의 이음매", () => {
  it("팔을 옆으로 들어도 몸통에서 안 떨어진다", () => {
    /**
     * ⚠ 실제로 났던 버그다. 팔이 내려가 있을 땐 몸통에 파묻혀 붙어 보이는데,
     *   **옆으로 들어 올리면** 어깨를 축으로 회전하면서 캡슐 위 끝이 축 바깥으로
     *   돌아 나가 몸통과 팔 사이에 4~5cm 틈이 생겼다.
     *
     * 회전은 어깨를 축으로 돈다. 그러니 축에서 거리 d 안에 있는 부분은 어느 각도로
     * 돌든 축을 중심으로 반지름 d 인 공 안에 남는다. 그 공이 몸통 표면까지 닿으면
     * 이음매가 어떤 각도에서도 안 벌어진다 — 즉 `어깨x − 위로뻗은길이 < 몸통반지름`.
     */
    const { x } = shoulderOf("아무개");
    const reachAbovePivot = armBounds().max.y;

    expect(reachAbovePivot).toBeGreaterThan(0);
    expect(x - reachAbovePivot).toBeLessThan(BODY_RADIUS);
  });

  it("그래도 팔이 몸통 밖으로 보인다", () => {
    // 안쪽으로만 밀어 넣으면 이음매는 붙지만 팔이 몸에 파묻혀 실루엣이 안 갈라진다.
    const { x } = shoulderOf("아무개");
    const halfThickness = armBounds().max.x;
    expect(x + halfThickness).toBeGreaterThan(BODY_RADIUS + 0.06);
  });

  it("팔은 어깨 아래로 뻗는다", () => {
    // 아래로 뻗은 캡슐이라야 회전 하나로 "옆으로 들어 올리기"가 된다.
    const box = armBounds();
    expect(box.min.y).toBeLessThan(-0.4);
    expect(Math.abs(box.min.y)).toBeGreaterThan(box.max.y * 3);
  });

  it("어깨 높이는 몸통 안쪽이다", () => {
    // 몸통 캡슐의 원통 구간을 벗어나면 그 높이의 몸통 반지름이 줄어 또 틈이 생긴다.
    for (const seed of ["a", "b", "c", "d", "e", "f"]) {
      const { y } = shoulderOf(seed);
      expect(y, seed).toBeGreaterThan(0.5);
      expect(y, seed).toBeLessThan(0.8);
    }
  });
});

describe("캐릭터 지오메트리 캐시", () => {
  it("같은 씨앗이면 같은 지오메트리를 재사용한다", () => {
    // 사람이 늘어도 GPU 버퍼는 **모습의 가짓수**만큼만 늘어나야 한다.
    expect(characterGeometryFor("같은사람")).toBe(
      characterGeometryFor("같은사람"),
    );
  });
});
