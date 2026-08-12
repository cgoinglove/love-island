import type { Group } from "three";
import { isLandAt } from "@/game/core/island";
import { useActivityStore } from "@/game/net/activity";
import { emitParticles } from "@/game/world/particleBus";
import { splashColor, splashSpecs } from "@/game/world/splash";

/**
 * 캐릭터가 취하는 자세들 — 앉기와 헤엄치기.
 *
 * 둘 다 **위치가 아니라 자세**라서 시뮬레이션 밖에 있다. 그리고 둘 다
 * 내 캐릭터와 남의 캐릭터가 같은 코드로 취한다 — 남이 앉은 것도 물에 빠진 것도
 * 그냥 보여야 하기 때문이다.
 *
 * ── 앉은 자세 ──
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

/**
 * 물에 빠진 자세.
 *
 * ── 왜 좌표만 보면 되나 ──
 * 앉기와 달리 이건 **주고받을 게 없다.** 물 위인지는 좌표만 있으면 각자 계산할 수
 * 있으므로(isLandAt), 남이 물에 빠진 것도 통신 한 바이트 없이 그대로 보인다.
 * 밀쳐서 빠뜨린 사람과 빠진 사람의 화면이 어긋날 여지도 없다.
 */
export function isInWater(x: number, z: number): boolean {
  return !isLandAt(x, z);
}

/** 물에 잠기는 깊이(m). 어깨까지만 잠겨야 누구인지 알아볼 수 있다. */
const SINK = 0.42;

export function applySwimPose(body: Group, seconds: number): void {
  // 물결에 아래위로 흔들리고 몸이 조금 눕는다. 가만히 있으면 물에 꽂힌 말뚝이다.
  body.position.y = -SINK + Math.sin(seconds * 2.4) * 0.05;
  body.rotation.x = 0.12 + Math.sin(seconds * 1.7) * 0.05;
  body.rotation.z = Math.sin(seconds * 2.1) * 0.09;
}

/** 첨벙. 물에 빠지는 순간 한 번만 터진다. */
export function splashInto(x: number, z: number): void {
  emitParticles(
    splashSpecs(
      {
        x,
        y: 0,
        z,
        count: 70,
        speed: 5.2,
        spread: 0.95,
        color: splashColor(Math.random),
      },
      Math.random,
    ),
  );
}
