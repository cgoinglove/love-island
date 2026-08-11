import {
  PRESENCE_ACTIVE_INTERVAL_MS,
  PRESENCE_HANDSHAKE_INTERVAL_MS,
  PRESENCE_IDLE_INTERVAL_MS,
} from "@/shared/presence";

/**
 * 다음 폴링까지 얼마나 기다릴까.
 *
 * ── 왜 이게 따로 떨어져 있나 ──
 * 여기서 **한 줄 틀렸다가 배포 환경이 통째로 느렸다.** 조건이 셋뿐인데도 눈으로는
 * 안 보이는 종류의 실수였다(아래 ⚠). 순수 함수로 빼두면 표로 검증할 수 있다.
 */
export interface BeatRateInput {
  /** 지금 악수 메시지가 오가는 중인가(방금 응답에 시그널이 실려 왔는가). */
  handshaking: boolean;
  /** 아직 못 보낸 악수 메시지나 방 사건이 있는가. */
  pending: boolean;
  /**
   * 폴링이 **남의 좌표를 나르고 있는가** — 아직 P2P 가 안 붙은 상대가 하나라도 있는가.
   */
  relaying: boolean;
}

/**
 * ⚠ 여기 있던 버그: `내가 안 움직이면 3초` 가 맨 앞에 있었다.
 *
 * 폴링을 아낀다는 게 의도였고 내 좌표만 생각하면 맞는 말이다 — 안 움직이는데
 * 초당 다섯 번 같은 좌표를 올릴 이유가 없으니까. 그런데 **폴링은 양방향이다.**
 * 내가 올리는 통로가 곧 남의 좌표를 받아오는 통로다.
 *
 * 그래서 가만히 서서 남이 걸어다니는 걸 보면 3초에 한 번씩만 갱신됐다.
 * 보간 지연이 320ms 라 그 사이는 마지막 위치에 얼어붙어 있다가 툭 튄다 —
 * "P2P 라는데 왜 이렇게 느리냐" 의 정체가 이것이었다.
 *
 * 악수 메시지도 같은 통로로 다니므로, 3초 주기에 걸리면 offer 하나 건네는 데
 * 3초가 걸리고 ICE 후보마다 또 3초가 걸렸다. **P2P 가 붙기 전에 포기당하는** 셈이다.
 *
 * 판단 기준은 내 움직임이 아니라 **이 폴링이 지금 무슨 일을 하고 있는가** 여야 한다.
 */
export function nextBeatDelay(input: BeatRateInput): number {
  // 악수 중. 왕복 한 번이 곧 연결 성사까지의 시간이라 최대한 빨리 돈다.
  if (input.handshaking || input.pending) {
    return PRESENCE_HANDSHAKE_INTERVAL_MS;
  }

  // 폴링이 좌표를 나르는 중. 내가 서 있든 말든 받아야 한다.
  if (input.relaying) return PRESENCE_ACTIVE_INTERVAL_MS;

  /**
   * 아무도 없거나, 있어도 전부 P2P 다.
   * 남은 일은 "새 방문자 발견"과 "나 살아있음" 뿐이라 느려도 된다 —
   * WebRTC 를 붙인 값어치가 서버 비용으로 나타나는 지점이 여기다.
   */
  return PRESENCE_IDLE_INTERVAL_MS;
}
