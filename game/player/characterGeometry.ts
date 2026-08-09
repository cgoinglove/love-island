import {
  type BufferGeometry,
  CapsuleGeometry,
  ConeGeometry,
  SphereGeometry,
} from "three";
import { mergeColored, type Piece } from "@/game/world/meshKit";
import { type CharacterLook, lookOf } from "./characterLook";

/**
 * 캐릭터 한 명을 메시 **하나**로 굽는다.
 *
 * ── 왜 ──
 * 몸 · 머리 · 귀 둘 · 눈 둘 · 코 · 액세서리를 각각 메시로 두면 한 명에 드로우콜 열이다.
 * 다섯 명이 모이자 그것만 50 이 되어 예산 경고가 떴다 — 화면에 보이는 건 인형 다섯인데.
 *
 * 색을 정점에 구워 넣으면 한 명에 하나로 줄어든다. 걸음·점프 애니메이션은
 * 이 메시를 감싼 그룹을 돌리는 방식이라 병합해도 그대로 동작한다.
 *
 * ── 캐시 ──
 * 외형은 playerId 로 정해지고 종류가 유한하다. 같은 모습이 두 번 나오면 지오메트리를
 * 재사용한다 — 사람이 늘어도 GPU 버퍼는 **모습의 가짓수**만큼만 늘어난다.
 */
/** 몸통 굵기. 팔이 여기 닿아 있어야 붙어 보인다 — characterGeometry.test.ts 참고. */
export const BODY_RADIUS = 0.3;
const BODY_LENGTH = 0.46;
const BODY_CENTER_Y = BODY_RADIUS + BODY_LENGTH / 2;

/** 머리 꼭대기 높이. 이름표를 띄울 때 쓴다. 가장 큰 머리를 기준으로 잡는다. */
export const CHARACTER_HEIGHT = BODY_CENTER_Y + 0.52 * 1.2 + 0.34 * 1.18 + 0.3;

const cache = new Map<string, BufferGeometry>();

function keyOf(look: CharacterLook): string {
  return [
    look.bodyColor,
    look.headColor,
    look.noseColor,
    look.earStyle,
    look.accessory,
    look.accessoryColor,
    look.headScale.toFixed(3),
    look.bodyScale.toFixed(3),
  ].join("|");
}

/**
 * 팔 하나.
 *
 * 몸에 병합하지 않는다 — 흔들려야 하니까. 캐릭터당 드로우콜 둘이 늘지만,
 * 가만히 서 있는 인형과 팔을 흔드는 인형은 살아 있는 정도가 다르다.
 * 어깨가 원점이라 쓰는 쪽에서 그룹을 돌리면 팔이 어깨에서 돈다.
 *
 * ⚠ 캡슐이 **어깨보다 위로 조금 더 올라온다**(위 끝이 로컬 +0.055).
 *
 * 팔이 내려가 있을 땐 몸통에 파묻혀 있어서 이게 없어도 붙어 보였다. 그런데 팔을
 * 옆으로 들어 올리면 어깨를 축으로 회전하면서 캡슐 위 끝이 축 바깥으로 돌아 나가,
 * 몸통(반지름 0.3)과 팔 사이에 4~5cm 틈이 생겼다 — **팔이 떨어져 보였다.**
 * 축 근처를 채워두면 어느 각도로 돌아가든 그 부분이 몸통 안에 남는다.
 */
let armGeometry: BufferGeometry | null = null;

export function getArmGeometry(): BufferGeometry {
  armGeometry ??= mergeColored([
    {
      geometry: new CapsuleGeometry(0.085, 0.36, 4, 8),
      color: "#ffffff",
      position: [0, -0.21, 0],
    },
  ]);
  return armGeometry;
}

/** 어깨가 붙는 자리. 몸통 옆, 조금 위. */
export function shoulderOf(seed: string): { x: number; y: number } {
  const look = lookOf(seed);
  /**
   * 몸통 반지름(0.3)보다 살짝 안쪽. 팔 굵기(0.085)가 있어서 이래도 실루엣은 갈라진다.
   * 0.34 였을 땐 팔을 들었을 때 어깨 축이 몸통 바깥에 있어서 틈이 벌어졌다.
   */
  return { x: 0.32, y: BODY_CENTER_Y + 0.18 * look.bodyScale };
}

export function characterGeometryFor(seed: string): BufferGeometry {
  const look = lookOf(seed);
  const key = keyOf(look);

  const cached = cache.get(key);
  if (cached) return cached;

  const built = build(look);
  cache.set(key, built);
  return built;
}

function build(look: CharacterLook): BufferGeometry {
  const headR = 0.34 * look.headScale;
  const headY = BODY_CENTER_Y + 0.52 * look.bodyScale;

  const pieces: Piece[] = [
    {
      geometry: new CapsuleGeometry(BODY_RADIUS, BODY_LENGTH, 6, 16),
      color: look.bodyColor,
      scale: [1, look.bodyScale, 1],
      position: [0, BODY_CENTER_Y, 0],
    },
    {
      geometry: new SphereGeometry(headR, 20, 16),
      color: look.headColor,
      position: [0, headY, 0],
    },
    // 눈은 앞(-Z)에 붙는다. 이게 있어야 어디를 보는지 한눈에 읽힌다.
    ...[-0.35, 0.35].map<Piece>((side) => ({
      geometry: new SphereGeometry(0.045, 10, 8),
      color: "#2f2a26",
      position: [side * headR, headY + 0.12 * headR, -headR * 0.88],
    })),
    {
      geometry: new ConeGeometry(0.07, 0.14, 8),
      color: look.noseColor,
      rotation: [-Math.PI / 2, 0, 0],
      position: [0, headY - 0.18 * headR, -headR * 0.97],
    },
    ...ears(look, headR, headY),
    ...accessory(look, headR, headY),
  ];

  return mergeColored(pieces);
}

/**
 * 귀. 실루엣이 캡슐 두 개에서 "캐릭터"로 바뀌는 지점이 여기다.
 *
 * 네 종류뿐이지만 머리 크기·몸 길이·색과 곱해지면 겹치는 조합이 거의 안 나온다.
 */
function ears(look: CharacterLook, headR: number, headY: number): Piece[] {
  if (look.earStyle === "none") return [];
  const sides = [-1, 1] as const;

  if (look.earStyle === "tall") {
    // 토끼 귀. 위로 길게 뻗어 실루엣이 가장 크게 달라진다.
    return sides.map((side) => ({
      geometry: new SphereGeometry(0.16, 12, 10),
      color: look.headColor,
      scale: [0.5, 1.5, 0.45],
      rotation: [0, 0, side * 0.22],
      position: [side * headR * 0.5, headY + headR * 1.15, 0],
    }));
  }

  if (look.earStyle === "flop") {
    // 늘어진 귀. 옆으로 처져서 얼굴이 넓어 보인다.
    return sides.map((side) => ({
      geometry: new SphereGeometry(0.16, 12, 10),
      color: look.headColor,
      scale: [0.42, 0.95, 0.4],
      rotation: [0, 0, side * -0.5],
      position: [side * headR * 0.95, headY + headR * 0.15, 0],
    }));
  }

  return sides.map((side) => ({
    geometry: new SphereGeometry(headR * 0.33, 12, 10),
    color: look.headColor,
    position: [side * headR * 0.62, headY + headR * 0.8, 0.02],
  }));
}

/** 절반 넘게는 아무것도 안 쓴다. 다 쓰고 있으면 그게 특징이 안 된다. */
function accessory(look: CharacterLook, headR: number, headY: number): Piece[] {
  if (look.accessory === "none") return [];

  if (look.accessory === "leaf") {
    // 머리에 얹은 잎사귀 하나. 섬에서 주운 것처럼 비스듬히.
    return [
      {
        geometry: new SphereGeometry(0.2, 10, 8),
        color: look.accessoryColor,
        scale: [0.5, 0.08, 1],
        rotation: [0.5, 0.4, -0.5],
        position: [headR * 0.3, headY + headR * 0.92, -0.02],
      },
    ];
  }

  if (look.accessory === "cap") {
    /**
     * 모자는 머리 곡면에 **얹혀야** 한다.
     *
     * 반구의 밑면 반지름을 그 높이에서의 머리 단면보다 크게 잡으면 테두리가 밖으로
     * 벌어져서 머리를 가로지르는 대접처럼 보인다. 실제로 그렇게 나왔다.
     * 높이 h 에서 머리 단면은 √(r²-h²) 이므로, 딱 그만큼만 잡고 그 자리에 놓는다.
     */
    const sit = headR * 0.2;
    const brimRadius = Math.sqrt(headR * headR - sit * sit);

    return [
      {
        geometry: new SphereGeometry(
          brimRadius,
          16,
          10,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2,
        ),
        color: look.accessoryColor,
        /**
         * 돔이 머리 위로 **솟아야** 한다.
         *
         * 0.62 로 눌렀더니 꼭대기가 머리 표면보다 낮아져서 모자가 머리 속에 파묻혔고,
         * 테두리만 초록 띠처럼 남았다. 머리 반지름의 1.12 배까지 올라오게 잡는다.
         */
        scale: [1, (headR * 1.12 - sit) / brimRadius, 1],
        position: [0, headY + sit, 0],
      },
      // 챙. 앞(-Z)으로 나온다
      {
        geometry: new SphereGeometry(
          headR * 0.6,
          12,
          8,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2,
        ),
        color: look.accessoryColor,
        scale: [1, 0.1, 1.15],
        position: [0, headY + sit - headR * 0.02, -headR * 0.72],
      },
    ];
  }

  // 리본. 머리 옆에 작은 매듭 둘.
  return [-1, 1].map((side) => ({
    geometry: new SphereGeometry(0.09, 10, 8),
    color: look.accessoryColor,
    scale: [0.55, 1, 0.55],
    rotation: [0, 0, 0.3],
    position: [headR * 0.72, headY + headR * 0.62 + side * 0.075, 0],
  }));
}
