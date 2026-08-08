import type { Vec2XZ } from "@/shared/types";

/**
 * 봇의 공유 상태.
 *
 * ── 설계의 핵심: 위치가 아니라 "결정"을 나눈다 ──
 * 봇 좌표를 20Hz 로 뿌리면 사람 수만큼 트래픽이 곱해진다. 대신 **언제 어디로
 * 출발했는지**만 한 번 보내고, 위치는 각자 계산한다:
 *
 *   위치 = 경로를 따라 (지금 - 출발시각) × 속도 만큼 나아간 지점
 *
 * 경로는 모두가 같은 A* 를 같은 격자에 돌려 얻으므로 결과가 똑같고, "지금"은
 * 이미 낮밤 순환이 쓰는 **서버 보정 벽시계**가 있다. 그래서 결정 하나(수십 바이트)로
 * 전원이 완전히 같은 봇을 본다. 사건 채널은 이미 있으니 새 통신도 필요 없다.
 *
 * ── 왜 소유자가 필요한가 ──
 * 결정은 누군가 내려야 한다. 모두가 내리면 봇이 사방으로 끌려다닌다.
 * playerId 가 가장 작은 사람이 소유자다 — 목록만 보면 각자 같은 답을 얻으므로
 * 협상이 필요 없고, 소유자가 나가면 다음 사람이 자동으로 이어받는다.
 */

/** 봇의 걷는 속도(m/s). 사람보다 느긋해야 "안내"로 보인다. */
export const BOT_SPEED = 3.2;

/** 대사 한 줄이 머무는 시간(ms). */
export const BOT_LINE_MS = 3400;

export interface BotDecision {
  /** 중복 제거용. 같은 결정을 두 번 반영하지 않는다. */
  id: string;
  /** 걸어갈 목적지. 제자리에서 말만 할 땐 현재 자리를 그대로 넣는다. */
  target: Vec2XZ;
  /** 출발 시각(서버 보정 epoch ms). 위치는 이걸로 역산한다. */
  startedAt: number;
  /** 출발 지점. 경로를 재현하려면 시작점도 알아야 한다. */
  from: Vec2XZ;
  /** 할 말. 빈 배열이면 아무 말 없이 걷기만 한다. */
  lines: readonly string[];
  /** 이 결정을 만든 화제. 도장·확장 기능이 참조한다. */
  topicId: string | null;
  /** 누가 부탁했나. 그 사람 쪽을 보게 만든다. */
  requestedBy: string | null;
}

/**
 * 소유자를 뽑는다.
 *
 * 정렬 후 첫 번째. 목록만 같으면 누가 계산하든 같은 답이 나오므로 합의 절차가 없다.
 * 사람이 들고 나는 순간 잠깐 둘이 되거나 아무도 아닐 수 있는데, 그때 나오는 건
 * 봇이 잠깐 두 번 결정하는 정도다 — 사건 id 중복 제거가 걸러내고, 최악이라도
 * 봇이 한 번 움찔한다. 그걸 막자고 합의 프로토콜을 얹을 값어치는 없다.
 */
export function electOwner(playerIds: readonly string[]): string | null {
  if (playerIds.length === 0) return null;
  let lowest = playerIds[0] as string;
  for (const id of playerIds) if (id < lowest) lowest = id;
  return lowest;
}

export function isOwner(myId: string, playerIds: readonly string[]): boolean {
  return electOwner(playerIds) === myId;
}

/** 경로 위를 일정 속도로 걸을 때의 위치와 진행 방향. */
export interface BotPose {
  x: number;
  z: number;
  yaw: number;
  /** 아직 걷는 중인가. 도착하면 false. */
  moving: boolean;
}

/**
 * 경로와 경과 시간으로 위치를 구한다.
 *
 * 경로는 A* 가 준 꼭짓점 목록이다. 누적 거리를 훑어 지금 어느 구간에 있는지 찾고
 * 그 안에서 선형 보간한다 — 프레임마다 적분하지 않으므로, 탭이 백그라운드에 있다가
 * 돌아와도 위치가 어긋나지 않는다. (적분식이면 그 사이 프레임이 안 돌아 뒤처진다.)
 */
export function poseAlongPath(
  path: readonly Vec2XZ[],
  elapsedSeconds: number,
  speed = BOT_SPEED,
): BotPose {
  const first = path[0];
  if (!first) return { x: 0, z: 0, yaw: 0, moving: false };
  if (path.length === 1) {
    return { x: first[0], z: first[1], yaw: 0, moving: false };
  }

  let travelled = Math.max(0, elapsedSeconds) * speed;

  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1] as Vec2XZ;
    const b = path[i] as Vec2XZ;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const segment = Math.hypot(dx, dz);

    if (segment <= 1e-6) continue;

    if (travelled <= segment) {
      const t = travelled / segment;
      return {
        x: a[0] + dx * t,
        z: a[1] + dz * t,
        // 캐릭터의 로컬 전방이 -Z 라 atan2 인자가 이 순서다.
        yaw: Math.atan2(dx, -dz),
        moving: true,
      };
    }
    travelled -= segment;
  }

  const last = path[path.length - 1] as Vec2XZ;
  const before = path[path.length - 2] as Vec2XZ;
  return {
    x: last[0],
    z: last[1],
    yaw: Math.atan2(last[0] - before[0], -(last[1] - before[1])),
    moving: false,
  };
}

/** 경로 전체를 걷는 데 걸리는 시간(초). 대사 길이를 맞출 때 쓴다. */
export function pathDuration(
  path: readonly Vec2XZ[],
  speed = BOT_SPEED,
): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1] as Vec2XZ;
    const b = path[i] as Vec2XZ;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total / speed;
}

/**
 * 지금 보여줄 대사 줄.
 *
 * 줄 수보다 오래 지나면 null 을 준다 — 말풍선이 영영 떠 있으면 안내가 아니라 간판이다.
 */
export function currentLine(
  lines: readonly string[],
  elapsedMs: number,
): string | null {
  if (lines.length === 0) return null;
  const index = Math.floor(elapsedMs / BOT_LINE_MS);
  return index < lines.length ? (lines[index] as string) : null;
}

/**
 * 렌더 위치를 권위 위치 쪽으로 부드럽게 당긴다.
 *
 * ── 왜 필요한가 ──
 * 결정은 한 번에 도착하지만, 도착까지 걸린 시간만큼 경로가 이미 진행돼 있다.
 * 받자마자 그 지점에 갖다 놓으면 **peer 화면에서 봇이 1~2m 씩 건너뛴다.**
 * 소유자는 지연이 0 이라 멀쩡히 보이고, 남들만 순간이동으로 본다.
 *
 * 계산된 위치는 그대로 두고 **화면에 그리는 위치**를 따로 두어 뒤따라가게 하면
 * 그 불연속이 사라진다. 격차가 크면(다른 섬 반대편으로 결정이 바뀐 경우 등)
 * 억지로 걸어가는 것보다 한 번 끊는 게 낫다.
 */
export const SMOOTH_LAMBDA = 6;
/** 이보다 멀면 부드럽게 따라가는 대신 그냥 붙인다. */
export const SMOOTH_SNAP_DISTANCE = 6;

/** 프레임레이트와 무관한 지수 감쇠. dt 가 흔들려도 같은 속도로 수렴한다. */
export function damp(
  current: number,
  target: number,
  lambda: number,
  dt: number,
): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}

/** 각도용. -π~π 로 접어 최단 방향으로 돈다 — 안 그러면 한 바퀴 헛돈다. */
export function dampAngle(
  current: number,
  target: number,
  lambda: number,
  dt: number,
): number {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
}
