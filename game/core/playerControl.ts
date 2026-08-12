"use client";

import { createContext, type RefObject, useContext } from "react";

/**
 * 캐릭터를 밖에서 조종하는 손잡이.
 *
 * 왜 zustand 가 아니라 ref 인가: moveTo 는 초당 60번이 아니라 탭할 때 한 번 불린다.
 * 하지만 pose() 는 매 프레임 읽힌다 — 이걸 스토어에 넣으면 구독자가 전부 리렌더된다.
 * 명령은 ref 로 내려보내고 상태는 읽어가게 한다. (기획서 §4.1)
 */
export interface PlayerController {
  /**
   * 목적지까지 경로를 잡고 걸어간다.
   * @param actionId 도착하면 실행할 Interactable 의 id. 탭으로 오브젝트를 찍었을 때만 준다
   */
  moveTo(x: number, z: number, actionId?: string | null): void;
  /**
   * 현재 시뮬레이션 자세. 매 프레임 덮어쓰는 **같은 객체**를 돌려주므로
   * 값을 보관하려면 복사해야 한다. (프레임당 할당 회피)
   */
  pose(): PlayerPose;

  /** 모바일 조이스틱이 미는 이동 축. 키보드 입력과 합쳐진다. */
  setVirtualAxis(x: number, z: number): void;
  setVirtualJump(down: boolean): void;
  setVirtualSprint(down: boolean): void;

  /**
   * 앞을 향해 밀친다.
   * @returns 쿨다운에 걸리지 않고 실제로 나갔으면 true
   */
  shove(): boolean;

  /**
   * 그 자리에 딱 놓는다. 걸어가는 게 아니라 **옮겨 놓는** 것이다.
   *
   * 의자에 앉을 때 쓴다. 앉기는 "그 근처에 서 있기" 가 아니라 "그 자리에
   * 정확히 놓이기" 라서, 걸어가서 멈추는 것으로는 절대 자세가 안 맞는다 —
   * 30cm 만 어긋나도 의자 팔걸이를 뚫고 앉아 있는 그림이 된다.
   *
   * 속도도 같이 지운다. 안 그러면 놓자마자 관성으로 미끄러져 나간다.
   */
  place(x: number, z: number, yaw: number): void;

  /**
   * 탈것에 태운다. null 이면 내려놓는다.
   *
   * ── 왜 좌표를 매 프레임 밀어 넣나 ──
   * 태우는 동안 이 캐릭터의 위치는 **시뮬레이션이 정하지 않는다.** 중력도 입력도
   * 무시하고 탈것을 그대로 따라가야 한다. 그런데 그렇게 옮겨둔 좌표가 그대로
   * 네트워크로 나가므로(pose 를 읽는 곳이 하나다), 남의 화면에서도 저절로
   * 하늘에 떠 있게 된다 — 탈것 전용 통신이 한 줄도 필요 없다.
   *
   * y 는 **지면 기준 높이**다. 탈것은 절대 고도를 알고 있으므로 지형 높이를
   * 빼서 넘겨야 한다 — 렌더링이 지형 높이를 다시 더하기 때문이다.
   */
  carry(pose: { x: number; z: number; y: number; yaw: number } | null): void;
}

export interface PlayerPose {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  /** 지면 위 높이(m). 0 이면 땅에 붙어 있다 — 점프와 넉백이 여기 실린다. */
  readonly y: number;
}

export const PlayerControllerContext =
  createContext<RefObject<PlayerController | null> | null>(null);

export function usePlayerController(): RefObject<PlayerController | null> {
  const ref = useContext(PlayerControllerContext);
  if (ref === null) {
    throw new Error(
      "usePlayerController 는 PlayerControllerContext 안에서만 쓸 수 있습니다.",
    );
  }
  return ref;
}
