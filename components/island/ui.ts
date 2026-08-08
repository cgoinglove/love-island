/**
 * 섬의 UI 언어.
 *
 * ── 왜 바꿨나 ──
 * 화면은 게임인데 UI 만 웹사이트였다. 어두운 반투명 유리판 · 얇은 1px 테두리 ·
 * 작은 모노스페이스 글씨는 개발자 포트폴리오 사이트의 문법이고, 그게 3D 섬 위에
 * 얹히니 "게임 위에 웹페이지를 띄운" 느낌이 났다.
 *
 * ── 무엇으로 바꿨나 ──
 * 세계와 같은 재료를 쓴다. 섬의 나무 · 종이 · 산호색을 그대로 가져오고,
 * 게임 UI 의 문법 셋을 지킨다:
 *
 *  1. **두꺼운 아랫단** — 버튼 아래에 짙은 테두리 4px. 누르면 그만큼 내려앉는다.
 *     이 하나가 "클릭 가능한 div"를 "눌리는 물건"으로 바꾼다.
 *  2. **짙은 외곽선** — 밝은 하늘·잔디 위에서도 형태가 끊기지 않게.
 *     반투명 유리는 배경이 밝으면 사라진다.
 *  3. **꽉 찬 색** — 블러 대신 불투명. 반투명은 웹의 문법이고, 게임 UI 는
 *     화면 위에 놓인 물건이라 뒤가 비치지 않는다.
 *
 * 여기 문자열을 각 파일에 베껴 적지 않는다 — 한 곳만 고쳐도 전부 따라오게 한다.
 */

/** 종이 · 나무 · 산호. 3D 오브젝트에서 쓰는 색과 같은 값이다. */
export const ISLAND_COLORS = {
  paper: "#fdf6e8",
  paperEdge: "#d9c9a8",
  cork: "#d3a973",
  woodDark: "#4a3428",
  wood: "#7d5836",
  ink: "#3a2a22",
  inkSoft: "#7a6455",
  coral: "#e8734a",
  coralDark: "#b8512c",
  leaf: "#5e9c55",
  sea: "#2a7fa8",
} as const;

/**
 * 눌리는 버튼.
 *
 * 한때 아랫단 테두리 4px 로 "두께"를 만들었는데, 색이 다른 띠가 아래에 깔리니
 * 그림자인지 테두리인지 애매했고 모서리에서 어긋나 보였다. 두께는 빼고
 * 누를 때 살짝 내려앉는 것만 남긴다 — 반응은 그대로고 형태는 깔끔하다.
 */
export const CHUNKY =
  "active:translate-y-[1.5px] active:brightness-95 transition-[transform,filter] duration-75";

/** 크림색 나무 팻말 — 안내판·버튼의 기본형. */
export const SIGN =
  "rounded-2xl bg-[#fdf6e8] text-[#3a2a22] ring-2 ring-[#4a3428] shadow-[0_8px_18px_-8px_rgba(0,0,0,0.45)]";

/** 강조 팻말 — 지금 할 수 있는 행동. */
export const SIGN_ACCENT =
  "rounded-2xl bg-[#e8734a] text-[#fff6ef] ring-2 ring-[#4a3428] shadow-[0_8px_18px_-8px_rgba(0,0,0,0.45)]";

/**
 * 도형 **합집합**에 걸리는 윤곽선.
 *
 * 말풍선처럼 몸통 + 꼬리로 이루어진 모양은 각 조각에 ring 을 주면 둘이 맞닿는
 * 자리에 선이 가로질러 남는다 — 꼬리 밑동이 깨져 보이던 게 그것이다.
 * drop-shadow 를 사방으로 겹치면 **합쳐진 실루엣의 바깥**만 칠해지므로 이음매가 없다.
 * 조각들에는 ring 을 주지 않고 이 클래스를 감싸는 요소에만 준다.
 */
export const OUTLINE =
  "[filter:drop-shadow(2px_0_0_#4a3428)_drop-shadow(-2px_0_0_#4a3428)_drop-shadow(0_2px_0_#4a3428)_drop-shadow(0_-2px_0_#4a3428)_drop-shadow(1.4px_1.4px_0_#4a3428)_drop-shadow(-1.4px_1.4px_0_#4a3428)_drop-shadow(1.4px_-1.4px_0_#4a3428)_drop-shadow(-1.4px_-1.4px_0_#4a3428)]";

/** 나무 패널 — 큰 창의 몸통. */
export const WOOD_PANEL =
  "bg-[#fdf6e8] ring-[3px] ring-[#4a3428] shadow-[0_30px_70px_-20px_rgba(0,0,0,0.6)]";

/** 패널 머리띠 — 나무 결 색. */
export const WOOD_HEADER = "bg-[#7d5836] text-[#fdf6e8]";

/** 화면을 덮는 백드롭. 게임에서 창을 열면 뒤가 어두워지고 살짝 따뜻해진다. */
export const BACKDROP = "bg-[#2a1c14]/55";
