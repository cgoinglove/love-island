import { lengthXZ } from "@/game/core/coords";
import type { Vec2XZ } from "@/shared/types";

/**
 * 경로 추종. A* 가 만든 웨이포인트 배열을 매 스텝 "이동 축"으로 번역한다.
 *
 * 순수 로직이다 — 키보드든 탭이든 시뮬레이션 입장에서는 똑같은 [x, z] 축이 들어올 뿐이고,
 * 그래서 stepPlayer 는 조작 방식이 몇 개인지 알 필요가 없다.
 */

export interface PathFollower {
  /** 남은 웨이포인트. 앞에서부터 소비한다. */
  path: Vec2XZ[];
  index: number;
  /** 도착하면 실행할 상호작용 id. 탭으로 오브젝트를 찍었을 때만 채워진다. */
  pendingAction: string | null;
  /** 이번 스텝에 목적지에 막 도착했는가. 소비하는 쪽이 false 로 되돌린다. */
  arrived: boolean;
  /** 할당을 피하려고 재사용하는 출력 버퍼. */
  readonly axis: [number, number];
}

export function createPathFollower(): PathFollower {
  return {
    path: [],
    index: 0,
    pendingAction: null,
    arrived: false,
    axis: [0, 0],
  };
}

export function setPath(
  follower: PathFollower,
  path: Vec2XZ[],
  pendingAction: string | null = null,
): void {
  follower.path = path;
  follower.index = 0;
  follower.pendingAction = pendingAction;
  follower.arrived = false;
}

export function clearPath(follower: PathFollower): void {
  follower.path = [];
  follower.index = 0;
  follower.pendingAction = null;
  follower.arrived = false;
}

export function isFollowing(follower: PathFollower): boolean {
  return follower.index < follower.path.length;
}

/**
 * 다음 웨이포인트를 향한 축을 돌려준다.
 *
 * waypointRadius 를 너무 작게 잡으면 캐릭터가 점 위에서 부들거리고,
 * 너무 크게 잡으면 코너를 크게 돌아 벽을 파고든다. 캐릭터 반지름 근처가 적당하다.
 */
export function followPath(
  follower: PathFollower,
  x: number,
  z: number,
  waypointRadius: number,
): Vec2XZ {
  follower.axis[0] = 0;
  follower.axis[1] = 0;

  // 이미 지나친 웨이포인트를 한 번에 건너뛴다.
  // 한 스텝에 여러 개를 지나칠 수 있어서 if 가 아니라 while 이다.
  while (follower.index < follower.path.length) {
    const target = follower.path[follower.index];
    if (target === undefined) break;
    const dx = target[0] - x;
    const dz = target[1] - z;
    const isLast = follower.index === follower.path.length - 1;
    // 마지막 지점은 더 정확히 밟아야 approachPoint 가 의미를 갖는다.
    const threshold = isLast ? waypointRadius * 0.5 : waypointRadius;

    if (lengthXZ(dx, dz) > threshold) {
      follower.axis[0] = dx;
      follower.axis[1] = dz;
      return follower.axis;
    }
    follower.index++;
  }

  if (follower.path.length > 0) {
    follower.path = [];
    follower.index = 0;
    follower.arrived = true;
  }
  return follower.axis;
}
