import {
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  ExtrudeGeometry,
  IcosahedronGeometry,
  LinearFilter,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
} from "three";
import { mergeColored, type Piece } from "@/game/world/meshKit";

/**
 * cgoing-bot 의 몸.
 *
 * ── 왜 사람 모양이 아닌가 ──
 * 사람 모양으로 두면 접속자 중 하나로 보인다. 안내를 맡은 존재는 **한눈에 다르게**
 * 생겨야 말을 걸어볼 마음이 생긴다. 다리를 없애고 공중에 띄운 게 그 신호다 —
 * 걸어다니는 것들 사이에서 혼자 떠 있으면 저게 사람이 아니라는 게 즉시 읽힌다.
 *
 * 몸통은 둥근 캡슐, 머리는 다면체(로봇 느낌), 얼굴은 화면이다.
 * 팔 대신 몸 옆에 떠 있는 구슬 둘 — 붙어 있지 않아서 더 기계처럼 보인다.
 */

const SHELL = "#e8ecf2";
const SHELL_DARK = "#aab6c4";
const ACCENT = "#e8734a";

/** 떠 있는 높이(m). 발이 땅에 안 닿는 게 이 디자인의 핵심이다. */
export const BOT_HOVER = 0.55;

/** 몸통·머리·고리. 얼굴(화면)과 구슬은 따로 움직여야 해서 뺀다. */
export function createBotBodyGeometry(): BufferGeometry {
  const pieces: Piece[] = [
    // 몸통 — 아래가 좁은 물방울. 바닥에 놓을 생각이 없는 형태다.
    {
      geometry: new SphereGeometry(0.42, 20, 16),
      color: SHELL,
      scale: [1, 1.15, 1],
      position: [0, BOT_HOVER + 0.42, 0],
    },
    {
      geometry: new SphereGeometry(0.2, 14, 10),
      color: SHELL_DARK,
      scale: [1, 0.7, 1],
      position: [0, BOT_HOVER - 0.02, 0],
    },
    // 머리 — 다면체. 둥근 몸통 위에 각진 머리가 얹히면 기계로 읽힌다.
    {
      geometry: new IcosahedronGeometry(0.34, 0),
      color: SHELL,
      rotation: [0.35, 0.6, 0],
      position: [0, BOT_HOVER + 1.12, 0],
    },
    // 안테나
    {
      geometry: new CylinderGeometry(0.018, 0.018, 0.34, 6),
      color: SHELL_DARK,
      position: [0, BOT_HOVER + 1.55, 0],
    },
    {
      geometry: new SphereGeometry(0.075, 10, 8),
      color: ACCENT,
      position: [0, BOT_HOVER + 1.74, 0],
    },
  ];
  return mergeColored(pieces);
}

/** 몸 주위를 도는 고리. 따로 돌려야 해서 별도 메시다. */
export function createBotRingGeometry(): BufferGeometry {
  return mergeColored([
    {
      geometry: new TorusGeometry(0.62, 0.035, 8, 28),
      color: ACCENT,
      rotation: [Math.PI / 2 - 0.28, 0, 0],
      position: [0, 0, 0],
    },
  ]);
}

/** 팔 대신 떠 있는 구슬 하나. 좌우에 하나씩 쓴다. */
export function createBotOrbGeometry(): BufferGeometry {
  return mergeColored([
    {
      geometry: new BoxGeometry(0.17, 0.17, 0.17),
      color: SHELL,
      rotation: [0.4, 0.4, 0],
      position: [0, 0, 0],
    },
  ]);
}

/**
 * 봇 머리 위에 떠 있는 **클릭 유도 커서.**
 *
 * ── 왜 필요한가 ──
 * 봇 이름표는 눌러야 뭔가 나오는 버튼인데, 화면에 그냥 놓여 있으면 그게 버튼인 줄
 * 모른다. 여긴 게임이라 "여기를 누르세요" 라고 글로 쓰기도 뭣하다.
 * 마우스 커서를 3D 로 띄워두면 설명 없이도 눌러야 한다는 게 읽힌다 —
 * 커서는 누구나 아는 도상이다.
 *
 * ── 왜 평면 도형인가 ──
 * 카메라 방위가 고정이라(늘 북쪽을 본다) XY 평면에 누운 도형은 항상 정면을 향한다.
 * 빌보드 계산이 필요 없고, 살짝 두께를 주면 입체감도 같이 나온다.
 *
 * 짙은 판을 조금 크게 깔고 밝은 판을 그 위에 얹어 **테두리**를 만든다.
 * 섬의 UI 가 전부 굵은 테두리로 되어 있어서, 커서만 밋밋하면 겉돈다.
 */
export function createBotCursorGeometry(): BufferGeometry {
  // 고전 마우스 포인터. (0,0)이 뾰족한 끝이고 아래로 내려간다.
  const outline: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [0, -1],
    [0.26, -0.74],
    [0.43, -1.06],
    [0.6, -0.98],
    [0.43, -0.66],
    [0.74, -0.62],
  ];

  const shape = new Shape();
  const [first, ...rest] = outline;
  shape.moveTo(first?.[0] ?? 0, first?.[1] ?? 0);
  for (const [x, y] of rest) shape.lineTo(x, y);
  shape.closePath();

  const extrude = { depth: 0.09, bevelEnabled: false } as const;

  return mergeColored([
    // 테두리용 짙은 판. 뾰족한 끝을 기준으로 키워야 촉이 안 뭉툭해진다.
    {
      geometry: new ExtrudeGeometry(shape, extrude),
      color: "#3a2a22",
      scale: [1.22, 1.22, 1],
      position: [0, 0, -0.05],
    },
    {
      geometry: new ExtrudeGeometry(shape, extrude),
      color: "#fdf6e8",
    },
  ]);
}

/** 커서 아래에서 퍼지는 클릭 파문. 크기와 투명도는 매 프레임 바뀐다. */
export function createBotCursorRingGeometry(): BufferGeometry {
  return mergeColored([
    {
      geometry: new TorusGeometry(0.34, 0.045, 8, 24),
      color: "#ffd166",
    },
  ]);
}

/**
 * 얼굴 화면.
 *
 * 눈·입을 메시로 붙이면 조각이 늘고, 무엇보다 표정을 바꿀 수가 없다.
 * 캔버스에 그려 텍스처로 붙이면 드로우콜 하나에 들어가고 표정도 갈아끼울 수 있다.
 */
export function createBotFaceTexture(): CanvasTexture {
  const W = 128;
  const H = 96;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    ctx.fillStyle = "#141a24";
    ctx.fillRect(0, 0, W, H);

    // 눈 둘. 가로로 긴 타원이라 표정이 순해 보인다.
    ctx.fillStyle = "#7fe3ff";
    for (const cx of [40, 88]) {
      ctx.beginPath();
      ctx.ellipse(cx, 40, 13, 15, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 눈 안의 하이라이트. 이게 있어야 화면이 아니라 눈으로 보인다.
    ctx.fillStyle = "#ffffff";
    for (const cx of [45, 93]) {
      ctx.beginPath();
      ctx.arc(cx, 35, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // 입 — 짧은 호 하나.
    ctx.strokeStyle = "#7fe3ff";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(64, 60, 14, 0.25 * Math.PI, 0.75 * Math.PI);
    ctx.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}
