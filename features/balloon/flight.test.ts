import { describe, expect, it } from "vitest";
import { elevationAt } from "@/game/core/island";
import type { Vec2XZ } from "@/shared/types";
import { BALLOON_PAD, ISLET_CENTER, TOUR_RADIUS } from "./constants";
import {
  BOARDING_GRACE,
  CRUISE_ALTITUDE,
  flightAt,
  RIDE_SECONDS,
} from "./flight";

const PAD: Vec2XZ = [-12, -17];
/** 아무 시각이나 하나. 출발 시각은 이제 "탄 사람이 정하는 값" 이라 절대값이 없다. */
const DEPART = 10_000;

/**
 * 열기구는 **출발 시각 하나**에서 전부 유도된다. 같이 타는 데 오가는 게
 * 그 숫자뿐이라, 지켜야 할 것도 그 숫자로 계산한 결과가 서로 같다는 것뿐이다.
 */
describe("열기구 운항", () => {
  it("아무도 안 타면 계류장에서 기다린다", () => {
    /**
     * ⚠ 처음엔 72초 시간표로 저 혼자 뜨고 내렸다. 통신이 0 이라 매력적이었는데,
     *   걸어가 보면 최악이었다 — 도착했을 때 하늘에 있으면 40초를 서서 기다리고,
     *   아무도 없는 섬에서 빈 기구가 혼자 오르내렸다.
     */
    const rest = flightAt(999_999, null, PAD);
    expect(rest.phase).toBe("waiting");
    expect(rest.altitude).toBe(0);
    expect(rest.boardable).toBe(true);
    expect(rest.x).toBeCloseTo(PAD[0], 6);
    expect(rest.z).toBeCloseTo(PAD[1], 6);
  });

  it("같은 출발 시각이면 어디서 계산해도 같은 자리다", () => {
    // 두 사람의 화면에서 기구가 다른 자리에 있으면 같이 탈 수가 없다.
    expect(flightAt(DEPART + 17.5, DEPART, PAD)).toEqual(
      flightAt(DEPART + 17.5, DEPART, PAD),
    );
  });

  it("출발한 자리로 돌아와 다시 기다린다", () => {
    /**
     * 탄 사람을 섬 반대편에 내려놓으면 그건 이동수단이지 놀이기구가 아니다.
     * 게다가 계류장이 아닌 곳에 내리면 바다 위일 수도 있다.
     */
    for (const at of [DEPART, DEPART + RIDE_SECONDS, DEPART + 999]) {
      const state = flightAt(at, DEPART, PAD);
      expect(state.x).toBeCloseTo(PAD[0], 3);
      expect(state.z).toBeCloseTo(PAD[1], 3);
      expect(state.altitude).toBeCloseTo(0, 3);
    }
    expect(flightAt(DEPART + RIDE_SECONDS, DEPART, PAD).phase).toBe("waiting");
  });

  it("타고 나서 잠깐 기다렸다 뜬다", () => {
    // 뒤따라오는 사람이 올라탈 시간이다. 0 이면 먼저 누른 사람만 타고 떠난다.
    const justBoarded = flightAt(DEPART - BOARDING_GRACE, DEPART, PAD);
    expect(justBoarded.phase).toBe("boarding");
    expect(justBoarded.boardable).toBe(true);
    expect(justBoarded.altitude).toBe(0);
    expect(justBoarded.untilDeparture).toBeCloseTo(BOARDING_GRACE, 6);
  });

  it("문이 닫히고 나서 뜬다", () => {
    /**
     * 뜨기 직전까지 태우면, 올라타는 순간 기구가 이미 떠 있어서 사람이
     * 바닥을 뚫고 따라 올라가는 것처럼 보인다.
     */
    let lastBoardable = Number.NEGATIVE_INFINITY;
    let liftOff = Number.POSITIVE_INFINITY;
    // 뜨는 구간만 본다. 한 편이 끝나면 다시 탈 수 있는 게 맞으므로 거기까지 훑으면
    // "마지막으로 탈 수 있던 순간" 이 다음 편의 것이 되어 버린다.
    for (let t = -BOARDING_GRACE; t < RIDE_SECONDS / 2; t += 0.05) {
      const state = flightAt(DEPART + t, DEPART, PAD);
      if (state.boardable) lastBoardable = t;
      if (state.altitude > 0.01 && t < liftOff) liftOff = t;
    }
    expect(liftOff - lastBoardable).toBeGreaterThan(1);
  });

  it("한 편 안에 뜨고 돌고 내린다", () => {
    const phases = new Set<string>();
    let highest = 0;
    for (let t = 0; t < RIDE_SECONDS; t += 0.5) {
      const state = flightAt(DEPART + t, DEPART, PAD);
      phases.add(state.phase);
      highest = Math.max(highest, state.altitude);
    }
    expect([...phases].sort()).toEqual([
      "descending",
      "inbound",
      "outbound",
      "rising",
      "touring",
    ]);
    expect(highest).toBeGreaterThan(CRUISE_ALTITUDE * 0.98);
  });

  it("앞바다 섬까지 갔다가 돌아온다", () => {
    /**
     * 목적지가 없는 놀이기구는 두 번째부터 탈 이유가 없다.
     * 그래도 **출발한 자리로 돌아와야** 한다 — 섬 반대편에 내려놓으면
     * 그건 이동수단이지 놀이기구가 아니다.
     */
    let closest = Number.POSITIVE_INFINITY;
    for (let t = 0; t < RIDE_SECONDS; t += 0.25) {
      const state = flightAt(DEPART + t, DEPART, PAD);
      closest = Math.min(
        closest,
        Math.hypot(state.x - ISLET_CENTER[0], state.z - ISLET_CENTER[1]),
      );
    }
    // 섬을 도는 원의 반지름만큼은 가까이 간다.
    expect(closest).toBeLessThan(TOUR_RADIUS + 0.5);

    const landed = flightAt(DEPART + RIDE_SECONDS - 0.01, DEPART, PAD);
    expect(landed.x).toBeCloseTo(PAD[0], 3);
    expect(landed.z).toBeCloseTo(PAD[1], 3);
  });

  it("실제 계류장에서 뜨면 섬을 가로지르지 않는다", () => {
    /**
     * 여기만 **진짜 계류장 좌표**로 잰다. 다른 검사는 순수 함수의 규칙을 보는
     * 것이라 아무 자리나 넣어도 되지만, "육지 위를 지나가나" 는 그 자리가
     * 어디냐에 달린 질문이다.
     *
     * 섬 위를 가로지르면 순항 고도(26m)라 부딪히진 않아도 화면에서는
     * 기구가 야자수 위를 스쳐 지나가고, 무엇보다 **하늘에서 바다를 보러 가는**
     * 놀이기구가 아니게 된다.
     */
    for (let t = 0; t < RIDE_SECONDS; t += 0.25) {
      const state = flightAt(DEPART + t, DEPART, BALLOON_PAD);
      if (elevationAt(state.x, state.z) <= 0.1) continue;
      /**
       * 육지 위인 순간은 **계류장을 떠나고 돌아오는 구간**뿐이어야 한다.
       * 계류장 자체가 물가에서 20m 안쪽에 있으므로 그만큼은 어쩔 수 없다.
       */
      const fromPad = Math.hypot(
        state.x - BALLOON_PAD[0],
        state.z - BALLOON_PAD[1],
      );
      expect(fromPad).toBeLessThan(24);
    }
  });

  it("떠 있는 동안은 못 탄다", () => {
    for (let t = 0; t < RIDE_SECONDS; t += 0.25) {
      const state = flightAt(DEPART + t, DEPART, PAD);
      // 뜬 상태에서 탈 수 있으면 사람이 허공에서 바구니로 순간이동한다.
      if (state.boardable) expect(state.altitude).toBeCloseTo(0, 6);
    }
  });

  it("높이가 좌표 패킷에 담기는 범위 안이다", () => {
    /**
     * ⚠ 이 높이는 그대로 통신 계약에 실린다(presenceBeat.y · poseCodec).
     *   범위를 넘기면 **남의 화면에서만** 기구가 낮게 뜨거나, 위치 전송이
     *   통째로 400 으로 튕긴다. 둘 다 원인을 찾기 아주 어렵다.
     */
    expect(CRUISE_ALTITUDE).toBeLessThan(40);
  });
});
