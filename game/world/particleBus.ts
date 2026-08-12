import type { ParticleSpec } from "@/game/world/reactionPool";

/**
 * 파티클 풀로 가는 옆문.
 *
 * 감정표현은 "방 사건" 이라 네트워크를 타고 오지만(roomEvents), 물보라 같은 건
 * **내 화면에서 지금 일어나는 일**이다. 남에게 보낼 것도 없고 종류를 계약에
 * 올릴 것도 없다. 그런 것들을 ReactionKind 에 끼워 넣으면 통신 계약이
 * 연출 목록으로 부풀어 오른다.
 *
 * 그래서 풀에 직접 쓸 수 있는 통로를 하나 열어둔다. 풀은 링버퍼 하나뿐이라
 * 물보라도 폭죽과 같은 드로우콜에 얹힌다 — 새 시스템이 아니라 같은 시스템의
 * 다른 입력이다.
 */

type Emitter = (specs: readonly ParticleSpec[]) => void;

let emitter: Emitter | null = null;

/** 풀을 들고 있는 쪽(Reactions)이 자기를 걸어둔다. */
export function setParticleEmitter(next: Emitter | null): void {
  emitter = next;
}

/**
 * 지금 이 자리에 입자를 뿌린다.
 *
 * 풀이 아직 없으면 조용히 버린다 — 물보라가 안 튀는 것과 화면이 죽는 것 중
 * 무엇이 나은지는 생각할 필요가 없다.
 */
export function emitParticles(specs: readonly ParticleSpec[]): void {
  emitter?.(specs);
}
