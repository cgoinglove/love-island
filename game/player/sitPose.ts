import type { Group } from "three";
import { useActivityStore } from "@/game/net/activity";

/**
 * 앉은 자세.
 *
 * 이 캐릭터에는 다리가 없다 — 동물의숲 풍의 통짜 캡슐이다. 그래서 앉는 건
 * 관절을 접는 일이 아니라 **몸을 올리고 뒤로 눕히는** 일이 된다.
 * 의자 앉는 면이 지면 위 0.5m 라, 그만큼 띄우고 등받이 각도만큼 젖히면
 * 파묻혀 앉은 것처럼 보인다.
 *
 * ── 왜 여기서 활동 상태를 읽나 ──
 * 앉기는 features/sunset 의 기능이지만 **자세는 캐릭터를 그리는 쪽**이 안다.
 * game 은 features 를 import 할 수 없으므로(린트가 막는다), 이미 네트워크를
 * 타고 다니는 활동 상태를 그대로 읽는다. 덤으로 내 캐릭터와 남의 캐릭터가
 * 같은 코드 한 줄로 앉는다 — 남이 앉은 것도 그냥 보인다.
 */

/** 의자 앉는 면 높이(m). features/sunset 의 의자 모양과 맞물린다. */
const SEAT_LIFT = 0.44;
/** 등받이가 눕는 각(라디안). 의자 등받이(0.44)보다 조금 덜 눕는다. */
const RECLINE = 0.34;

export function isSitting(playerId: string): boolean {
  return useActivityStore.getState().doing[playerId]?.kind === "sitting";
}

export function applySitPose(body: Group): void {
  body.position.y = SEAT_LIFT;
  body.rotation.x = RECLINE;
  body.rotation.z = 0;
}
