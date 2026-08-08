import type { GridSpec, RoomId } from "./types";

/**
 * ─────────────────────────────────────────────────────────────
 *  단위 규약 (프로젝트 전체 불변. 여기를 바꾸면 전부 바뀐다)
 * ─────────────────────────────────────────────────────────────
 *  길이 : 1 three 유닛 = 1 미터
 *  축   : +Y 위, -Z 북쪽, +X 동쪽 (오른손 좌표계)
 *  회전 : 라디안. Y축 오일러(yaw) 하나만 쓴다. 캐릭터의 로컬 전방은 -Z
 *  시간 : 초(부동소수). 네트워크 타임스탬프만 밀리초 정수
 *  해수면: y = 0. 이 아래는 전부 바다다
 * ─────────────────────────────────────────────────────────────
 */

export const OWNER_NAME = "cgoing";
export const SITE_NAME = "러브 아일랜드";
export const SITE_TAGLINE = `${OWNER_NAME}의 섬`;
export const SITE_DESCRIPTION = `메뉴 없는 섬. 걸어다니며 ${OWNER_NAME} 를 알아가고 흔적을 남기고 가세요.`;

/** 시뮬레이션 고정 스텝. 이동·충돌은 프레임레이트와 무관하게 항상 이 간격으로 돈다. */
export const FIXED_DT = 1 / 60;

/**
 * 한 프레임에 누산기로 들어갈 수 있는 최대 delta.
 * 탭을 백그라운드에 뒀다 돌아오면 delta 가 수십 초로 튀는데,
 * 클램프가 없으면 그 자리에서 수천 번 stepSimulation 을 돌다 브라우저가 멈춘다.
 */
export const MAX_FRAME_DELTA = 0.25;

/**
 * 네비게이션 그리드. 섬(반지름 ~26m)을 넉넉히 감싸는 80m x 80m 영역.
 * 0.5m 칸이면 캐릭터(반지름 0.35m)가 나무 사이를 지나갈 수 있는지 판정하기에 충분하다.
 */
/**
 * 섬 전체를 덮는 통행 격자.
 *
 * ⚠ 반지름이 ISLAND_BASE_RADIUS(34)여도 하모닉이 최대 +21% 라 해안선은 41m 까지 나간다.
 *   격자가 그보다 좁으면 섬 가장자리가 통째로 "갈 수 없는 곳"이 되고,
 *   거기 놓인 오브젝트는 영영 도달할 수 없어진다. 여유를 두고 ±50 으로 잡는다.
 */
export const ISLAND_GRID: GridSpec = {
  cols: 200,
  rows: 200,
  cellSize: 0.5,
  originX: -50,
  originZ: -50,
};

export const ROOM_ISLAND = "island" as RoomId;

/** 브라우저에 남기는 값들. presence 와 방명록이 같은 이름을 쓰게 하려고 shared 에 둔다. */
export const NICKNAME_STORAGE_KEY = "love-island:nickname";
/** 탭 하나당 하나. sessionStorage 라 탭을 새로 열면 다른 사람이 된다. */
export const PLAYER_ID_STORAGE_KEY = "love-island:player-id";

/**
 * 캐릭터 반지름(m).
 * 이동 충돌과 A* 경로 계획이 **같은 값**을 봐야 한다 —
 * 다르면 경로는 나오는데 몸이 못 지나가는 자리가 생긴다.
 */
export const PLAYER_RADIUS = 0.35;

/** 방명록 한 건의 길이 제한. DB 컬럼과 Zod 스키마가 이 숫자를 공유한다. */
export const NICKNAME_MAX = 20;
export const MESSAGE_MAX = 200;

/** 방명록 무한 스크롤 한 페이지 크기. */
export const GUESTBOOK_PAGE_SIZE = 12;

/** 채팅 한 줄의 길이 제한. 말풍선이 화면을 덮지 않을 만큼만. */
export const CHAT_MAX = 80;

/** 같은 IP 가 이 시간 안에 남길 수 있는 방명록 수. */
export const RATE_LIMIT_WINDOW_MINUTES = 10;
export const RATE_LIMIT_MAX_POSTS = 3;

/**
 * 성능 예산 (기획서 §8.1). 기준선: iPhone 12 / 갤럭시 A 에서 30fps.
 * 숫자를 코드에 박아둬야 PerfHud 가 빨갛게 변하면서 알려준다.
 */
export const PERF_BUDGET = {
  drawCalls: 150,
  triangles: 280_000,
  /** 텍스처 + 지오메트리 개수. GPU 메모리 누수 감지용 — 룸을 오가도 안 늘어나야 한다. */
  geometries: 200,
  textures: 60,
} as const;
