import { Color } from "three";
import type { ParticleSpec } from "./reactionPool";

/**
 * 물보라.
 *
 * ── 왜 game/world 에 있나 ──
 * 처음엔 낚시 안에 있었다(features/fishing). 그런데 물이 튀는 건 낚시의 사정이
 * 아니라 **바다의 사정**이다 — 물고기가 뛰어오를 때도 같은 물보라가 필요하고,
 * feature 끼리는 서로를 import 할 수 없다. 쓰는 데가 둘이 되는 순간 여기가 제자리다.
 *
 * 폭죽과 같은 링버퍼에 얹는다(particleBus). 물이라고 새 시스템을 만들 이유가
 * 없다 — 셰이더가 푸는 건 "던져진 점"이고, 물방울도 던져진 점이다.
 * 다른 건 세 가지뿐이다: **무겁게 떨어지고**(중력이 크다), **금방 사라지고**,
 * **물 높이에서 멈춘다**(floor = 0).
 *
 * 색은 인자로 받는다. 꽝이면 흰 물보라지만 커피가 걸려 나올 땐 금빛이 튄다 —
 * 카드를 읽기 전에 이미 눈치채게 하는 게 이 연출의 목적이다.
 */

/** 물방울은 무겁다. 폭죽(-3.2)처럼 떠 있으면 그건 물이 아니라 연기다. */
const SPLASH_GRAVITY = -16;
const SPLASH_DRAG = 1.1;

export interface SplashOptions {
  /** 튀는 자리. y 는 보통 수면(0) 근처다. */
  x: number;
  y: number;
  z: number;
  count: number;
  /** 튀어 오르는 속도(m/s). 클수록 높이 솟는다. */
  speed: number;
  /** 옆으로 퍼지는 정도(0 이면 수직 기둥, 1 이면 반구). */
  spread: number;
  color: Color;
  /** 지금부터 몇 초 뒤에 튈지. 0 이면 즉시. */
  delay?: number;
}

const WATER = new Color("#dff3ff");
const FOAM = new Color("#ffffff");
const GOLD = new Color("#ffd36b");

/** 평범한 물보라 색. 두 가지를 섞어야 물이 덩어리로 안 보인다. */
export function splashColor(random: () => number): Color {
  return random() < 0.45 ? FOAM : WATER;
}

/** 진짜가 걸렸을 때. 물보라가 금빛이면 카드를 읽기 전에 이미 안다. */
export function jackpotColor(random: () => number): Color {
  return random() < 0.5 ? GOLD : FOAM;
}

export function splashSpecs(
  options: SplashOptions,
  random: () => number,
): ParticleSpec[] {
  const specs: ParticleSpec[] = [];
  for (let i = 0; i < options.count; i += 1) {
    const angle = random() * Math.PI * 2;
    /**
     * 반구 안에서 고르게 뽑되 위쪽으로 치우치게 한다.
     * 완전한 반구면 절반이 옆으로 날아가 수면을 기어가는데, 실제 물보라는
     * 대부분 위로 솟았다가 떨어진다.
     */
    const tilt = Math.sqrt(random()) * options.spread;
    const speed = options.speed * (0.45 + random() * 0.75);
    specs.push({
      ox: options.x + Math.cos(angle) * tilt * 0.25,
      oy: options.y,
      oz: options.z + Math.sin(angle) * tilt * 0.25,
      vx: Math.cos(angle) * tilt * speed,
      vy: speed,
      vz: Math.sin(angle) * tilt * speed,
      drag: SPLASH_DRAG,
      gravity: SPLASH_GRAVITY,
      life: 0.55 + random() * 0.55,
      delay: options.delay ?? 0,
      // 굵은 방울과 잔 물보라가 섞여야 흩어지는 느낌이 난다.
      size: 0.05 + random() * random() * 0.16,
      color: options.color,
      // 2 = 둥근 불씨. 물방울에 그대로 쓴다 — 필요한 건 부드러운 원 하나뿐이다.
      shape: 2,
      seed: random(),
      // 수면 아래로 안 내려간다. 떨어진 자리에 잠깐 남았다가 사라진다.
      floor: 0,
    });
  }
  return specs;
}
