import {
  type BufferGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  type Vector2,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mergeColored, type Piece } from "@/game/world/meshKit";

/**
 * 바다에 뜨고 헤엄치는 것들의 모양.
 *
 * ── 왜 따로 있나 ──
 * 시간표(seaTraffic)와 그리는 쪽(SeaLife)은 이미 나뉘어 있었는데, 모양이 그리는
 * 쪽에 눌러앉아 있었다. 배 한 척이 상자 여섯 개였을 땐 그래도 됐다. 제대로
 * 만들기 시작하니 조각이 마흔 개가 되고, 그러면 그건 컴포넌트가 아니라 **모델**이다.
 *
 * ── 이 파일이 지키는 규칙 ──
 * **물이 투명하다.** 얕은 물에서 모래톱이 비쳐 보이는 건 이 세계의 장점인데,
 * 그 대가로 물 아래를 대충 만들면 그게 그대로 다 보인다. 실제로 상어를
 * 등지느러미 하나로만 만들어 뒀더니, 물속에 **아무것도 없는 지느러미**가
 * 혼자 떠다녔다. 물 밖으로 나오는 부분만 만드는 건 여기서는 통하지 않는다.
 *
 * 조각이 몇 개든 병합해서 메시 하나로 굽는다(mergeColored) — 드로우콜은 배 한 척에
 * 하나, 상어 한 마리에 둘(몸통·꼬리)이다.
 */

// ── 배 ──────────────────────────────────────────────

/** 배의 전체 길이(m). 뱃머리에서 선미까지. */
export const BOAT_LENGTH = 7.1;

/**
 * 평면도. **뱃머리가 +y**, 좌우가 x 다.
 *
 * 상자를 45° 돌려 뱃머리 흉내를 내던 걸 그만뒀다. 배가 배로 보이는 건 뱃머리가
 * 뾰족해서가 아니라 **옆선이 휘어서**다 — 직선 두 개로는 아무리 뾰족하게 깎아도
 * 상자다. 베지에로 그리면 그 휨이 공짜로 나오고, 같은 곡선에서 난간 기둥 자리까지
 * 뽑아 쓸 수 있다.
 */
function boatPlan(): Shape {
  const plan = new Shape();
  plan.moveTo(0, 4.0);
  // 우현 — 뱃머리에서 배가 가장 넓은 곳까지 부풀었다가 선미로 좁아진다.
  plan.bezierCurveTo(0.92, 2.9, 1.24, 1.0, 1.2, -1.4);
  plan.quadraticCurveTo(1.16, -3.0, 0, -3.1);
  // 좌현 — 우현의 거울.
  plan.quadraticCurveTo(-1.16, -3.0, -1.2, -1.4);
  plan.bezierCurveTo(-1.24, 1.0, -0.92, 2.9, 0, 4.0);
  return plan;
}

/**
 * 평면도를 세워 선체로 만든다.
 *
 * 위아래 모서리를 깎으면(bevel) 바닥은 용골 쪽으로 좁아지고 위는 뱃전이 둥글게
 * 말린다. 판때기 두 장을 붙이는 것보다 이쪽이 짧고, 무엇보다 **물에 잠긴 부분이
 * 그럴듯하다** — 투명한 물 아래로 그게 다 보인다.
 */
function hullGeometry(plan: Shape, depth: number, bevel: number) {
  const geometry = new ExtrudeGeometry(plan, {
    depth,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel * 1.25,
    bevelSegments: 3,
    curveSegments: 14,
  });
  // 평면도를 눕힌다: 도형의 +y 가 월드 -z(정면), 밀어낸 방향이 위가 된다.
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/**
 * 곡선 위에 난간을 세운다. 기둥과 그 사이를 잇는 가로대.
 *
 * ⚠ 가로대는 **원기둥을 눕혀** 만든다. 원기둥의 축은 +Y 라, 먼저 X 로 90° 눕혀
 *   축을 Z 로 보낸 다음 Y 로 돌려 방향을 맞춘다. 순서가 뒤집히면 난간이
 *   허공에서 제멋대로 꺾인다 — mergeColored 는 X → Y → Z 순으로 돌린다.
 */
function railing(points: Vector2[], y: number, color: string): Piece[] {
  const pieces: Piece[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const point = points[i];
    const next = points[i + 1];
    if (!point || !next) continue;

    // 기둥은 두 칸에 하나씩. 다 세우면 촘촘한 울타리가 된다.
    if (i % 2 === 0) {
      pieces.push({
        geometry: new CylinderGeometry(0.032, 0.032, 0.46, 5),
        color,
        position: [point.x, y + 0.23, -point.y],
      });
    }

    const dx = next.x - point.x;
    const dz = -(next.y - point.y);
    const span = Math.hypot(dx, dz);
    if (span < 0.01) continue;
    pieces.push({
      geometry: new CylinderGeometry(0.028, 0.028, span, 4),
      color,
      rotation: [Math.PI / 2, Math.atan2(dx, dz), 0],
      position: [point.x + dx / 2, y + 0.44, -point.y + dz / 2],
    });
  }
  return pieces;
}

/** 모서리를 둥글린 사각형. 선실처럼 작은 덩어리는 각이 서면 상자 티가 난다. */
function roundedRect(width: number, length: number, radius: number): Shape {
  const shape = new Shape();
  const w = width / 2;
  const l = length / 2;
  shape.moveTo(-w + radius, -l);
  shape.lineTo(w - radius, -l);
  shape.quadraticCurveTo(w, -l, w, -l + radius);
  shape.lineTo(w, l - radius);
  shape.quadraticCurveTo(w, l, w - radius, l);
  shape.lineTo(-w + radius, l);
  shape.quadraticCurveTo(-w, l, -w, l - radius);
  shape.lineTo(-w, -l + radius);
  shape.quadraticCurveTo(-w, -l, -w + radius, -l);
  return shape;
}

const HULL = "#f4ede0";
const HULL_STRIPE = "#2f4858";
const DECK = "#c9a97e";
const CABIN = "#e8734a";
const TRIM = "#8a6440";
const GLASS = "#2b3f4d";

/**
 * 갑판의 높이(m). 수면 기준.
 *
 * ⚠ 이 값이 **선체 윗면과 같아야** 한다. 처음엔 갑판을 0.62 에 뒀는데 선체
 *   윗면은 0.96 이었다 — 나무 갑판이 통째로 선체 **속에 묻혔고**, 화면에는
 *   선체의 흰 윗면만 커다란 타원으로 남았다. 멀리서 보면 배가 아니라
 *   물 위에 뜬 접시였다. 밀어낸 도형은 속이 찬 덩어리라는 걸 잊으면 이렇게 된다.
 *
 * 갑판을 선체 윗면 바로 위에 조금 작게 얹으면, 둘레에 남는 흰 테두리가
 * 그대로 뱃전이 된다.
 */
const DECK_Y = 0.96;

export function buildBoat(): BufferGeometry {
  const plan = boatPlan();

  const pieces: Piece[] = [
    // 선체. 바닥이 좁아지고 뱃전이 둥글게 말린다.
    {
      geometry: hullGeometry(plan, 1.15, 0.34),
      color: HULL,
      position: [0, -0.62, 0],
    },
    /**
     * 흘수선의 띠. 평면도를 살짝 부풀려 얇게 두르면 **칠한 줄**로 보인다.
     * 배가 물에 얼마나 잠겼는지 알려주는 게 이 한 줄이다.
     */
    {
      geometry: hullGeometry(plan, 0.24, 0.08),
      color: HULL_STRIPE,
      scale: [1.04, 1, 1.025],
      position: [0, -0.12, 0],
    },
    // 갑판. 선체 윗면 바로 위에 얹어 흰 뱃전을 한 줄 남긴다.
    {
      geometry: new ShapeGeometry(plan, 14).rotateX(-Math.PI / 2),
      color: DECK,
      scale: [0.86, 1, 0.9],
      position: [0, DECK_Y + 0.02, 0],
    },
  ];

  // 난간 — 뱃머리 쪽에만. 뒤까지 두르면 선실에 파묻힌다.
  const outline = plan.getPoints(26).filter((point) => point.y > -0.4);
  pieces.push(...railing(outline, DECK_Y, TRIM));

  /**
   * 선실.
   *
   * ⚠ 처음엔 작게 얹었는데, 그러면 넓은 갑판 한가운데 상자 하나가 놓인 뗏목이
   *   된다. 이 크기의 배는 **위쪽 구조물이 길이의 절반쯤**을 차지해야 배로 읽힌다.
   */
  const cabin = roundedRect(1.85, 3.1, 0.3);
  pieces.push(
    {
      geometry: new ExtrudeGeometry(cabin, {
        depth: 1.5,
        bevelEnabled: true,
        bevelSize: 0.06,
        bevelThickness: 0.06,
        bevelSegments: 2,
        curveSegments: 6,
      }).rotateX(-Math.PI / 2),
      color: CABIN,
      position: [0, DECK_Y, 0.45],
    },
    // 지붕이 조금 튀어나온다. 처마가 있으면 상자가 건물이 된다.
    {
      geometry: new ExtrudeGeometry(roundedRect(2.15, 3.4, 0.34), {
        depth: 0.13,
        bevelEnabled: false,
        curveSegments: 6,
      }).rotateX(-Math.PI / 2),
      color: HULL,
      position: [0, DECK_Y + 1.53, 0.45],
    },
    // 조타실 위 작은 굴뚝.
    {
      geometry: new CylinderGeometry(0.16, 0.18, 0.72, 8),
      color: HULL_STRIPE,
      position: [0.45, DECK_Y + 1.9, 1.35],
    },
  );

  // 창. 앞은 넓게 한 장, 옆은 두 장씩.
  pieces.push({
    geometry: new ExtrudeGeometry(roundedRect(1.35, 0.1, 0.04), {
      depth: 0.62,
      bevelEnabled: false,
      curveSegments: 3,
    }).rotateX(-Math.PI / 2),
    color: GLASS,
    position: [0, DECK_Y + 0.7, -1.06],
  });
  for (const side of [-1, 1]) {
    for (const offset of [0.1, 1.05]) {
      pieces.push({
        geometry: new ExtrudeGeometry(roundedRect(0.1, 0.72, 0.04), {
          depth: 0.58,
          bevelEnabled: false,
          curveSegments: 3,
        }).rotateX(-Math.PI / 2),
        color: GLASS,
        position: [side * 0.94, DECK_Y + 0.72, offset],
      });
    }
  }

  /**
   * 뱃머리 갑판의 짐 — 상자 둘과 둘둘 감은 밧줄.
   * 갑판이 비어 있으면 아무리 잘 깎아도 모형 같다. 사람이 쓰는 물건이
   * 놓여 있어야 일하는 배로 보인다.
   */
  pieces.push(
    {
      geometry: new ExtrudeGeometry(roundedRect(0.62, 0.62, 0.06), {
        depth: 0.45,
        bevelEnabled: false,
        curveSegments: 2,
      }).rotateX(-Math.PI / 2),
      color: TRIM,
      rotation: [0, 0.3, 0],
      position: [-0.34, DECK_Y, -1.95],
    },
    {
      geometry: new ExtrudeGeometry(roundedRect(0.5, 0.5, 0.06), {
        depth: 0.38,
        bevelEnabled: false,
        curveSegments: 2,
      }).rotateX(-Math.PI / 2),
      color: DECK,
      rotation: [0, -0.2, 0],
      position: [0.36, DECK_Y, -1.6],
    },
    {
      geometry: new TorusGeometry(0.28, 0.09, 6, 12),
      color: "#d9cdb6",
      rotation: [Math.PI / 2, 0, 0],
      position: [0.28, DECK_Y + 0.1, -2.5],
    },
  );

  // 돛대와 깃발. 세로 선 하나가 실루엣을 완성한다.
  pieces.push(
    {
      geometry: new CylinderGeometry(0.05, 0.07, 3.2, 6),
      color: TRIM,
      position: [0, DECK_Y + 2.6, 0.1],
    },
    {
      geometry: new CylinderGeometry(0.035, 0.035, 1.4, 5),
      color: TRIM,
      rotation: [0, 0, Math.PI / 2],
      position: [0, DECK_Y + 3.7, 0.1],
    },
    {
      geometry: new ExtrudeGeometry(roundedRect(0.6, 0.4, 0.04), {
        depth: 0.03,
        bevelEnabled: false,
        curveSegments: 2,
      }).rotateX(-Math.PI / 2),
      color: CABIN,
      rotation: [Math.PI / 2, 0, 0],
      position: [0.35, DECK_Y + 3.5, 0.1],
    },
    // 뱃머리 밧줄 걸이. 작지만 이런 게 배를 장난감이 아니게 만든다.
    {
      geometry: new CylinderGeometry(0.055, 0.055, 0.36, 6),
      color: TRIM,
      position: [0, DECK_Y + 0.18, -3.2],
    },
  );

  return mergeColored(pieces);
}

/** 밤에 켜지는 것들 — 스스로 빛나는 재질로 따로 굽는다. */
export function buildBoatLights(): BufferGeometry {
  return mergeColored([
    // 돛대 등.
    {
      geometry: new SphereGeometry(0.14, 8, 6),
      color: "#ffe9a8",
      position: [0, DECK_Y + 4.25, 0.1],
    },
    // 선실 창에서 새는 불빛. 낮의 유리와 같은 자리에 겹쳐 놓는다.
    {
      geometry: new ExtrudeGeometry(roundedRect(1.35, 0.1, 0.04), {
        depth: 0.62,
        bevelEnabled: false,
        curveSegments: 3,
      }).rotateX(-Math.PI / 2),
      color: "#ffdf95",
      scale: [1, 1, 1.4],
      position: [0, DECK_Y + 0.7, -1.08],
    },
    ...[-1, 1].flatMap((side) =>
      [0.1, 1.05].map((offset) => ({
        geometry: new ExtrudeGeometry(roundedRect(0.1, 0.72, 0.04), {
          depth: 0.58,
          bevelEnabled: false,
          curveSegments: 3,
        }).rotateX(-Math.PI / 2),
        color: "#ffdf95",
        scale: [1.4, 1, 1] as const,
        position: [side * 0.95, DECK_Y + 0.72, offset] as const,
      })),
    ),
  ]);
}

/**
 * 뱃등이 쏘는 빛줄기와 그 빛이 물에 닿아 생기는 웅덩이.
 *
 * 모양은 원뿔 껍데기 하나와 원판 하나뿐이고, **부피처럼 보이게 만드는 건 셰이더**다
 * (shaders.ts 의 BEAM_*). 여기서 정하는 건 그 둘의 치수와, 셋이 서로 맞물리는 관계다.
 */

/**
 * 빛줄기의 길이(m)와 끝의 반지름(m).
 *
 * ⚠ 길이는 물에 닿는 거리(10.9m)보다 **아주 조금만** 길어야 한다. 12.4 로 뒀더니
 *   원뿔이 수면을 뚫고 1.5m 더 내려가서, 물 아래에 밝은 꼬리가 남았다 —
 *   빛이 물에 닿아 멈추는 게 아니라 물을 통과하는 것으로 보인다.
 */
export const BEAM_LENGTH = 11.1;
const BEAM_RADIUS = 2.35;

/**
 * 등이 달린 높이(m)와 빛줄기가 숙인 각(라디안).
 *
 * ⚠ 이 셋(높이 · 각도 · 길이)은 **같이 움직인다.** 높이를 숙인 각으로 나누면
 *   빛이 물에 닿는 거리가 나오고, 빛줄기가 그보다 짧으면 물에 닿기 전에
 *   허공에서 끊긴다 — 등대가 아니라 공중에 뜬 고깔이 된다.
 *   seaProps.test.ts 가 그 관계를 지킨다.
 */
export const LAMP_Y = DECK_Y + 4.25;
export const BEAM_PITCH = 0.5;

/** 빛이 물에 닿는 자리까지의 수평 거리(m). */
export function beamReach(): number {
  return LAMP_Y / Math.tan(BEAM_PITCH);
}

/**
 * 등에서 앞으로 뻗는 원뿔. 꼭짓점이 등, 밑면이 먼 쪽이다.
 *
 * 뚜껑이 없다(openEnded). 있으면 빛줄기 끝이 접시처럼 잘려 보이고,
 * 어차피 셰이더가 그 근처를 투명하게 지운다.
 */
export function buildBoatBeam(): BufferGeometry {
  const cone = new ConeGeometry(BEAM_RADIUS, BEAM_LENGTH, 24, 1, true);
  // 꼭짓점을 원점으로 옮기고 눕혀서 -Z(정면)로 뻗게 한다.
  cone.translate(0, -BEAM_LENGTH / 2, 0);
  cone.rotateX(Math.PI / 2);
  return cone;
}

/**
 * 물 위의 빛 웅덩이.
 *
 * 빛이 비스듬히 떨어지므로 진행 방향으로 늘어난다 — 늘어나는 비율이 곧 1/sin(각).
 * uv 는 늘려도 그대로라 셰이더의 원형 감쇠가 그대로 타원이 된다.
 */
export function buildLightPool(): BufferGeometry {
  const disc = new CircleGeometry(BEAM_RADIUS * 1.45, 32);
  disc.rotateX(-Math.PI / 2);
  disc.scale(1, 1, 1 / Math.sin(BEAM_PITCH));
  return disc;
}

// ── 상어 ────────────────────────────────────────────

const SHARK_BACK = "#5d6f7d";
const SHARK_BELLY = "#e4e2d8";
const SHARK_FIN = "#4d5f6c";

/** 지느러미 하나. 원뿔을 한쪽으로 납작하게 눌러 세운다. */
function fin(radius: number, height: number, flatten: number): BufferGeometry {
  const cone = new ConeGeometry(radius, height, 4, 1);
  cone.scale(flatten, 1, 1);
  return cone;
}

/**
 * 상어 몸통. 앞이 -Z 다.
 *
 * 등만 회색이고 배는 흰 **두 톤**이다. 물속에서 실루엣만 보이는 물건이라 톤이
 * 하나면 그냥 검은 덩어리로 보인다 — 물 위에서 내려다볼 때 배의 흰색이
 * 살짝 비치는 게 "물고기가 있다" 는 인상을 만든다.
 */
export function buildSharkBody(): BufferGeometry {
  return mergeColored([
    {
      geometry: new SphereGeometry(1, 18, 12),
      color: SHARK_BACK,
      scale: [0.44, 0.5, 1.55],
    },
    {
      geometry: new SphereGeometry(1, 16, 10),
      color: SHARK_BELLY,
      scale: [0.37, 0.35, 1.36],
      position: [0, -0.22, 0.06],
    },
    // 주둥이. 원뿔의 +Y 축을 -Z 로 눕힌다.
    {
      geometry: new ConeGeometry(0.42, 1.15, 14),
      color: SHARK_BACK,
      rotation: [-Math.PI / 2, 0, 0],
      position: [0, -0.03, -1.85],
    },
    // 등지느러미. 물 밖으로 나오는 건 이것뿐이다.
    {
      geometry: fin(0.44, 0.98, 0.26),
      color: SHARK_FIN,
      rotation: [0.34, 0, 0],
      position: [0, 0.72, 0.18],
    },
    // 뒷등지느러미. 작은 것 하나가 더 있어야 상어 실루엣이 완성된다.
    {
      geometry: fin(0.22, 0.42, 0.28),
      color: SHARK_FIN,
      rotation: [0.4, 0, 0],
      position: [0, 0.42, 1.15],
    },
    // 가슴지느러미 둘. 옆으로 뻗어 뒤로 눕는다.
    ...[-1, 1].map((side) => ({
      geometry: fin(0.44, 1.05, 0.32),
      color: SHARK_FIN,
      rotation: [0.26, 0, (side * Math.PI) / 2.35] as const,
      position: [side * 0.36, -0.24, -0.46] as const,
    })),
    // 눈.
    ...[-1, 1].map((side) => ({
      geometry: new SphereGeometry(0.085, 8, 6),
      color: "#1b2229",
      position: [side * 0.3, 0.1, -1.26] as const,
    })),
    // 아가미. 얇은 선 다섯이 옆구리에 있으면 덩어리가 생물이 된다.
    ...[-1, 1].flatMap((side) =>
      [0, 1, 2, 3, 4].map((i) => ({
        geometry: new SphereGeometry(0.03, 5, 4),
        color: "#44545f",
        scale: [1, 4.5, 1] as const,
        position: [side * 0.4, 0.02, -0.85 + i * 0.16] as const,
      })),
    ),
  ]);
}

/**
 * 꼬리. 몸통과 따로 굽는 이유는 **흔들어야** 하기 때문이다.
 * 통째로 병합하면 상어가 물속을 미끄러지는 판때기가 된다.
 */
export function buildSharkTail(): BufferGeometry {
  return mergeColored([
    // 꼬리자루.
    {
      geometry: new SphereGeometry(1, 12, 8),
      color: SHARK_BACK,
      scale: [0.17, 0.22, 0.52],
      position: [0, 0, 0.35],
    },
    // 위 갈래가 크고 아래가 작다. 이 비대칭이 상어 꼬리다.
    {
      geometry: fin(0.5, 1.26, 0.22),
      color: SHARK_FIN,
      rotation: [1.05, 0, 0],
      position: [0, 0.35, 0.96],
    },
    {
      geometry: fin(0.33, 0.76, 0.22),
      color: SHARK_FIN,
      rotation: [2.25, 0, 0],
      position: [0, -0.25, 0.88],
    },
  ]);
}

/** 몸통 기준 꼬리가 붙는 자리(m). */
export const SHARK_TAIL_JOINT = 1.3;

// ── 물고기 ──────────────────────────────────────────

/**
 * 물고기 한 마리. 앞이 -Z, 길이 약 1m.
 *
 * 튀어오를 때 잠깐 보이는 게 전부라 얼굴까지 만들 이유는 없다 — 다만 **꼬리가
 * 갈라져 있어야** 한다. 갈라진 꼬리 하나로 방향과 종류가 다 읽힌다.
 */
export function buildFish(): BufferGeometry {
  const BACK = "#4f86b0";
  const BELLY = "#eaf2f6";
  const FINS = "#7fb7d4";

  return mergeColored([
    {
      geometry: new SphereGeometry(1, 16, 12),
      color: BACK,
      scale: [0.23, 0.33, 0.6],
    },
    {
      geometry: new SphereGeometry(1, 14, 10),
      color: BELLY,
      scale: [0.19, 0.2, 0.52],
      position: [0, -0.14, 0.02],
    },
    // 주둥이.
    {
      geometry: new ConeGeometry(0.2, 0.34, 10),
      color: BACK,
      rotation: [-Math.PI / 2, 0, 0],
      position: [0, 0, -0.68],
    },
    // 갈라진 꼬리 — 위아래 두 갈래.
    ...[1, -1].map((side) => ({
      geometry: fin(0.24, 0.62, 0.18),
      color: FINS,
      rotation: [side > 0 ? 1.05 : 2.09, 0, 0] as const,
      position: [0, side * 0.19, 0.72] as const,
    })),
    // 등지느러미.
    {
      geometry: fin(0.22, 0.4, 0.2),
      color: FINS,
      rotation: [0.4, 0, 0],
      position: [0, 0.31, 0.06],
    },
    // 가슴지느러미.
    ...[-1, 1].map((side) => ({
      geometry: fin(0.18, 0.36, 0.28),
      color: FINS,
      rotation: [0.2, 0, (side * Math.PI) / 2.2] as const,
      position: [side * 0.19, -0.08, -0.16] as const,
    })),
    ...[-1, 1].map((side) => ({
      geometry: new SphereGeometry(0.05, 8, 6),
      color: "#17242c",
      position: [side * 0.16, 0.09, -0.5] as const,
    })),
  ]);
}

/**
 * 물 아래를 지나가는 무리.
 *
 * ⚠ 이 세계의 물은 투명하다. 그래서 수면 아래는 **비어 있으면 비어 보인다** —
 *   지느러미만 떠다니던 상어가 그 증거다. 무리를 하나 깔아두면 물속이
 *   비어 있지 않다는 걸 계속 알려준다.
 *
 * 일곱 마리를 하나로 굽는다. 각자 헤엄치게 하려면 메시가 일곱 개가 되는데,
 * 물 아래 3m 에서 흐릿하게 보이는 것들에 드로우콜 일곱을 쓸 이유가 없다.
 */
export function buildSchool(): BufferGeometry {
  const spots: readonly (readonly [number, number, number, number])[] = [
    [0, 0, 0, 0],
    [1.1, -0.3, 1.4, 0.12],
    [-1.25, 0.2, 1.1, -0.1],
    [0.4, 0.55, 2.5, 0.06],
    [-0.7, -0.5, 2.7, -0.05],
    [1.8, 0.3, 3.4, 0.15],
    [-1.9, -0.15, 3.6, -0.14],
  ];

  /**
   * ⚠ mergeColored 를 다시 쓸 수 없다. 그건 조각 하나에 색 하나를 굽는 함수라,
   *   이미 여러 색이 구워진 물고기를 넘기면 **한 색으로 덮어써** 파란 덩어리가
   *   일곱 개 나온다. 색은 그대로 두고 자리만 옮겨야 하므로 직접 합친다.
   */
  const fish = buildFish();
  const copies = spots.map(([x, y, z, yaw]) => {
    const copy = fish.clone();
    copy.scale(0.42, 0.42, 0.42);
    copy.rotateY(yaw);
    copy.translate(x, y, z);
    return copy;
  });
  fish.dispose();

  const merged = mergeGeometries(copies, false);
  for (const copy of copies) copy.dispose();
  if (merged === null) throw new Error("물고기 무리 병합 실패");
  return merged;
}

// ── 저 멀리 섬 ──────────────────────────────────────

/**
 * 수평선 위의 섬.
 *
 * ── 왜 이렇게 크고 멀리 있나 ──
 * 곡률이 거리 제곱으로 세계를 접어 내린다(0.0013). 170m 밖이면 **바다가 이미
 * 38m 아래로 내려가 있다** — 그래서 저 멀리 섬은 그만큼 높지 않으면 아예 안 보인다.
 * 실제 바다에서 먼 섬이 봉우리만 보이는 것과 같은 이치이고, 여기서는 그게
 * 셰이더 한 줄로 자동으로 일어난다.
 *
 * 색은 파랗게 죽인다. 안개는 280m 부터라 여기까지 안 오지만, 멀리 있는 것이
 * 푸르고 흐려 보이는 건 공기 때문이라 **색으로 흉내내는 게 정확하다.**
 * 능선을 셋으로 겹치는 것도 같은 이유다 — 겹치는 실루엣이 깊이를 만든다.
 */
export function buildFarIsland(scale: number): BufferGeometry {
  /**
   * ⚠ 한 번 어둡게 잡았다가 밝혔다. 175m 는 안개(280m)가 닿지 않는 거리라
   *   셰이더가 흐려주지 않는데, 진한 색으로 두면 **가까운 바위섬**처럼 또렷하게
   *   서 있다. 멀리 있는 것이 푸옇게 보이는 건 공기 때문이니, 그 몫을 색으로
   *   직접 갚아야 한다 — 하늘색에 가까울수록 멀어 보인다.
   */
  const NEAR_RIDGE = "#93b2c6";
  const MID_RIDGE = "#a1bdd0";
  const FAR_RIDGE = "#aecad9";

  return mergeColored([
    // 가장 큰 능선.
    {
      geometry: new SphereGeometry(1, 20, 12),
      color: MID_RIDGE,
      scale: [30 * scale, 19 * scale, 22 * scale],
    },
    // 옆으로 뻗은 낮은 자락.
    {
      geometry: new SphereGeometry(1, 18, 10),
      color: NEAR_RIDGE,
      scale: [22 * scale, 11 * scale, 16 * scale],
      position: [24 * scale, -1 * scale, 4 * scale],
    },
    {
      geometry: new SphereGeometry(1, 16, 10),
      color: NEAR_RIDGE,
      scale: [15 * scale, 8 * scale, 13 * scale],
      position: [-26 * scale, -2 * scale, 2 * scale],
    },
    // 뒤로 물러난 봉우리. 하나가 솟아야 섬이 덩어리가 아니라 지형으로 읽힌다.
    {
      geometry: new ConeGeometry(1, 1, 9),
      color: FAR_RIDGE,
      scale: [13 * scale, 26 * scale, 13 * scale],
      position: [-9 * scale, 10 * scale, -7 * scale],
    },
    {
      geometry: new ConeGeometry(1, 1, 8),
      color: FAR_RIDGE,
      scale: [9 * scale, 17 * scale, 9 * scale],
      position: [10 * scale, 7 * scale, -5 * scale],
    },
  ]);
}
