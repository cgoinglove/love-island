import {
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  LinearFilter,
  SRGBColorSpace,
  TorusGeometry,
} from "three";
import { mergeColored, type Piece } from "@/game/world/meshKit";

/**
 * 경력 오브젝트 — 책상 위의 노트북.
 *
 * 나무 부분과 금속 부분은 재질이 달라 한 덩어리로 못 묶는다. 그래서 딱 셋으로 나눈다:
 * 책상(나무·소품) · 노트북 몸체(금속) · 화면(발광). 드로우콜 셋이면 충분하다.
 */

export const DESK_TOP = 0.78;
const DESK_WIDTH = 1.9;
const DESK_DEPTH = 1.0;

const WOOD = "#b9834e";
const WOOD_DARK = "#7d5836";
const ALUMINUM = "#d5d8dc";

/**
 * 뚜껑이 **수직에서 뒤로 젖혀진** 각도(라디안).
 *
 * ⚠ "열린 각도"가 아니다. 뚜껑 지오메트리는 이미 경첩에서 +Y 로 서 있는 상태로
 *   구워지므로, 여기에 노트북의 열림각(≈110°)을 그대로 주면 뚜껑이 뒤로 넘어가
 *   책상 뒤에 드러눕는다. 실제로 그렇게 나왔다. 필요한 건 18° 정도의 기울임뿐이다.
 */
export const LID_ANGLE = -0.32;
export const LID_WIDTH = 0.74;
export const LID_HEIGHT = 0.5;
/** 경첩 위치. 뚜껑과 화면이 같은 축으로 돌아야 붙어 있어 보인다. */
export const HINGE = { y: DESK_TOP + 0.057, z: -0.24 } as const;

/** 책상 · 머그 · 공책. 전부 나무 계열이라 한 덩어리로 굽는다. */
export function createDeskGeometry(): BufferGeometry {
  const pieces: Piece[] = [
    // 상판
    {
      geometry: new BoxGeometry(DESK_WIDTH, 0.07, DESK_DEPTH),
      color: WOOD,
      position: [0, DESK_TOP, 0],
    },

    // 다리 넷
    ...(
      [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const
    ).map<Piece>(([sx, sz]) => ({
      geometry: new CylinderGeometry(0.045, 0.038, DESK_TOP, 8),
      color: WOOD_DARK,
      position: [
        sx * (DESK_WIDTH / 2 - 0.11),
        DESK_TOP / 2,
        sz * (DESK_DEPTH / 2 - 0.11),
      ],
    })),

    // 다리 사이 가로대. 없으면 책상이 흔들려 보인다.
    {
      geometry: new BoxGeometry(DESK_WIDTH - 0.3, 0.045, 0.045),
      color: WOOD_DARK,
      position: [0, 0.22, 0],
    },

    // 머그컵. 자리에 사람이 있었다는 표시다.
    {
      geometry: new CylinderGeometry(0.055, 0.048, 0.1, 12),
      color: "#e8734a",
      position: [0.62, DESK_TOP + 0.085, 0.24],
    },
    {
      geometry: new TorusGeometry(0.032, 0.011, 6, 12),
      color: "#e8734a",
      rotation: [Math.PI / 2, 0, 0],
      position: [0.692, DESK_TOP + 0.085, 0.24],
    },

    // 공책 한 권
    {
      geometry: new BoxGeometry(0.26, 0.03, 0.34),
      color: "#f3ede0",
      rotation: [0, 0.3, 0],
      position: [-0.66, DESK_TOP + 0.05, 0.2],
    },
  ];

  return mergeColored(pieces);
}

/**
 * 노트북 몸체 — 알루미늄. 뚜껑은 경첩을 원점에 두고 굽는다.
 *
 * 그래야 쓰는 쪽에서 그룹 하나를 LID_ANGLE 만큼 돌리는 것으로 여닫힘이 표현된다.
 */
export function createLaptopBodyGeometry(): BufferGeometry {
  return mergeColored([
    // 아래 판. 모서리를 둥글게 못 하니 아주 얇게 만들어 대신한다.
    {
      geometry: new BoxGeometry(LID_WIDTH, 0.022, 0.52),
      color: ALUMINUM,
      position: [0, DESK_TOP + 0.046, 0.02],
    },
    // 키보드 자리
    {
      geometry: new BoxGeometry(LID_WIDTH - 0.1, 0.005, 0.3),
      color: "#2b2e33",
      position: [0, DESK_TOP + 0.058, 0.06],
    },
    // 트랙패드
    {
      geometry: new BoxGeometry(0.2, 0.005, 0.13),
      color: "#b9bdc2",
      position: [0, DESK_TOP + 0.058, 0.23],
    },
  ]);
}

/** 뚜껑 바깥면. 경첩이 원점이라 쓰는 쪽에서 그대로 회전시킬 수 있다. */
export function createLidGeometry(): BufferGeometry {
  return mergeColored([
    {
      geometry: new BoxGeometry(LID_WIDTH, LID_HEIGHT, 0.018),
      color: ALUMINUM,
      position: [0, LID_HEIGHT / 2, 0],
    },
  ]);
}

/**
 * 켜져 있는 화면.
 *
 * 코드 줄을 작은 메시로 하나씩 놓다가 그것만 드로우콜 다섯이 됐다. 캔버스에 한 번
 * 그려서 텍스처로 붙이면 드로우콜 하나에 들어가고, 덤으로 줄 수를 늘리거나
 * 들여쓰기를 주는 것도 공짜다 — 실제 에디터처럼 보이는 건 그 불규칙함이다.
 */
export function createScreenTexture(): CanvasTexture {
  const W = 256;
  const H = 176;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, W, H);

    // 창 위쪽의 탭 바. 이 한 줄이 "화면"을 "에디터 화면"으로 만든다.
    ctx.fillStyle = "#161b22";
    ctx.fillRect(0, 0, W, 16);
    ctx.fillStyle = "#30363d";
    ctx.fillRect(8, 5, 52, 6);

    // 들여쓰기와 길이가 제각각인 색 막대 = 코드. 실제 글자는 이 크기에서 안 읽힌다.
    const lines: ReadonlyArray<
      readonly [indent: number, width: number, color: string]
    > = [
      [0, 92, "#ff7b72"],
      [12, 118, "#79c0ff"],
      [24, 70, "#d2a8ff"],
      [24, 132, "#a5d6ff"],
      [12, 54, "#79c0ff"],
      [0, 100, "#7ee787"],
      [12, 140, "#a5d6ff"],
      [24, 62, "#ffa657"],
      [12, 86, "#d2a8ff"],
      [0, 48, "#8b949e"],
    ];

    lines.forEach((line, index) => {
      const [indent, width, color] = line;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.92;
      ctx.fillRect(12 + indent, 28 + index * 14, width, 6);
    });
    ctx.globalAlpha = 1;

    // 커서 한 칸. 깜빡이진 않지만 "쓰다 만 자리"가 생긴다.
    ctx.fillStyle = "#e6edf3";
    ctx.fillRect(12 + 12 + 88, 28 + 8 * 14 - 2, 2, 10);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  // 화면은 비스듬히 보이므로 확대 시 픽셀이 뭉개지는 편이 낫다.
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}
