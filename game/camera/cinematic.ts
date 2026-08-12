/**
 * 카메라를 잠깐 뺏어가는 자리.
 *
 * 이 섬의 카메라는 방위가 고정이고 늘 캐릭터를 따라다닌다 — 그게 이 세계를
 * "지도 위의 한 장면" 으로 읽히게 하는 규칙이다(FollowCamera). 그런데 규칙은
 * 어겨질 때 의미가 생긴다. 의자에 앉아 밤바다를 볼 때만큼은 카메라가 캐릭터를
 * 놓고 수평선을 봐야 한다.
 *
 * ── 왜 모듈 하나인가 ──
 * 컨텐츠(features/sunset)가 카메라(game/camera)를 부르는 건 되지만 반대는 안 된다 —
 * game 은 features 를 모른다(린트가 막는다). 그래서 game 쪽에 **꽂는 자리**만
 * 두고, 무엇을 꽂을지는 컨텐츠가 정한다. 곡률 유니폼과 같은 방식이다:
 * 매 프레임 읽히는 값이라 리액트 상태로 두면 씬 전체가 리렌더된다.
 */

export interface CameraShot {
  /** 카메라가 갈 자리(월드). */
  readonly px: number;
  readonly py: number;
  readonly pz: number;
  /** 바라볼 지점(월드). */
  readonly tx: number;
  readonly ty: number;
  readonly tz: number;
  /** 시야각(도). 넓히면 그만큼 하늘이 더 들어온다. */
  readonly fov: number;
  /**
   * 이 장면의 **주인공**이 있는 자리(월드). 없으면 화면 모양을 무시한다.
   *
   * fov 는 세로 화각이라 세로로 긴 폰에서는 가로가 통째로 좁아진다. 따라다니는
   * 카메라는 그럴 때 뒤로 물러나서 좌우를 튼다(framing.ts). 연출 컷도 같은
   * 문제를 겪는다 — 실제로 폰에서 의자 둘이 프레임 양옆으로 밀려났다.
   *
   * 그런데 물러날 기준은 **바라보는 지점(수평선)이 아니라 주인공(의자)**이다.
   * 50m 밖 수평선을 기준으로 물리면 몇 미터를 움직여도 그림이 안 변하고,
   * 반대로 그만큼 물리면 의자가 점이 된다. 가까운 주인공에서 얼마나 떨어져
   * 있는지를 늘려야 원하는 만큼만 넓어진다.
   */
  readonly anchor?: readonly [x: number, y: number, z: number];
  /**
   * 이 자리까지 미끄러져 가는 데 걸리는 대략의 시간(초).
   *
   * 순간이동시키면 화면이 잘려 붙은 것처럼 보인다. 1초쯤 미끄러지면
   * "카메라가 옮겨갔다" 로 읽히고, 그 1초 자체가 연출이 된다.
   */
  readonly glide: number;
}

let shot: CameraShot | null = null;

/** 카메라를 가져간다. null 이면 돌려준다. */
export function setCameraShot(next: CameraShot | null): void {
  shot = next;
}

export function getCameraShot(): CameraShot | null {
  return shot;
}
