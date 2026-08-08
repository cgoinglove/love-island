import { BoxGeometry, type BufferGeometry, CylinderGeometry } from "three";
import { mergeColored, type Piece } from "@/game/world/meshKit";

/**
 * 방명록 게시판의 지오메트리.
 *
 * 판·틀·다리·포스트잇을 전부 한 덩어리로 굽는다. 조각으로 두면 포스트잇만
 * 드로우콜 36개였다 — 화면에 보이는 건 판 하나인데.
 */

/** 판 크기(m). 스폰에서 봤을 때 "저기 뭔가 붙어 있다"가 읽혀야 하는 크기다. */
export const BOARD_WIDTH = 4.2;
export const BOARD_HEIGHT = 2.5;
/** 판 아랫변의 지면 높이. 다리 길이이기도 하다. */
export const BOARD_BOTTOM = 1.15;

const CORK = "#c99a63";
const FRAME = "#6f4a2c";
const POST = "#8a6440";
const HEADER = "#e8734a";

const NOTE_COLORS = [
  "#ffe066",
  "#ff9fb2",
  "#8ce0c0",
  "#9fc8ff",
  "#ffc48c",
  "#e3b8ff",
];

/** 판 한가운데를 원점으로 잡는다. 붙이는 위치를 전부 여기 기준으로 적을 수 있다. */
const CENTER_Y = BOARD_BOTTOM + BOARD_HEIGHT / 2;

/**
 * 고정 시드 난수.
 *
 * 포스트잇 자리는 매번 같아야 한다 — 다시 들어올 때마다 배치가 바뀌면
 * "누가 와서 다시 붙였나" 싶은 게 아니라 그냥 화면이 불안해 보인다.
 */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * 포스트잇.
 *
 * 격자로 붙이면 스프레드시트고, 완전 무작위면 쓰레기다. 격자에서 조금씩 흔들어
 * 붙이는 게 "여러 사람이 각자 와서 붙이고 갔다"로 읽힌다. 빈칸을 남기는 것도 같은 이유다 —
 * 꽉 차 있으면 더 붙일 데가 없어 보인다.
 */
function noteePieces(random: () => number): Piece[] {
  const pieces: Piece[] = [];
  const cols = 4;
  const rows = 3;
  const cellW = (BOARD_WIDTH - 0.8) / cols;
  const cellH = (BOARD_HEIGHT - 0.95) / rows;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (random() < 0.18) continue;

      const size = 0.5 + random() * 0.12;
      const tilt = (random() - 0.5) * 0.34;
      const x = (col - (cols - 1) / 2) * cellW + (random() - 0.5) * 0.14;
      // 위쪽 머리띠를 피해 조금 내려 붙인다.
      const y = ((rows - 1) / 2 - row) * cellH + (random() - 0.5) * 0.1 - 0.2;
      const color = NOTE_COLORS[Math.floor(random() * NOTE_COLORS.length)];

      pieces.push({
        geometry: new BoxGeometry(size, size, 0.014),
        color: color ?? "#ffe066",
        rotation: [0, 0, tilt],
        position: [x, CENTER_Y + y, 0.072],
      });

      // 글씨 대신 줄 두 개. 이 거리에서 글자는 어차피 안 읽힌다.
      for (const offset of [0.09, -0.02]) {
        pieces.push({
          geometry: new BoxGeometry(size * 0.6, 0.03, 0.004),
          color: "#7a6a4a",
          rotation: [0, 0, tilt],
          position: [
            x - Math.sin(tilt) * offset,
            CENTER_Y + y + Math.cos(tilt) * offset,
            0.081,
          ],
        });
      }
    }
  }
  return pieces;
}

export function createBoardGeometry(): BufferGeometry {
  const random = seeded(0x2f6e2b1);

  const pieces: Piece[] = [
    // 다리 둘. 판을 땅에 그냥 세우면 간판이지 게시판이 아니다.
    ...[-1, 1].map<Piece>((side) => ({
      geometry: new CylinderGeometry(0.09, 0.11, BOARD_BOTTOM + 0.2, 8),
      color: POST,
      position: [side * (BOARD_WIDTH / 2 - 0.2), BOARD_BOTTOM / 2, -0.07],
    })),

    // 코르크 판
    {
      geometry: new BoxGeometry(BOARD_WIDTH, BOARD_HEIGHT, 0.12),
      color: CORK,
      position: [0, CENTER_Y, 0],
    },

    // 테두리 네 짝. 액자가 있어야 "판때기"가 아니라 "게시판"이 된다.
    {
      geometry: new BoxGeometry(BOARD_WIDTH + 0.24, 0.19, 0.2),
      color: FRAME,
      position: [0, CENTER_Y + BOARD_HEIGHT / 2 + 0.09, 0],
    },
    {
      geometry: new BoxGeometry(BOARD_WIDTH + 0.24, 0.19, 0.2),
      color: FRAME,
      position: [0, CENTER_Y - BOARD_HEIGHT / 2 - 0.09, 0],
    },
    {
      geometry: new BoxGeometry(0.19, BOARD_HEIGHT + 0.38, 0.2),
      color: FRAME,
      position: [-BOARD_WIDTH / 2 - 0.09, CENTER_Y, 0],
    },
    {
      geometry: new BoxGeometry(0.19, BOARD_HEIGHT + 0.38, 0.2),
      color: FRAME,
      position: [BOARD_WIDTH / 2 + 0.09, CENTER_Y, 0],
    },

    // 머리띠. 여기가 무슨 판인지 멀리서도 구분되게 하는 색 한 줄.
    {
      geometry: new BoxGeometry(BOARD_WIDTH - 0.45, 0.32, 0.04),
      color: HEADER,
      position: [0, CENTER_Y + BOARD_HEIGHT / 2 - 0.3, 0.07],
    },

    ...noteePieces(random),
  ];

  return mergeColored(pieces);
}
