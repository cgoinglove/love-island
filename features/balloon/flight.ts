import type { Vec2XZ } from "@/shared/types";
import { ISLET_CENTER, TOUR_RADIUS } from "./constants";

/**
 * 열기구 운항.
 *
 * ── 시간표가 아니라 손님을 기다린다 ──
 * 처음엔 배·상어처럼 **시계에서 유도**했다. 72초마다 저 혼자 뜨고 내리니 통신이
 * 0 이라는 게 매력적이었는데, 실제로 걸어가 보면 그게 최악이었다:
 * 도착했을 때 기구가 하늘에 있으면 40초를 멀뚱히 서서 기다려야 하고,
 * 아무도 없는 섬에서 빈 기구가 혼자 뜨고 내린다.
 *
 * 지금은 **늘 땅에서 기다린다.** 누가 타면 그때 출발 시각이 정해지고, 그 시각
 * 하나만 방에 알린다(features/balloon/schedule). 그 뒤로는 다시 시계 계산이라
 * 모두가 같은 자리에서 본다 — 알릴 것은 "언제 떠났나" 한 숫자뿐이다.
 *
 * 순수 함수라 "출발한 자리로 돌아오는가" 를 눈이 아니라 테스트로 확인한다.
 */

/**
 * 타고 나서 실제로 뜨기까지(초).
 *
 * 뒤따라오는 사람이 올라탈 시간이다. 0 이면 먼저 누른 사람만 타고 떠나서
 * "같이 타기" 가 성립하지 않는다.
 */
export const BOARDING_GRACE = 7;

/**
 * 뜨고 · 갔다가 · 돌고 · 돌아와 내리는 전체 시간(초).
 *
 * ⚠ 46초에서 늘렸다. 예전엔 계류장 위를 한 바퀴 도는 게 전부라 그 정도면
 *   충분했는데, **갈 데가 생기면 시간은 거리가 정한다.** 58m 를 왕복하면서
 *   섬을 한 바퀴 도는 데 열기구다운 속도(3~5 m/s)로 이만큼 걸린다.
 *   더 빠르게 하면 열기구가 아니라 드론이다.
 */
export const RIDE_SECONDS = 74;

/** 구간 경계(출발 뒤 경과 초). */
const RISE_END = 10;
/** 앞바다 섬까지 날아가는 구간의 끝. */
const OUTBOUND_END = 30;
/** 섬을 한 바퀴 도는 구간의 끝. */
const TOUR_END = 48;
/** 돌아오는 구간의 끝. 그 뒤로는 계류장에 내린다. */
const INBOUND_END = 64;

export type FlightPhase =
  /** 손님을 기다리며 계류장에 앉아 있다. */
  | "waiting"
  /** 누가 탔고 곧 뜬다. */
  | "boarding"
  | "rising"
  /** 앞바다 섬으로 건너간다. */
  | "outbound"
  /** 섬을 한 바퀴 돈다. */
  | "touring"
  /** 계류장으로 돌아온다. */
  | "inbound"
  | "descending";

export interface FlightState {
  phase: FlightPhase;
  /** 기구가 떠 있는 자리(월드). */
  x: number;
  z: number;
  /** 계류장 바닥 기준 높이(m). 앉아 있으면 0. */
  altitude: number;
  /** 지금 탈 수 있는가. 땅에 있고 문이 아직 안 닫혔을 때만. */
  boardable: boolean;
  /** 출발까지 남은 시간(초). 기다리는 중이면 0. */
  untilDeparture: number;
  /** 착륙까지 남은 시간(초). 떠 있지 않으면 0. */
  untilLanding: number;
}

/**
 * 순항 고도(m).
 *
 * ⚠ 통신 계약과 맞물린 값이다. 좌표 패킷의 높이는 지면 기준이고 상한이 있다
 *   (shared/presence 의 presenceBeat.y, game/net/poseCodec 의 HEIGHT_RANGE).
 *   여기를 올리면 그 둘도 같이 올려야 하고, 안 그러면 **남의 화면에서만
 *   열기구가 낮게 뜬다.** 실제로 8m 에서 잘리고 있었다.
 */
export const CRUISE_ALTITUDE = 26;

/** 문이 닫히는 순간. 뜨기 직전에 올라타면 바닥을 뚫고 따라 올라간다. */
const DOOR_CLOSES = 1.5;

/** 0→1 을 부드럽게. 뜨고 내리는 게 툭 끊기면 기구가 아니라 승강기다. */
function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * @param departAt 출발 시각(초, 공유 시계). null 이면 아직 손님을 기다린다.
 */
export function flightAt(
  seconds: number,
  departAt: number | null,
  pad: Vec2XZ,
): FlightState {
  const resting: FlightState = {
    phase: "waiting",
    x: pad[0],
    z: pad[1],
    altitude: 0,
    boardable: true,
    untilDeparture: 0,
    untilLanding: 0,
  };
  if (departAt === null) return resting;

  const since = seconds - departAt;
  // 한 편이 끝나면 다시 기다린다. 출발 시각을 지우는 건 호출부의 몫이지만,
  // 지우기 전에 물어봐도 같은 답이 나와야 한다.
  if (since >= RIDE_SECONDS) return resting;

  if (since < 0) {
    return {
      ...resting,
      phase: "boarding",
      boardable: -since > DOOR_CLOSES,
      untilDeparture: -since,
    };
  }

  let phase: FlightPhase;
  let climb: number;
  if (since < RISE_END) {
    phase = "rising";
    climb = ease(since / RISE_END);
  } else if (since < INBOUND_END) {
    phase =
      since < OUTBOUND_END
        ? "outbound"
        : since < TOUR_END
          ? "touring"
          : "inbound";
    climb = 1;
  } else {
    phase = "descending";
    climb = 1 - ease((since - INBOUND_END) / (RIDE_SECONDS - INBOUND_END));
  }

  const spot = groundTrack(since, pad);

  return {
    phase,
    x: spot[0],
    z: spot[1],
    /** 순항 중에도 조금씩 오르내린다. 딱 멈춰 있으면 매달아 놓은 풍선이다. */
    altitude: climb * CRUISE_ALTITUDE + climb * Math.sin(seconds * 0.6) * 0.5,
    boardable: false,
    untilDeparture: 0,
    untilLanding: RIDE_SECONDS - since,
  };
}

/**
 * 지상 항로 — 계류장에서 앞바다 섬까지 갔다가 한 바퀴 돌고 돌아온다.
 *
 * ── 왜 갔다 오나 ──
 * 예전엔 계류장 위를 한 바퀴 도는 게 전부였다. 하늘에서 내려다보는 것만으로도
 * 볼 게 있었지만, 그건 **목적지가 없는 놀이기구**라 두 번째부터는 탈 이유가 없다.
 * 갈 데가 있으면 "저기 가 보자" 가 되고, 그건 옆 사람에게 권할 수 있는 말이다.
 *
 * ⚠ 그래도 **출발한 자리로 돌아와야** 한다. 섬 반대편에 내려놓으면 그건
 *   이동수단이지 놀이기구가 아니고, 무엇보다 계류장에서 기다리던 다음 손님이
 *   빈 자리를 보게 된다.
 *
 * 도는 방향은 **시계 반대**다. 카메라가 늘 북쪽을 보므로 그쪽으로 돌면
 * 섬이 화면을 가로질러 지나가며 반대쪽 얼굴을 보여준다.
 */
function groundTrack(since: number, pad: Vec2XZ): Vec2XZ {
  // 섬 둘레에서 계류장을 마주 보는 자리. 여기로 붙었다가 여기서 떠난다.
  const inbound = Math.atan2(
    pad[1] - ISLET_CENTER[1],
    pad[0] - ISLET_CENTER[0],
  );
  const gate: Vec2XZ = [
    ISLET_CENTER[0] + Math.cos(inbound) * TOUR_RADIUS,
    ISLET_CENTER[1] + Math.sin(inbound) * TOUR_RADIUS,
  ];

  const glide = (from: Vec2XZ, to: Vec2XZ, t: number): Vec2XZ => {
    const k = ease(Math.min(1, Math.max(0, t)));
    return [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k];
  };

  if (since < RISE_END) return [pad[0], pad[1]];
  if (since < OUTBOUND_END) {
    return glide(pad, gate, (since - RISE_END) / (OUTBOUND_END - RISE_END));
  }
  if (since < TOUR_END) {
    const turn =
      inbound -
      ((since - OUTBOUND_END) / (TOUR_END - OUTBOUND_END)) * Math.PI * 2;
    return [
      ISLET_CENTER[0] + Math.cos(turn) * TOUR_RADIUS,
      ISLET_CENTER[1] + Math.sin(turn) * TOUR_RADIUS,
    ];
  }
  if (since < INBOUND_END) {
    return glide(gate, pad, (since - TOUR_END) / (INBOUND_END - TOUR_END));
  }
  return [pad[0], pad[1]];
}
