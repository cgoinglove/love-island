import {
  bigserial,
  index,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { MESSAGE_MAX, NICKNAME_MAX } from "@/shared/constants";
import { EVENT_TEXT_MAX } from "@/shared/presence";

/**
 * 길이 제한을 shared/constants 에서 가져온다.
 * DB 컬럼 · Zod 스키마 · UI 글자수 카운터가 같은 숫자를 보게 하는 가장 단순한 방법이다.
 * 여기를 200 → 300 으로 바꾸면 마이그레이션 · 검증 · 입력창이 한꺼번에 따라온다.
 */
export const guestbook = pgTable(
  "guestbook",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nickname: varchar("nickname", { length: NICKNAME_MAX }).notNull(),
    message: varchar("message", { length: MESSAGE_MAX }).notNull(),
    room: varchar("room", { length: 32 }).notNull(),
    /** 쪽지가 떨어진 섬 위의 좌표. */
    posX: real("pos_x").notNull(),
    posZ: real("pos_z").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /**
     * soft delete. 스팸을 지울 때 행을 없애지 않는다 —
     * 잘못 지웠을 때 되돌릴 수 있어야 하고, 신고 이력도 남아야 한다. (기획서 §12)
     */
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    /** 원본 IP 는 저장하지 않는다. 레이트 리밋 판정에만 쓰는 단방향 해시. */
    ipHash: varchar("ip_hash", { length: 64 }),
  },
  (table) => [
    // 목록 조회는 항상 (room, 최신순) 이다.
    index("guestbook_room_created_idx").on(table.room, table.createdAt),
    // 레이트 리밋은 (ipHash, 최근) 으로 센다.
    index("guestbook_ip_created_idx").on(table.ipHash, table.createdAt),
  ],
);

export type GuestbookRow = typeof guestbook.$inferSelect;
export type GuestbookInsert = typeof guestbook.$inferInsert;

/**
 * 지금 섬에 있는 사람들.
 *
 * 방명록과 성격이 정반대인 테이블이다 — 행이 계속 덮어써지고, 몇 초 지나면 버려진다.
 * 그래서 히스토리도 인덱스도 최소한만 둔다. 사실상 Postgres 를 캐시로 쓰는 셈인데,
 * 별도 인프라(Redis · WebSocket 서버)를 들이지 않고 Vercel 위에서 돌리려면 이게 가장 단순하다.
 * 자세한 판단 근거는 docs/adr/0004 참고.
 */
export const presence = pgTable(
  "presence",
  {
    /** 브라우저 탭이 만든 임의의 id. 로그인이 없으므로 신원 확인은 하지 않는다. */
    playerId: varchar("player_id", { length: 64 }).primaryKey(),
    room: varchar("room", { length: 32 }).notNull(),
    nickname: varchar("nickname", { length: NICKNAME_MAX }),
    posX: real("pos_x").notNull(),
    posZ: real("pos_z").notNull(),
    yaw: real("yaw").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  // 조회는 언제나 "이 방에서 최근에 살아있던 사람" 이다.
  (table) => [
    index("presence_room_updated_idx").on(table.room, table.updatedAt),
  ],
);

export type PresenceRow = typeof presence.$inferSelect;

/**
 * WebRTC 악수 메시지 우편함.
 *
 * 브라우저 둘이 직접 연결되기 전, offer/answer/ICE 후보를 서로 전달해줄 곳이 필요하다.
 * 그게 "시그널링 서버"의 전부이고, 그 일은 peer 한 쌍당 메시지 몇 개로 끝난다 —
 * 그래서 전용 WebSocket 서버 대신 이 테이블 하나로 충분하다.
 *
 * 읽으면 지운다. 쌓아둘 이유가 없고 재사용도 안 된다.
 */
export const signal = pgTable(
  "signal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    room: varchar("room", { length: 32 }).notNull(),
    fromId: varchar("from_id", { length: 64 }).notNull(),
    toId: varchar("to_id", { length: 64 }).notNull(),
    kind: varchar("kind", { length: 16 }).notNull(),
    /** JSON 문자열. SDP 는 수 KB 가 될 수 있어서 text 다. */
    payload: text("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  // 조회는 언제나 "나에게 온 것" 이다.
  (table) => [index("signal_to_created_idx").on(table.toId, table.createdAt)],
);

export type SignalRow = typeof signal.$inferSelect;

/**
 * 방 안에서 일어난 사건 — 채팅 · 밀치기 · 이모트.
 *
 * presence 와 달리 순서가 중요해서 bigserial 순번을 매긴다. 클라이언트는
 * 마지막으로 본 seq 를 커서로 보내고, 서버는 그 뒤의 것만 돌려준다.
 * 이렇게 하면 놓친 채팅이 없고 같은 걸 두 번 받지도 않는다.
 *
 * TTL 이 짧다(40초). 늦게 들어온 사람에게 옛 채팅이 우수수 뜨면 이상하다.
 */
export const roomEvent = pgTable(
  "room_event",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    /** 클라이언트가 만든 id. P2P 로도 같은 사건이 오므로 중복 제거에 쓴다. */
    eventId: varchar("event_id", { length: 64 }).notNull(),
    room: varchar("room", { length: 32 }).notNull(),
    fromId: varchar("from_id", { length: 64 }).notNull(),
    nickname: varchar("nickname", { length: NICKNAME_MAX }),
    kind: varchar("kind", { length: 16 }).notNull(),
    /** ⚠ CHAT_MAX 가 아니라 EVENT_TEXT_MAX 다 — 봇 결정 JSON 도 이 컬럼에 들어간다. */
    text: varchar("text", { length: EVENT_TEXT_MAX }).notNull(),
    posX: real("pos_x").notNull(),
    posZ: real("pos_z").notNull(),
    yaw: real("yaw").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("room_event_room_seq_idx").on(table.room, table.seq)],
);

export type RoomEventRow = typeof roomEvent.$inferSelect;

/**
 * 낚시로 잡은 것.
 *
 * ── 왜 저장하나 ──
 * 커피 쿠폰은 **진짜로 사주는** 보상이다. 클라이언트가 만든 화면을 캡처해 보내는
 * 방식이면 개발자 도구를 아는 사람은 누구나 위조한다. 굴림을 서버가 하고 결과를
 * 여기 남겨야, 받은 코드가 진짜인지 확인할 수 있다.
 *
 * ── 확인하는 법 ──
 * SELECT * FROM catch WHERE code = '보내온 코드';
 * claimed_at 이 비어 있으면 아직 안 쓴 것이다. 쓴 뒤엔 채워둔다.
 */
export const catchLog = pgTable(
  "catch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    room: varchar("room", { length: 32 }).notNull(),
    playerId: varchar("player_id", { length: 64 }).notNull(),
    itemId: varchar("item_id", { length: 32 }).notNull(),
    /** 교환 코드. 진짜 보상일 때만 발급한다. */
    code: varchar("code", { length: 12 }),
    /** 사용 처리 시각. 주인장이 커피를 사주고 나면 채운다. */
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    ipHash: varchar("ip_hash", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // 코드로 조회 = 쿠폰 확인. 가장 자주 하는 질의다.
    uniqueIndex("catch_code_idx").on(table.code),
    // 시간당 횟수 제한을 세는 데 쓴다.
    index("catch_ip_created_idx").on(table.ipHash, table.createdAt),
  ],
);

export type CatchRow = typeof catchLog.$inferSelect;
