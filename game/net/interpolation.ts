import { lerpAngle } from "@/game/core/coords";

/**
 * 리모트 플레이어 보간 버퍼 — 부드러움의 핵심. (기획서 §5.3)
 *
 * 위치는 초당 5번쯤 도착하는데 화면은 초당 60번 그린다. 받은 좌표를 그대로 꽂으면
 * 다른 사람이 200ms 마다 순간이동하는 것처럼 보인다.
 *
 * 해법은 **일부러 과거를 렌더하는 것**이다. 지금이 아니라 320ms 전 시점을 그리면
 * 그 시점을 감싸는 스냅샷 두 개가 이미 도착해 있으므로, 추측(외삽) 없이
 * 두 점 사이를 채우기만 하면 된다. 지연을 내주고 부드러움을 산다.
 *
 * three 도 react 도 모르는 순수 로직이라 vitest 로 검증한다.
 */

export interface Snapshot {
  /** 클라이언트 수신 시각(ms). 서버 시계와 맞출 필요가 없어서 시계 동기화 문제가 사라진다. */
  readonly t: number;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  /** 지면 위 높이(m). 점프와 넉백이 남의 화면에도 보이려면 이게 있어야 한다. */
  readonly y: number;
}

export interface Pose {
  x: number;
  z: number;
  yaw: number;
  y: number;
}

/** 버퍼에 남길 최대 스냅샷 수. 320ms 지연이면 두세 개면 충분하고 나머지는 메모리 낭비다. */
const MAX_SNAPSHOTS = 12;

/**
 * 스냅샷을 시간순으로 넣는다.
 * 늦게 도착한(t 가 더 작은) 스냅샷은 버린다 — 순서가 뒤집히면 캐릭터가 뒤로 튄다.
 */
export function pushSnapshot(buffer: Snapshot[], snapshot: Snapshot): void {
  const last = buffer[buffer.length - 1];
  if (last !== undefined && snapshot.t <= last.t) return;

  buffer.push(snapshot);
  if (buffer.length > MAX_SNAPSHOTS)
    buffer.splice(0, buffer.length - MAX_SNAPSHOTS);
}

/**
 * renderTime 시점의 자세를 buffer 에서 뽑는다.
 *
 * 버퍼 범위를 벗어나면 **끝값으로 고정한다 — 외삽하지 않는다.**
 * 추측해서 그리면 상대가 멈췄을 때 미끄러져 나갔다가 되돌아오는 고무줄 현상이 생긴다.
 * 잠깐 멈춰 있는 편이 낫다.
 *
 * @returns 그릴 값이 있으면 true. 버퍼가 비었으면 false (아직 아무것도 못 받았다)
 */
export function sample(
  buffer: Snapshot[],
  renderTime: number,
  out: Pose,
): boolean {
  const first = buffer[0];
  if (first === undefined) return false;

  if (renderTime <= first.t) {
    out.x = first.x;
    out.z = first.z;
    out.yaw = first.yaw;
    out.y = first.y;
    return true;
  }

  const last = buffer[buffer.length - 1] as Snapshot;
  if (renderTime >= last.t) {
    out.x = last.x;
    out.z = last.z;
    out.yaw = last.yaw;
    out.y = last.y;
    return true;
  }

  for (let i = 1; i < buffer.length; i++) {
    const after = buffer[i] as Snapshot;
    if (after.t < renderTime) continue;

    const before = buffer[i - 1] as Snapshot;
    const span = after.t - before.t;
    // 같은 시각의 스냅샷이 둘 있으면 나누기가 터진다. 뒤엣것을 쓴다.
    const alpha = span <= 0 ? 1 : (renderTime - before.t) / span;

    out.x = before.x + (after.x - before.x) * alpha;
    out.z = before.z + (after.z - before.z) * alpha;
    out.yaw = lerpAngle(before.yaw, after.yaw, alpha);
    out.y = before.y + (after.y - before.y) * alpha;
    return true;
  }

  return false;
}

/** 버퍼에 남은 마지막 소식 시각. 오래되면 접속이 끊긴 것으로 본다. */
export function lastSnapshotTime(buffer: Snapshot[]): number {
  return buffer[buffer.length - 1]?.t ?? 0;
}
