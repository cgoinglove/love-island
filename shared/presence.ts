import { z } from "zod";
import { CHAT_MAX, NICKNAME_MAX } from "./constants";

/**
 * 접속자 위치와 방 사건의 통신 계약.
 *
 * 방명록과 달리 이 데이터는 **휘발성**이다. 영구 보관할 이유가 없고,
 * 몇 초만 지나면 의미가 없어진다. 그래서 스키마도 최소한만 담는다.
 * (기획서 §5.1 — 플레이어 좌표는 절대 CRDT 에 넣지 않는다)
 */

// ── 위치 ────────────────────────────────────────────────

export const presenceBeat = z.object({
  /** 브라우저 탭 하나당 하나. sessionStorage 에 보관되며 서버는 신원 확인을 하지 않는다. */
  playerId: z.string().min(8).max(64),
  room: z.string().min(1).max(32),
  nickname: z.string().trim().max(NICKNAME_MAX).nullable(),
  /**
   * 섬 좌표.
   *
   * ⚠ 상한은 섬 크기가 아니라 **사람이 갈 수 있는 가장 먼 곳**을 따라간다.
   *   걸어서는 해안선(57m)에 헤엄 4m 가 한계지만, 열기구를 타면 앞바다의
   *   작은 섬까지 갔다 오므로 그보다 훨씬 멀리 나간다. 좁게 잡아 두면
   *   **남의 화면에서만 기구가 중간에서 멈춘다** — 높이 상한에서 이미 한 번
   *   겪은 실수다(y 가 8m 에서 잘려 탄 사람이 지붕에 서 있었다).
   *
   *   game/net/poseCodec 의 POSITION_RANGE 도 같은 숫자여야 한다 —
   *   한쪽만 고치면 P2P 와 폴백에서 좌표가 달라진다.
   */
  x: z.number().finite().min(-120).max(120),
  z: z.number().finite().min(-120).max(120),
  /** 라디안. 서버는 범위만 보고 값을 해석하지 않는다. */
  yaw: z.number().finite().min(-10).max(10),
  /**
   * 지면 위 높이(m). 0 이면 땅에 붙어 있다.
   *
   * 이게 없어서 남의 점프와 넉백이 안 보였다 — 받는 쪽이 좌표의 지면 높이에
   * 캐릭터를 붙여놓기 때문에 상대는 땅에 붙어 미끄러졌다.
   * 예전 클라이언트가 안 보낼 수도 있으니 기본값을 둔다.
   *
   * ⚠ 상한이 20 이었을 땐 **열기구를 탄 사람이 남의 화면에서만 낮게 떠 있었다.**
   *   점프 높이(2m)만 생각하고 잡은 값이라, 하늘로 올라가는 탈것이 생기자마자
   *   모자랐다. game/net/poseCodec 의 HEIGHT_RANGE 도 같은 숫자여야 한다 —
   *   한쪽만 고치면 P2P 와 폴백에서 높이가 달라진다.
   */
  y: z.number().finite().min(0).max(40).default(0),
});

export type PresenceBeat = z.infer<typeof presenceBeat>;

export const presencePeer = z.object({
  playerId: z.string(),
  nickname: z.string().nullable(),
  x: z.number(),
  z: z.number(),
  yaw: z.number(),
  y: z.number(),
});

export type PresencePeer = z.infer<typeof presencePeer>;

// ── WebRTC 악수 ─────────────────────────────────────────

/**
 * presence 요청에 얹어 보낸다 — 시그널링용 엔드포인트를 따로 두지 않는 이유는
 * peer 한 쌍당 메시지가 몇 개뿐이라 전용 통로를 팔 값어치가 없기 때문이다.
 * payload 를 JSON 문자열로 두면 RTCSessionDescription 의 모양을 스키마로 흉내낼 필요가 없다.
 */
export const signalKind = z.enum(["offer", "answer", "ice"]);
export type SignalKind = z.infer<typeof signalKind>;

export const outgoingSignal = z.object({
  to: z.string().min(8).max(64),
  kind: signalKind,
  payload: z.string().max(16_000),
});
export type OutgoingSignal = z.infer<typeof outgoingSignal>;

export const incomingSignal = z.object({
  from: z.string(),
  kind: signalKind,
  payload: z.string(),
});
export type IncomingSignal = z.infer<typeof incomingSignal>;

// ── 방 사건 (채팅 · 밀치기 · 이모트) ──────────────────────

/**
 * 좌표와 달리 이건 **놓치면 안 되는** 데이터라 P2P 와 서버 양쪽으로 보낸다.
 * 같은 사건이 두 번 도착할 수 있으므로 id 로 중복을 걸러낸다.
 */
export const roomEventKind = z.enum([
  "chat",
  "shove",
  "emote",
  "fx",
  /** 봇 소유자가 내리는 결정. 위치가 아니라 "언제 어디로" 만 담는다. */
  "bot",
  /** 봇에게 무언가 부탁한다. 소유자만 듣고 반응한다. */
  "botAsk",
  /** 지금 뭘 하고 있는지(낚시 · 앉기). 아래 ACTIVITY_KINDS 참고. */
  "act",
  /**
   * 비치볼을 찼다. text 에 **공의 상태 전체**(자리 + 속도)가 실린다.
   *
   * 자리만 보내면 받는 쪽이 그 다음을 이어 굴릴 수 없다. 속도까지 함께
   * 보내야 각자 같은 계산을 돌려 같은 자리에 놓을 수 있고, 그러면 다음
   * 발길질까지 통신이 0 이다 — 초당 60번 좌표를 뿌리는 대신 낸 값이다.
   */
  "ball",
  /**
   * 사람이 직접 쏘아 올린 폭죽. text 에 **규모**가 실린다.
   *
   * fx 로 안 보내는 이유: fx 의 text 는 종류(ReactionKind)를 나르는 자리라
   * 거기에 숫자를 겹쳐 실으면 두 뜻이 한 칸을 쓰게 된다. 규모가 있는 폭죽은
   * 규모가 없는 감정표현과 다른 사건이다.
   */
  "shell",
  /**
   * 열기구 출발 알림. text 에 **출발 시각**(공유 시계 epoch ms)이 실린다.
   *
   * 기구의 자리는 그 시각 하나에서 전부 유도된다(features/balloon/flight).
   * 그래서 같이 타는 데 오가는 건 이 숫자 하나뿐이다 — 좌표도, 고도도,
   * 누가 탔는지도 보내지 않는다.
   */
  "ride",
]);
export type RoomEventKind = z.infer<typeof roomEventKind>;

/**
 * 지금 하고 있는 일.
 *
 * ── 왜 좌표 패킷이 아니라 사건인가 ──
 * 좌표는 초당 20번 흐르는 값이라 한 바이트를 얹는 게 자연스러워 보인다. 그런데
 * 그 패킷은 **폴백 경로에서 DB 테이블 컬럼**이다 — 컬럼 하나, 마이그레이션 하나,
 * 서버 코드 세 곳이 따라 붙는다. 반면 이 값은 낚시를 시작할 때 한 번, 끝날 때
 * 한 번 바뀐다. 초당 20번 보낼 이유가 없는 값을 초당 20번 가는 통로에 태우면
 * 그 통로가 비싸질 뿐이다.
 *
 * 사건으로 보내면 P2P · 폴링 양쪽을 이미 타고, 중복 제거도 이미 돼 있다.
 * 대신 **놓친 사람**이 생긴다(내가 낚시를 시작한 뒤에 들어온 사람). 그래서
 * 하는 동안 몇 초에 한 번씩 같은 사실을 되풀이해 보낸다 — 늦게 온 사람도
 * 한 박자면 따라잡고, 보내는 쪽이 갑자기 사라져도 TTL 이 알아서 정리한다.
 */
export const ACTIVITY_KINDS = ["fishing", "sitting"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export function isActivityKind(value: string): value is ActivityKind {
  return (ACTIVITY_KINDS as readonly string[]).includes(value);
}

/** 하고 있는 중이라고 되풀이해 알리는 주기(ms). */
export const ACTIVITY_BEAT_MS = 2500;
/**
 * 이만큼 소식이 없으면 그만둔 것으로 본다(ms).
 *
 * 주기의 세 배쯤이어야 한 번 놓쳤다고 남의 화면에서 낚싯대가 깜빡이지 않는다.
 */
export const ACTIVITY_TTL_MS = 8000;

/**
 * 감정표현 파티클의 종류.
 *
 * 이모지 말풍선과 따로 두는 이유: 이건 **월드 안에서 터지는 사건**이다.
 * 머리 위에 뜨는 글자가 아니라 그 자리의 공간을 차지하고, 멀리서도 보인다.
 * 그래서 좌표를 싣고(x, z) 사건 종류만 텍스트로 나른다.
 */
export const REACTION_KINDS = ["heart", "firework", "confetti"] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

export function isReactionKind(value: string): value is ReactionKind {
  return (REACTION_KINDS as readonly string[]).includes(value);
}

/** 사람이 쏘는 폭죽의 규모 범위. 이 밖의 값은 믿지 않는다. */
export const SHELL_MIN_POWER = 1;
export const SHELL_MAX_POWER = 3;

/** 사람이 쏜 폭죽 한 발. 규모와 **터질 자리**를 함께 나른다. */
export interface ShellShot {
  power: number;
  x: number;
  z: number;
}

/**
 * 남이 보낸 폭죽 문자열("규모,x,z")을 안전한 값으로 바꾼다.
 *
 * ── 왜 자리까지 싣나 ──
 * 예전엔 규모만 보내고 **보낸 사람 자리**에서 터뜨렸다. 그러면 발사대 바로 위,
 * 즉 머리 위에서 터진다 — 폭죽은 멀리서 터져야 폭죽이고, 눈앞에서 터지면
 * 그냥 화면을 덮는 입자다. 지금은 발사대가 바다 쪽으로 겨냥한 자리를 실어 보낸다.
 *
 * 남이 보낸 값은 믿지 않는다 — 규모 999 짜리 폭죽 하나면 파티클 링버퍼가
 * 통째로 덮여 다른 사람들의 연출이 전부 지워지고, 좌표가 범위를 벗어나면
 * 아무도 못 보는 자리에서 터진다.
 */
export function parseShell(text: string, fallback: ShellShot): ShellShot {
  const [rawPower, rawX, rawZ] = text.split(",");
  const power = Number.parseFloat(rawPower ?? "");
  const x = Number.parseFloat(rawX ?? "");
  const z = Number.parseFloat(rawZ ?? "");
  const clamp = (value: number, limit: number, spare: number) =>
    Number.isFinite(value) ? Math.min(limit, Math.max(-limit, value)) : spare;
  return {
    power: Number.isFinite(power)
      ? Math.min(SHELL_MAX_POWER, Math.max(SHELL_MIN_POWER, power))
      : SHELL_MIN_POWER,
    x: clamp(x, 120, fallback.x),
    z: clamp(z, 120, fallback.z),
  };
}

/**
 * 열기구 출발 시각을 읽는다. 못 믿을 값이면 null.
 *
 * 남이 보낸 값은 믿지 않는다 — 먼 미래를 보내면 기구가 영영 안 뜨고,
 * 먼 과거를 보내면 매 프레임 착륙 판정이 돈다. 한 편의 길이 안팎만 받는다.
 */
/**
 * 찬 공의 상태. "x,y,z,vx,vy,vz" 여섯 개다.
 *
 * 남이 보낸 숫자는 믿지 않는다 — 자리는 섬 밖으로 못 나가게 자르고,
 * 속도는 사람이 낼 수 있는 범위로 자른다. 하나라도 숫자가 아니면 통째로 버린다.
 */
export function parseBall(text: string): {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
} | null {
  const parts = text.split(",").map((raw) => Number.parseFloat(raw));
  if (parts.length !== 6 || parts.some((v) => !Number.isFinite(v))) return null;

  const clamp = (value: number, limit: number) =>
    Math.min(limit, Math.max(-limit, value));
  const [x, y, z, vx, vy, vz] = parts as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return {
    x: clamp(x, 70),
    y: Math.min(30, Math.max(0, y)),
    z: clamp(z, 70),
    vx: clamp(vx, 22),
    vy: clamp(vy, 22),
    vz: clamp(vz, 22),
  };
}

export function parseDepartAt(text: string, now: number): number | null {
  const at = Number.parseFloat(text);
  if (!Number.isFinite(at)) return null;
  const ahead = at - now;
  return ahead < 30_000 && ahead > -120_000 ? at : null;
}

/**
 * 사건 하나가 실어 나를 수 있는 최대 글자 수.
 * 봇 결정 JSON 이 들어갈 만큼만 잡는다 — 넉넉하게 잡으면 DB 행이 그만큼 무거워진다.
 */
export const EVENT_TEXT_MAX = 240;

const roomEventShape = {
  /** 클라이언트가 만든 고유 id. 중복 제거의 기준. */
  id: z.string().min(6).max(64),
  kind: roomEventKind,
  /**
   * chat 은 메시지, emote 는 이모지 한 글자, fx 는 ReactionKind, shove 는 빈 문자열,
   * bot 은 결정 JSON, botAsk 는 화제 id.
   *
   * ⚠ 상한이 CHAT_MAX 가 아닌 이유: **채팅 길이 제한과 전송 상한은 다른 문제**다.
   *   같은 숫자를 쓰다가 봇 결정이 통째로 400 으로 튕겼다.
   *   사람이 치는 글자 수는 아래 checkTextLength 가 따로 본다.
   */
  text: z.string().max(EVENT_TEXT_MAX),
  /** 사건이 일어난 자리. shove 는 여기서부터 반경 안의 사람을 민다. */
  x: z.number().finite().min(-120).max(120),
  z: z.number().finite().min(-120).max(120),
  yaw: z.number().finite().min(-10).max(10),
};

/**
 * 종류마다 허용 길이가 다르다. 사람이 치는 채팅은 짧아야 말풍선이 화면을 안 먹고,
 * 기계가 만드는 결정은 그보다 길 수 있다.
 */
function checkTextLength(
  event: { kind: RoomEventKind; text: string },
  ctx: z.RefinementCtx,
): void {
  const limit = event.kind === "chat" ? CHAT_MAX : EVENT_TEXT_MAX;
  if (event.text.length > limit) {
    ctx.addIssue({
      code: "custom",
      path: ["text"],
      message: `${event.kind} 은 ${limit}자까지입니다`,
    });
  }
}

export const outgoingRoomEvent = z
  .object(roomEventShape)
  .superRefine(checkTextLength);
export type OutgoingRoomEvent = z.infer<typeof outgoingRoomEvent>;

export const roomEvent = z
  .object({
    ...roomEventShape,
    from: z.string(),
    nickname: z.string().nullable(),
    /** 서버가 매기는 순번. 다음 요청의 커서로 쓴다. */
    seq: z.number(),
  })
  .superRefine(checkTextLength);
export type RoomEvent = z.infer<typeof roomEvent>;

// ── 응답 ────────────────────────────────────────────────

export const presenceResponse = z.object({
  peers: z.array(presencePeer),
  /** 나에게 온 악수 메시지. 읽으면 서버에서 지워진다. */
  signals: z.array(incomingSignal),
  /** 내가 아직 못 본 방 사건들. */
  events: z.array(roomEvent),
  /** 다음 요청에 보낼 커서. */
  cursor: z.number(),
});

export type PresenceResponse = z.infer<typeof presenceResponse>;

// ── 튜닝 값 ─────────────────────────────────────────────

/**
 * 이 시간 동안 소식이 없으면 나간 것으로 본다.
 * 탭을 그냥 닫으면 "나감" 신호가 오지 않으므로, 유령이 남지 않으려면 타임아웃이 유일한 방법이다.
 */
export const PRESENCE_TTL_SECONDS = 12;

/** 움직이는 동안의 전송 주기(ms). 서버 호출 수와 부드러움의 맞바꿈. */
export const PRESENCE_ACTIVE_INTERVAL_MS = 200;

/**
 * 악수가 오가는 중의 간격(ms).
 *
 * offer → answer → ICE 후보들이 전부 이 폴링에 실려 다닌다. 왕복 한 번이 곧
 * 연결이 붙기까지의 시간이라, 여기가 느리면 P2P 가 성사되기 전에 사람이 나간다.
 */
export const PRESENCE_HANDSHAKE_INTERVAL_MS = 60;

/** 가만히 서 있을 때의 전송 주기(ms). "아직 여기 있다"만 알리면 된다. */
export const PRESENCE_IDLE_INTERVAL_MS = 3000;

/**
 * 보간 지연(ms). 받은 좌표를 바로 그리지 않고 이만큼 과거를 렌더한다.
 * 200ms 주기로 들어오므로 그보다 넉넉해야 항상 두 스냅샷 **사이**에 있게 되고,
 * 그래야 외삽(추측) 없이 보간만으로 부드러워진다. (기획서 §5.3)
 */
export const PRESENCE_INTERP_DELAY_MS = 320;

/**
 * WebRTC 로 좌표를 뿌리는 주기(ms). 서버를 안 거치므로 폴링보다 훨씬 자주 보낼 수 있다.
 * 20Hz 는 기획서 §5.3 이 잡아둔 값과 같다.
 */
export const RTC_POSE_INTERVAL_MS = 50;

/**
 * P2P 로 좌표가 오는 사이엔 보간 지연을 짧게 잡는다.
 * 50ms 주기면 120ms 만 뒤처져도 항상 두 스냅샷 사이에 있다.
 */
export const RTC_INTERP_DELAY_MS = 120;

/**
 * 밀치기가 닿는 거리(m)와 각도(라디안). 뒤에서 오는 건 안 맞는다.
 *
 * 2.8m · 135° 였을 때 "왜 이렇게 어렵냐" 는 말을 들었다. 서로 움직이는 중이라
 * 2.8m 는 **한 걸음이면 벗어나는 거리**고, 그 안에 들어온 순간에 각도까지 맞아야 했다.
 * 밀치기는 정밀 조작이 아니라 장난이라 판정이 후해야 한다 — 4.2m · 180° 면
 * "앞에 있으면 맞는다" 가 되고, 그게 이 기능에 기대하는 감각이다.
 */
export const SHOVE_RANGE = 4.2;
export const SHOVE_ARC = Math.PI;
/**
 * 밀치기 세기. 수평 속도와 살짝 띄우는 속도.
 *
 * ⚠ 이동 속도와 **같이** 움직여야 하는 값이다. 걷기를 3.4 → 10 m/s 로 올렸더니
 *   밀쳐진 사람이 걷는 것보다 느려져서 기능이 통째로 무의미해졌다.
 *   "밀렸다"가 읽히려면 제 발로 가는 것보다 확실히 빨라야 한다 — 걷기의 2.6배로 잡는다.
 *   띄우는 속도도 중력을 따라간다. 중력 40 에서 6.0 이면 체공 0.3초 · 정점 0.45m 다.
 */
export const SHOVE_IMPULSE = 32;
export const SHOVE_LIFT = 7.0;
/**
 * 연타 방지.
 *
 * 700ms 는 한 번 놓치면 다시 노리기까지 상대가 이미 가버리는 간격이었다.
 * 맞히기 쉬워진 만큼 다시 휘두르기도 쉬워야 주고받는 맛이 난다.
 */
export const SHOVE_COOLDOWN_MS = 450;

/** 말풍선이 머리 위에 떠 있는 시간(ms). */
export const CHAT_BUBBLE_MS = 6000;

/**
 * 감정표현 최소 간격(ms).
 *
 * ⚠ 여기 있던 450ms 가 "1·2·3 이 굼뜨다"의 정체였다.
 *   두 번째 누름이 조용히 버려지는데 화면에는 아무 표시도 없어서, 사용자에게는
 *   버튼이 씹힌 게 아니라 **반응이 늦은 것**으로 보인다. 연타 방지가 하려던 일은
 *   파티클 풀 보호였는데, 풀은 링버퍼라 넘쳐도 오래된 입자를 덮어쓸 뿐 터지지 않는다.
 *   즉 막을 이유가 애초에 없었다.
 *
 * 지금 값은 사람이 넘을 수 없는 하한이다(초당 12회). 손가락으로는 절대 안 걸리고,
 * 키가 눌린 채 고장 나거나 매크로가 붙었을 때만 걸린다.
 */
export const REACTION_COOLDOWN_MS = 80;

/**
 * 봇 결정의 통신 계약.
 *
 * 사건의 text 에 JSON 으로 실려 간다. 전용 필드를 만들지 않은 이유는 이 한 종류
 * 때문에 모든 사건이 안 쓰는 컬럼을 이고 다니게 되기 때문이다.
 */
export const botDecision = z.object({
  id: z.string().min(4).max(64),
  tx: z.number().finite().min(-120).max(120),
  tz: z.number().finite().min(-120).max(120),
  fx: z.number().finite().min(-120).max(120),
  fz: z.number().finite().min(-120).max(120),
  /** 서버 보정 epoch ms. 위치를 여기서 역산한다. */
  at: z.number().finite(),
  /**
   * 대본 키. 대사 자체가 아니다 —
   * 대사는 모두가 같은 번들로 이미 갖고 있어서 다시 보낼 이유가 없다.
   */
  say: z.string().max(40).nullable(),
  /** 도장을 찍을 화제. 없으면 그냥 말만 한 것이다. */
  topic: z.string().max(32).nullable(),
  by: z.string().max(64).nullable(),
});
export type BotDecisionWire = z.infer<typeof botDecision>;

/** 사건이 서버에 남아 있는 시간(초). 늦게 들어온 사람에게 옛 채팅을 보여주지 않는다. */
export const EVENT_TTL_SECONDS = 40;
