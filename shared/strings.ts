import { DEFAULT_LOCALE, type Locale } from "./i18n";

/**
 * 화면에 나오는 모든 문구.
 *
 * ── 왜 한 파일인가 ──
 * 문구를 컴포넌트 옆에 흩어두면 "영어에 뭐가 빠졌나"를 세는 방법이 없어진다.
 * 한곳에 모아 `en: Dict` 로 못박으면 **빠진 번역이 타입 에러**가 된다 —
 * 새 문구를 추가하고 영어를 안 적으면 빌드가 안 된다.
 *
 * ── 인자가 있는 문구는 함수다 ──
 * `"{n}명"` 같은 자리표시자를 문자열에 두면 순서가 다른 언어에서 깨진다.
 * 함수로 두면 각 언어가 어순을 알아서 정한다.
 */

const ko = {
  /** 섬 이름. 간판 · 배너 · 상태 바가 같은 값을 쓴다. */
  siteName: "러브 아일랜드",

  hud: {
    online: (n: number) => `${n}명`,
    chatOpen: "말 걸기",
    chatPlaceholder: "한 마디 하고 지나가기…",
    send: "보내기",
    reactions: { heart: "하트", firework: "폭죽", confetti: "축포" },
    shortcutsTitle: "조작법",
    shortcuts: [
      { key: "탭", action: "그 자리로 걸어가기" },
      { key: "WASD", action: "직접 이동" },
      { key: "Shift", action: "달리기" },
      { key: "Space", action: "점프 · 물에 뛰어들기" },
      { key: "F", action: "밀치기 — 물가에서는 빠뜨릴 수 있다" },
      { key: "E", action: "가까운 것과 상호작용" },
      { key: "Enter", action: "말 걸기" },
      { key: "1 2 3", action: "하트 · 폭죽 · 축포" },
      { key: "cgoing-bot", action: "안내 봇에게 말 걸기" },
      { key: "?", action: "이 목록" },
    ],
    shortcutsAria: "단축키",
    touchJump: "점프",
    touchShove: "밀기",
    close: "닫기",
  },

  panel: {
    back: "섬으로",
  },

  /**
   * 섬으로 들어가는 동안 뜨는 화면.
   *
   * ⚠ 이 문구만은 `t()` 로 읽으면 안 된다. 씬이 아직 안 뜬 시점이라 서버에서도
   *   그려지는데, 전역 언어를 서버에서 읽으면 요청끼리 섞일 수 있다.
   *   `stringsFor(locale)` 로 **언어를 손에 들고** 읽는다.
   */
  boarding: {
    title: "러브 아일랜드로 이동 중",
    subtitle: "잠시만 기다려주세요",
    tips: [
      "바닥을 탭하면 그리로 걸어갑니다.",
      "cgoing-bot 을 누르면 어디든 데려다 줍니다.",
      "섬 남쪽 끝에서 낚시를 할 수 있어요.",
      "밤이 되면 바다 위로 폭죽이 올라갑니다.",
      "1 · 2 · 3 을 누르면 하트와 폭죽이 터집니다.",
    ],
  },

  career: {
    label: "경력 및 프로젝트",
    /** 접속하는 동안 뜨는 한 줄. 뒤에 주소가 붙는다. */
    connecting: "접속 중",
    /** iframe 이 막혔을 때. 어느 브라우저인지는 우리가 알 수 없으니 담담하게 적는다. */
    blocked: "이 화면 안에서는 안 열리네요.",
    openNewTab: "새 탭에서 열기",
    retry: "다시 시도",
  },

  album: {
    label: "사진첩 보기",
    slug: "사진첩",
    title: "사진첩",
    count: (n: number) => `${n}장`,
  },

  guestbook: {
    label: "방명록 남기기",
    slug: "방명록 게시판",
    title: "방명록",
    subtitle: (n: number, more: boolean) =>
      n > 0
        ? `${n}${more ? "+" : ""}개의 쪽지 · 쓴 자리에 떨어집니다`
        : "쪽지는 지금 서 있는 자리에 떨어집니다",
    loading: "불러오는 중…",
    failed: "방명록을 불러오지 못했습니다.",
    emptyTitle: "아직 아무도 다녀가지 않았어요.",
    emptyHint: "첫 쪽지를 붙여주세요",
    loadingMore: "더 불러오는 중…",
    end: "여기까지예요",
    compose: "쪽지 붙이기",
    namePlaceholder: "이름",
    messagePlaceholder: "한 마디 남기고 가세요",
    cancel: "취소",
    submit: "쪽지 남기기",
    submitting: "남기는 중…",
    failedPost: "쪽지를 남기지 못했습니다.",
    recheck: "다시 확인해주세요.",
    at: (x: number, z: number) => `${x}, ${z} 에서`,
    justNow: "방금",
    minutesAgo: (n: number) => `${n}분 전`,
    hoursAgo: (n: number) => `${n}시간 전`,
    daysAgo: (n: number) => `${n}일 전`,
  },

  fishing: {
    label: "낚시하기",
    cast: "던지기 (Space)",
    casting: "던지는 중…",
    waiting: "기다리는 중… 찌를 보세요",
    fighting: "버틴다! 화면을 보세요",
    now: "지금! (Space)",
    missed: "놓쳤어요 — 다시 던지기",
    again: "한 번 더 (Space)",
    quit: "그만",
    blank: "꽝",
    /** 확률은 전리품표에서 계산해 넘긴다 — 숫자를 손으로 적으면 표와 어긋난다. */
    odds: (percent: string) => `${percent}% 확률로 아메리카노 쿠폰이 나옵니다.`,
    couponTitle: "당첨",
    couponHowTo: (contact: string) =>
      `이 화면을 캡처해서 ${contact} 으로 보내주세요. 진짜로 삽니다.`,
    catchables: {
      nothing: {
        name: "빈 낚싯줄",
        blurb: "아무것도 안 걸렸습니다. 이런 날도 있죠.",
      },
      boot: {
        name: "낡은 장화",
        blurb: "한 짝뿐입니다. 나머지 한 짝은 어디 갔을까요.",
      },
      seaweed: { name: "미역 한 줌", blurb: "국 끓이기엔 좀 모자랍니다." },
      can: {
        name: "찌그러진 캔",
        blurb: "누가 버린 걸까요. 주웠으니 치운 셈 칩시다.",
      },
      shell: {
        name: "조개껍데기",
        blurb: "귀에 대면 파도 소리가… 사실 여기가 바다입니다.",
      },
      rock: { name: "그냥 돌", blurb: "돌입니다. 정말 그냥 돌입니다." },
      iou: {
        name: "차용증",
        blurb: '"커피는 네가 사라" 라고 적혀 있습니다. 주인장 필체네요.',
      },
      americano: {
        name: "아메리카노 쿠폰",
        blurb: "주인장이 진짜로 삽니다. 이 화면을 캡처해서 보내세요.",
      },
    },
  },

  bot: {
    topics: {
      controls: {
        label: "조작법 알려줘",
        lines: [
          "바닥을 탭하면 그리로 걸어갑니다. WASD 도 됩니다.",
          "Shift 로 달리고, Space 로 뜁니다.",
          "가까이 가면 E 로 만질 수 있어요.",
          "1·2·3 은 하트·폭죽·축포입니다. 눌러보세요.",
        ],
      },
      career: {
        label: "이 섬 주인은?",
        lines: [
          "저 책상이 주인장 자리예요. 따라오세요.",
          "노트북을 열어보면 뭘 해왔는지 나옵니다.",
        ],
      },
      album: {
        label: "사진첩 보고 싶어",
        lines: [
          "사진은 저쪽 빨랫줄에 걸어뒀어요.",
          "따라오세요. 몇 장 안 되지만 다 직접 찍은 겁니다.",
        ],
      },
      fishing: {
        label: "낚시 얘기 좀",
        lines: [
          "섬 남쪽 끝 물가에 낚시터가 있어요. 데려다 드릴게요.",
          "가끔 진짜 커피 쿠폰이 걸립니다. 주인장이 진짜로 사줘요.",
          "물론 대부분은 꽝이고요. 세상이 그렇죠.",
        ],
      },
      guestbook: {
        label: "방명록은 어디?",
        lines: [
          "게시판은 섬 한가운데 있어요. 남의 쪽지는 그냥 볼 수 있고요.",
          "한 마디 남기고 가시면 저야 좋죠.",
        ],
      },
    },
  },

  balloon: {
    label: "열기구 타기",
    departing: (seconds: number) => `${seconds}초 뒤 출발`,
    landing: (seconds: number) => `${seconds}초 뒤 착륙`,
    jump: "뛰어내리기 (Esc)",
  },

  fireworks: {
    label: "폭죽 쏘기",
    hint: "누르고 있는 만큼 크게 터집니다",
    charge: "꾹 눌러 쏘기",
    quit: "그만",
  },

  sunset: {
    label: "앉기",
    caption: "가만히 보세요. 밤이 오면 폭죽이 터집니다.",
    stand: "일어나기 (Esc)",
  },

  banner: {
    tagline: "// 걸어서 갈 수 있는 이력서",
  },
};

export type Dict = typeof ko;

const en: Dict = {
  siteName: "Love Island",

  hud: {
    online: (n: number) => (n === 1 ? "1 here" : `${n} here`),
    chatOpen: "Say hi",
    chatPlaceholder: "Say something and move along…",
    send: "Send",
    reactions: { heart: "Heart", firework: "Firework", confetti: "Confetti" },
    shortcutsTitle: "Controls",
    shortcuts: [
      { key: "Tap", action: "Walk there" },
      { key: "WASD", action: "Move" },
      { key: "Shift", action: "Run" },
      { key: "Space", action: "Jump · dive in" },
      { key: "F", action: "Shove — push them in at the shore" },
      { key: "E", action: "Interact with what's nearby" },
      { key: "Enter", action: "Say hi" },
      { key: "1 2 3", action: "Heart · Firework · Confetti" },
      { key: "cgoing-bot", action: "Talk to the guide bot" },
      { key: "?", action: "This list" },
    ],
    shortcutsAria: "Controls",
    touchJump: "Jump",
    touchShove: "Shove",
    close: "Close",
  },

  panel: {
    back: "Island",
  },

  boarding: {
    title: "Sailing to Love Island",
    subtitle: "Hang tight",
    tips: [
      "Tap the ground and you'll walk there.",
      "Tap cgoing-bot and it will take you anywhere.",
      "You can fish at the southern tip of the island.",
      "When night falls, fireworks go up over the sea.",
      "Press 1 · 2 · 3 for hearts and fireworks.",
    ],
  },

  career: {
    label: "Work & projects",
    connecting: "Connecting to",
    blocked: "It won't open inside this screen.",
    openNewTab: "Open in a new tab",
    retry: "Try again",
  },

  album: {
    label: "Open the album",
    slug: "Album",
    title: "Album",
    count: (n: number) => (n === 1 ? "1 photo" : `${n} photos`),
  },

  guestbook: {
    label: "Sign the guestbook",
    slug: "Guestbook board",
    title: "Guestbook",
    subtitle: (n: number, more: boolean) =>
      n > 0
        ? `${n}${more ? "+" : ""} notes · they land where you wrote them`
        : "Your note lands right where you're standing",
    loading: "Loading…",
    failed: "Couldn't load the guestbook.",
    emptyTitle: "Nobody has been through yet.",
    emptyHint: "Leave the first note",
    loadingMore: "Loading more…",
    end: "That's all of them",
    compose: "Pin a note",
    namePlaceholder: "Name",
    messagePlaceholder: "Leave a word before you go",
    cancel: "Cancel",
    submit: "Pin it",
    submitting: "Pinning…",
    failedPost: "Couldn't leave the note.",
    recheck: "Please check that again.",
    at: (x: number, z: number) => `from ${x}, ${z}`,
    justNow: "just now",
    minutesAgo: (n) => (n === 1 ? "1 minute ago" : `${n} minutes ago`),
    hoursAgo: (n) => (n === 1 ? "1 hour ago" : `${n} hours ago`),
    daysAgo: (n) => (n === 1 ? "1 day ago" : `${n} days ago`),
  },

  fishing: {
    label: "Go fishing",
    cast: "Cast (Space)",
    casting: "Casting…",
    waiting: "Waiting… watch the bobber",
    fighting: "It's fighting! Watch the water",
    now: "NOW! (Space)",
    missed: "Missed it — cast again",
    again: "One more (Space)",
    quit: "Stop",
    blank: "NOTHING",
    odds: (percent: string) => `${percent}% chance of a real americano coupon.`,
    couponTitle: "YOU WON",
    couponHowTo: (contact: string) =>
      `Screenshot this and send it to ${contact}. It's a real coffee.`,
    catchables: {
      nothing: {
        name: "Empty line",
        blurb: "Nothing bit. Some days are like that.",
      },
      boot: {
        name: "Old boot",
        blurb: "Just the one. Wonder where the other went.",
      },
      seaweed: {
        name: "Handful of seaweed",
        blurb: "Not quite enough for soup.",
      },
      can: {
        name: "Dented can",
        blurb: "Someone left this behind. Cleaning up, then.",
      },
      shell: {
        name: "Seashell",
        blurb: "Hold it to your ear for the sea… which is right here.",
      },
      rock: { name: "Just a rock", blurb: "It's a rock. Really, just a rock." },
      iou: {
        name: "IOU note",
        blurb: "\"You buy the coffee.\" That's the owner's handwriting.",
      },
      americano: {
        name: "Americano coupon",
        blurb:
          "The owner really buys this one. Screenshot it and send it over.",
      },
    },
  },

  bot: {
    topics: {
      controls: {
        label: "How do I move?",
        lines: [
          "Tap the ground to walk there. WASD works too.",
          "Shift to run, Space to jump.",
          "Get close to something and press E.",
          "1·2·3 are heart, firework, confetti. Give them a try.",
        ],
      },
      career: {
        label: "Who owns this island?",
        lines: [
          "That desk is the owner's. Follow me.",
          "Open the laptop and you'll see what they've built.",
        ],
      },
      album: {
        label: "Show me the album",
        lines: [
          "The photos are on that clothesline.",
          "Follow me. Only a few, but they're all theirs.",
        ],
      },
      fishing: {
        label: "Tell me about fishing",
        lines: [
          "There's a fishing spot at the south tip. I'll walk you over.",
          "Now and then you land a real coffee coupon. The owner actually buys it.",
          "Most casts come up empty, of course. That's how it goes.",
        ],
      },
      guestbook: {
        label: "Where's the guestbook?",
        lines: [
          "The board is in the middle of the island. Anyone can read the notes.",
          "I'd be glad if you left one.",
        ],
      },
    },
  },

  balloon: {
    label: "Ride the balloon",
    departing: (seconds: number) => `Lifting off in ${seconds}s`,
    landing: (seconds: number) => `Landing in ${seconds}s`,
    jump: "Jump out (Esc)",
  },

  fireworks: {
    label: "Launch fireworks",
    hint: "Hold longer, burst bigger",
    charge: "Hold to launch",
    quit: "Done",
  },

  sunset: {
    label: "Sit down",
    caption: "Just watch. Fireworks come out at night.",
    stand: "Stand up (Esc)",
  },

  banner: {
    tagline: "// a résumé you can walk through",
  },
};

const STRINGS: Record<Locale, Dict> = { ko, en };

/**
 * 지금 언어. **클라이언트 전용 전역**이다.
 *
 * ── 서버에서 읽지 않는다 ──
 * 모듈 전역은 서버에서 요청끼리 공유된다. 한 사람이 /en 을, 다른 사람이 / 를 동시에
 * 열면 서로의 언어를 덮어쓸 수 있다. 이 앱에서 안전한 이유는 하나뿐이다 —
 * **섬 전체가 `ssr: false` 라 서버에서는 이 값을 읽는 코드가 아예 안 돈다.**
 * 서버에서 문구가 필요하면(로딩 화면) `stringsFor(locale)` 로 명시해서 가져간다.
 *
 * ⚠ 서버 컴포넌트에서 `t()` 를 부르면 안 된다. 그 순간 이 전제가 깨진다.
 */
let active: Locale = DEFAULT_LOCALE;

export function setLocale(locale: Locale): void {
  active = locale;
}

export function currentLocale(): Locale {
  return active;
}

/** 언어를 명시해서 가져간다. 서버에서 쓸 수 있는 유일한 통로다. */
export function stringsFor(locale: Locale): Dict {
  return STRINGS[locale];
}

/**
 * 지금 언어의 문구 묶음.
 *
 * 키 하나씩 부르지 않고 묶음을 돌려주는 이유는, 그래야 오타가 **타입 에러**가 되고
 * 자동완성이 붙기 때문이다. `t("guestbok.title")` 같은 문자열 키는 런타임까지 산다.
 */
export function t(): Dict {
  return STRINGS[active];
}
