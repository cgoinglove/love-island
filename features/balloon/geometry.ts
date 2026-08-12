import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  LatheGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from "three";
import { mergeColored, type Piece } from "@/game/world/meshKit";

/**
 * 열기구의 모양.
 *
 * ── 실루엣이 전부다 ──
 * 30m 밖에서도 보이고 하늘에 떠 있으면 100m 밖에서도 보인다. 그래서 무늬는
 * **세로 조각(gore)** 으로만 넣는다 — 열기구가 열기구로 보이는 건 그 세로줄 때문이고,
 * 그건 거리가 멀어져도 안 뭉개지는 몇 안 되는 무늬다.
 */

/**
 * 기구 껍질의 옆선. x 가 반지름, y 가 높이(바구니 위 기준).
 *
 * ⚠ **아래에서 위로** 올라가야 한다. LatheGeometry 는 점의 순서로 앞뒷면을
 *   정하는데, 위에서 아래로 주면 면이 통째로 뒤집혀 **법선이 안쪽을 본다.**
 *   그러면 뒷면 제거가 가까운 쪽 절반을 지워버리고, 보는 사람은 기구 너머
 *   하늘이 비치는 걸 본다 — "풍선에 빵꾸가 뚫렸다" 의 정체가 이것이었다.
 *   눈으로는 색이 이상한 정도로만 보여서 알아채기 어렵고, 실제로 확인하려면
 *   법선과 반지름 방향의 내적을 재야 한다(전부 음수였다).
 */
function envelopeProfile(): Vector2[] {
  return [
    new Vector2(1.15, 1.2),
    new Vector2(1.9, 1.8),
    new Vector2(2.9, 2.7),
    new Vector2(3.7, 3.9),
    new Vector2(3.9, 5.2),
    new Vector2(3.6, 6.5),
    new Vector2(2.7, 7.7),
    new Vector2(1.3, 8.4),
    new Vector2(0.0, 8.6),
  ];
}

/** 세로 조각 수. 짝수여야 색이 한 바퀴 돌아 이어진다. */
const GORES = 10;

/**
 * 바구니 바닥이 원점이 되도록 통째로 올려주는 높이(m).
 *
 * ⚠ 처음엔 껍질 아래 어디쯤이 원점이었다. 그러면 **바구니가 땅에 반쯤 묻히고**
 *   탄 사람은 바구니 위에 떠서 선다 — 탈것의 원점은 발이 닿는 자리여야 한다.
 *   그래야 "기구의 높이" 하나로 사람의 높이까지 정해진다.
 */
const FLOOR_LIFT = 1.31;

export function buildBalloon(): BufferGeometry {
  const profile = envelopeProfile();
  const CLOTH_A = "#e8734a";
  const CLOTH_B = "#f4ede0";
  const CLOTH_C = "#5e9c55";
  const ROPE = "#7d6a52";
  const BASKET = "#a9793f";
  const BASKET_DARK = "#8a6440";

  const pieces: Piece[] = [];

  // 껍질 — 조각마다 색을 달리해 세로줄을 만든다.
  for (let i = 0; i < GORES; i += 1) {
    const slice = (Math.PI * 2) / GORES;
    pieces.push({
      geometry: new LatheGeometry(profile, 6, i * slice, slice),
      color: i % 3 === 0 ? CLOTH_A : i % 3 === 1 ? CLOTH_B : CLOTH_C,
    });
  }

  /**
   * 주둥이 마개. 껍질은 **면 한 겹**이라 아래가 뚫려 있고, 12m 짜리가 머리
   * 위에 뜨면 사람은 그 구멍을 정면으로 올려다본다 — 안이 비어 있으면
   * 기구 속으로 하늘이 보인다. 안쪽 천 색으로 한 장 덮는다.
   */
  pieces.push({
    geometry: new CylinderGeometry(1.15, 1.15, 0.08, GORES),
    color: "#c8b9a6",
    position: [0, 1.24, 0],
  });

  // 아래 주둥이 테. 천이 끝나는 자리를 매듭짓는다.
  pieces.push({
    geometry: new TorusGeometry(1.15, 0.09, 6, 16),
    color: ROPE,
    rotation: [Math.PI / 2, 0, 0],
    position: [0, 1.2, 0],
  });

  // 바구니에서 껍질로 올라가는 줄 넷.
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    pieces.push({
      geometry: new CylinderGeometry(0.045, 0.045, 1.5, 5),
      color: ROPE,
      rotation: [sz * 0.16, 0, -sx * 0.16],
      position: [sx * 0.78, 0.5, sz * 0.78],
    });
  }

  /**
   * 바구니. 넷이 타도 겹치지 않을 만큼 넓다(2.6m).
   * 옆면을 네 장으로 세우고 위에 테를 둘러야 **속이 빈 바구니**로 보인다 —
   * 상자를 하나 두면 사람이 그 위에 서 있는 그림이 된다.
   */
  /**
   * ⚠ 옆면이 낮다(0.85m). 실제 열기구 바구니는 어른 가슴께까지 오지만,
   *   그러면 **탄 사람이 안 보인다** — 머리끝만 빼꼼 나오는 그림이 됐다.
   *   누가 탔는지 보이는 게 같이 타는 기능의 거의 전부라, 여기서는
   *   사실보다 보이는 쪽을 택한다.
   */
  for (const [sx, sz] of [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ] as const) {
    pieces.push({
      geometry: new BoxGeometry(
        sx === 0 ? 2.6 : 0.12,
        0.85,
        sz === 0 ? 2.6 : 0.12,
      ),
      color: BASKET,
      position: [sx * 1.3, -0.815, sz * 1.3],
    });
  }
  // 바닥
  pieces.push({
    geometry: new BoxGeometry(2.6, 0.14, 2.6),
    color: BASKET_DARK,
    position: [0, -1.24, 0],
  });

  /**
   * 손잡이 테.
   *
   * ⚠ 한 번 **판때기 한 장**으로 얹었다가 바구니가 뚜껑 덮인 상자가 됐다.
   *   탄 사람은 그 뚜껑 위에 서서 머리만 내놓았고, 바구니 안은 아예 안 보였다.
   *   테는 테라서 가운데가 비어 있어야 한다 — 네 변으로 두른다.
   */
  for (const [sx, sz] of [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ] as const) {
    pieces.push({
      geometry: new BoxGeometry(
        sx === 0 ? 2.85 : 0.18,
        0.16,
        sz === 0 ? 2.85 : 0.18,
      ),
      color: BASKET_DARK,
      position: [sx * 1.34, -0.36, sz * 1.34],
    });
  }

  const geometry = mergeColored(pieces);
  geometry.translate(0, FLOOR_LIFT, 0);
  return geometry;
}

/**
 * 계류장.
 *
 * ⚠ 처음엔 모래색 **원판 한 장**이었다. 지름 12m 짜리 기구가 앉는 자리인데
 *   바닥에 동그라미만 그려두니, 기구가 잔디밭에 놓인 게 아니라 잔디밭에
 *   **붙어 있는** 것처럼 보였다. 앉는 자리는 앉는 자리처럼 생겨야 한다 —
 *   판을 깔고, 기둥을 세우고, 묶어둘 밧줄과 모래주머니를 둔다.
 *
 * 조각이 서른 개 넘지만 병합해서 메시 하나다.
 */
export function buildPad(): BufferGeometry {
  const PLANK_A = "#b98d55";
  const PLANK_B = "#a97e4a";
  const POST = "#7d5836";
  const ROPE = "#d9cdb6";
  const SAND = "#c9a97e";

  const pieces: Piece[] = [];

  /**
   * 바닥은 널 여덟 장이다. 원판 하나면 아무리 색을 골라도 원판이고,
   * 널을 깔면 그 순간 **사람이 만든 자리**가 된다.
   */
  for (let i = 0; i < 8; i += 1) {
    const offset = (i - 3.5) * 0.92;
    // 원형 판이라 가장자리 널은 짧다. 원의 현 길이를 그대로 쓴다.
    const half = Math.sqrt(Math.max(0.2, 3.6 * 3.6 - offset * offset));
    pieces.push({
      geometry: new BoxGeometry(0.84, 0.16, half * 2),
      color: i % 2 === 0 ? PLANK_A : PLANK_B,
      position: [offset, 0.08, 0],
    });
  }

  // 테두리 — 널 끝을 감싸는 둥근 테. 잘린 단면이 그대로 보이면 판때기다.
  pieces.push({
    geometry: new TorusGeometry(3.62, 0.14, 6, 28),
    color: POST,
    rotation: [Math.PI / 2, 0, 0],
    position: [0, 0.14, 0],
  });

  // 계류 기둥 넷과 거기 감긴 밧줄.
  for (let i = 0; i < 4; i += 1) {
    const turn = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const px = Math.cos(turn) * 3.05;
    const pz = Math.sin(turn) * 3.05;
    pieces.push(
      {
        geometry: new CylinderGeometry(0.16, 0.19, 1.05, 8),
        color: POST,
        position: [px, 0.62, pz],
      },
      // 기둥 머리. 이게 있어야 말뚝이 아니라 계선주로 보인다.
      {
        geometry: new SphereGeometry(0.2, 8, 6),
        color: POST,
        position: [px, 1.16, pz],
      },
      {
        geometry: new TorusGeometry(0.22, 0.055, 5, 12),
        color: ROPE,
        rotation: [Math.PI / 2, 0, 0],
        position: [px, 0.78, pz],
      },
    );
  }

  // 모래주머니 몇 개. 기구를 눌러두는 물건이라 있으면 용도가 읽힌다.
  for (const [bx, bz, turn] of [
    [2.1, 1.5, 0.4],
    [2.5, 1.0, -0.3],
    [-2.3, -1.6, 1.1],
  ] as const) {
    pieces.push({
      geometry: new SphereGeometry(0.42, 10, 8),
      color: SAND,
      scale: [1, 0.62, 1.25],
      rotation: [0, turn, 0],
      position: [bx, 0.36, bz],
    });
  }

  return mergeColored(pieces);
}

/**
 * 버너 — 밤에 켜지는 부분이라 따로 굽는다.
 *
 * 실제 열기구에서 가장 눈에 띄는 건 이 불꽃이다. 밤하늘에 떠 있는 기구는
 * 몇 초에 한 번 **속이 환해지는** 것으로 존재를 알린다.
 */
export function buildBurner(): BufferGeometry {
  const geometry = mergeColored([
    {
      geometry: new CylinderGeometry(0.36, 0.24, 0.9, 8),
      color: "#ffd76b",
      position: [0, 0.65, 0],
    },
  ]);
  geometry.translate(0, FLOOR_LIFT, 0);
  return geometry;
}
