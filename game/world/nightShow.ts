import type { ReactionKind } from "@/shared/presence";
import type { Vec2XZ } from "@/shared/types";

/**
 * 밤에 저절로 일어나는 것들.
 *
 * ── 왜 시계에서 유도하나 ──
 * 누군가 서버에 "지금 불꽃 쏴" 라고 알리면, 그 사람이 나가면 연출이 멈춘다.
 * 시각만으로 정해지면 **아무도 책임지지 않아도 모두가 같은 걸 같은 순간에 본다.**
 * 낮밤 순환과 정확히 같은 원리이고, 통신이 0 이다.
 *
 * 순수 함수라 "몇 초에 몇 번 터지나" 를 눈이 아니라 테스트로 확인할 수 있다.
 */

/** 결정적 난수. 같은 슬롯 번호면 어디서 돌리든 같은 값이 나온다. */
function hashUnit(slot: number, salt: number): number {
  let h = Math.imul(slot ^ salt, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * 불꽃놀이가 열리는 순간 — 밤의 **정해진 세 지점**이다.
 *
 * 밤은 위상 0.5 ~ 1.0 구간이다. 달이 그 구간의 25% · 50% · 80% 를 지날 때 한 번씩
 * 큰 연출이 열린다. 간격을 초로 세지 않고 위상으로 잡는 이유는, **시계만 맞으면
 * 전원이 같은 순간에 같은 걸 보기** 때문이다 — "11초마다" 같은 규칙은 각자 언제
 * 들어왔는지에 따라 어긋날 여지가 있다.
 */
const SHOW_PHASES = [0.5 + 0.5 * 0.25, 0.5 + 0.5 * 0.5, 0.5 + 0.5 * 0.8];

/** 별똥별 간격(초). 불꽃보다 자주, 대신 훨씬 조용하게. */
const SHOOTING_STAR_PERIOD = 6.5;

/**
 * 한 번의 연출이 이어지는 시간(초). 이 안에서 여러 발이 차례로 터진다.
 *
 * 7초였을 땐 6발이 1.2초 간격으로 하나씩 올라가서, 밤하늘에 폭죽이 **한 발씩**
 * 떠 있는 그림이 됐다. 한 발이 연쇄까지 다 타는 데 3.5초쯤 걸리므로, 간격을
 * 그보다 짧게 잡아야 하늘에 서너 발이 동시에 걸린다 — "웅장함"은 한 발의 크기보다
 * 겹치는 발 수에서 나온다.
 */
export const SHOW_SECONDS = 4.5;

/** 한 번에 올라가는 발수. 3~6 발. */
const MIN_SHELLS = 3;
const MAX_SHELLS = 6;

export interface ShellShot {
  /** 이 발의 고유 번호. 같은 발을 두 번 쏘지 않으려고 호출부가 기억한다. */
  key: string;
  kind: ReactionKind;
  at: Vec2XZ;
  /** 규모 배수. 밤의 정해진 연출은 평소 감정표현보다 크게 터진다. */
  power: number;
}

/**
 * 지금 올릴 발이 있으면 돌려준다.
 *
 * 바다 위에서 터진다 — 섬 위면 사람 눈높이라 눈부시고, 무엇보다 걸어다니는 자리를
 * 파티클이 덮어버린다. 물 건너 저편에서 터지는 게 보기에도 낫다.
 *
 * @param cycleSeconds 하루 주기(초). dayNight 의 CYCLE_SECONDS 를 넘긴다.
 * @param sinceLastCall 지난 호출 이후 흐른 시간(초). 그 사이에 지나간 발도 놓치지 않는다.
 */
export function shellsToFire(
  epochSeconds: number,
  cycleSeconds: number,
  sinceLastCall: number,
): ShellShot[] {
  const shots: ShellShot[] = [];
  // 하루가 몇 번째인지. 매일 다른 불꽃이 나오게 하는 씨앗이다.
  const day = Math.floor(epochSeconds / cycleSeconds);
  const phase = (epochSeconds % cycleSeconds) / cycleSeconds;
  const prevPhase =
    ((epochSeconds - sinceLastCall) % cycleSeconds) / cycleSeconds;

  for (const [showIndex, showPhase] of SHOW_PHASES.entries()) {
    const seed = day * 977 + showIndex * 31;
    const count =
      MIN_SHELLS +
      Math.floor(hashUnit(seed, 0x5157) * (MAX_SHELLS - MIN_SHELLS + 1));

    for (let shell = 0; shell < count; shell += 1) {
      // 발마다 조금씩 늦게 올라간다. 한꺼번에 터지면 한 발과 구분이 안 된다.
      const offset = (shell / count) * (SHOW_SECONDS / cycleSeconds);
      const firePhase = showPhase + offset;

      /**
       * 이 프레임과 지난 프레임 사이에 지나갔는가.
       * 하루가 넘어가는 지점을 감안해 순환 비교를 쓴다 —
       * 안 그러면 자정 근처의 연출을 통째로 놓친다.
       */
      const passed =
        prevPhase <= phase
          ? firePhase > prevPhase && firePhase <= phase
          : firePhase > prevPhase || firePhase <= phase;
      if (!passed) continue;

      /**
       * 어디서 터질까 — **깃발보다 먼 바다**에서.
       *
       * 예전엔 해안선 바로 바깥(섬 중심 기준 25~32m)에서 터뜨렸다. 그러다 보니
       * 정북 58m 에 서 있는 배너보다 카메라에 가까워서, 폭죽이 **깃발 앞에서**
       * 터지는 그림이 됐다. 하늘의 불꽃이 깃발을 가리면 그건 하늘이 아니라
       * 깃발과 카메라 사이에 낀 무언가다 — 원근이 통째로 어긋나 보인다.
       *
       * 지금은 배너보다 뒤(64~78m)다. 겹쳐도 깃발이 앞이라 자연스럽게 가려진다.
       *
       * ⚠ 멀리 보내려면 **터지는 높이도 같이 올려야 한다.** 곡률이 거리 제곱으로
       *   끌어내리기 때문이다(110m 에서 16m). 예전에 46~70m 로 보냈다가 하나도
       *   안 보였던 게 그 높이를 안 올렸기 때문이었다 — 거리 자체가 문제가 아니었다.
       *   높이는 `shellSpeedFor(power)` 가 규모와 함께 올려준다.
       */
      const NORTH = Math.PI * 1.5;

      /**
       * 방위는 정북 **±12°~42°** — 가운데를 비워둔다.
       *
       * 카메라의 가로 화각이 ±33° 남짓이라 그 바깥은 아무도 못 본다(그래서 42° 상한).
       * 그리고 정북 한가운데는 배너가 서 있는 자리다. 뒤에서 터지니 가려도 이상하진
       * 않지만, 매번 깃발 뒤에서만 터지면 연출이 반쯤 낭비된다 — 양옆으로 비켜 쏘면
       * 깃발을 가운데 두고 좌우에서 피어오르는 그림이 된다.
       */
      const side = hashUnit(seed + shell, 0x9c17) < 0.5 ? -1 : 1;
      const bearing = 0.21 + hashUnit(seed + shell, 0x51ed) * 0.52;
      const angle = NORTH + side * bearing;
      const radius = 64 + hashUnit(seed + shell, 0x2be7) * 14;

      shots.push({
        key: `${day}:${showIndex}:${shell}`,
        /**
         * 전부 폭죽이다.
         *
         * 변화를 주려고 축포를 섞었었는데, 축포는 지면 1.3m 에서 뿜어 3m 남짓
         * 올라간다. 60~90m 떨어진 바다 위에서 그러면 하늘이 아니라 **수평선에
         * 색색의 얼룩**으로 보였다. 가까이서 사람이 눌렀을 때 좋은 연출이
         * 멀리서도 좋으리라는 보장이 없다. 변화는 색과 연쇄 횟수가 이미 만든다.
         */
        kind: "firework",
        at: [Math.cos(angle) * radius, Math.sin(angle) * radius],
        // 2.1 ~ 3.0 배. 발마다 크기가 달라야 한 발 한 발이 구분된다.
        power: 2.1 + hashUnit(seed + shell, 0x3c1d) * 0.9,
      });
    }
  }

  return shots;
}

export interface ShootingStar {
  slot: number;
  /** 시작 방위·고도와 흐르는 방향. 하늘 좌표는 호출부가 만든다. */
  bearing: number;
  elevation: number;
  travel: number;
  /** 이 슬롯이 시작된 시각(초). 진행도를 여기서 잰다. */
  startedAt: number;
}

/** 별똥별이 하늘을 가로지르는 데 걸리는 시간(초). */
export const SHOOTING_STAR_DURATION = 1.1;

export function shootingStarAt(
  epochSeconds: number,
  starOpacity: number,
): ShootingStar | null {
  // 별이 안 보이는 밝기면 별똥별도 없다.
  if (starOpacity < 0.5) return null;

  const slot = Math.floor(epochSeconds / SHOOTING_STAR_PERIOD);
  // 슬롯마다 나오지는 않는다. 매번 나오면 그건 유성우가 아니라 장식이다.
  if (hashUnit(slot, 0x1234) > 0.55) return null;

  const startedAt = slot * SHOOTING_STAR_PERIOD;
  if (epochSeconds - startedAt > SHOOTING_STAR_DURATION) return null;

  return {
    slot,
    bearing: (hashUnit(slot, 0xabcd) - 0.5) * 1.6,
    elevation: -0.24 + hashUnit(slot, 0xbeef) * 0.2,
    // 좌우 어느 쪽으로든 흐른다.
    travel: hashUnit(slot, 0xfeed) < 0.5 ? -0.55 : 0.55,
    startedAt,
  };
}
