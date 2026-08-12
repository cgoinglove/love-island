import "server-only";
import { and, desc, eq, gt, lt, ne, sql } from "drizzle-orm";
import {
  EVENT_TTL_SECONDS,
  type IncomingSignal,
  type OutgoingRoomEvent,
  type OutgoingSignal,
  PRESENCE_TTL_SECONDS,
  type PresenceBeat,
  type PresencePeer,
  type RoomEvent,
  roomEventKind,
  signalKind,
} from "@/shared/presence";
import { getDb } from "../index";
import { presence, roomEvent, signal } from "../schema";

/**
 * 한 번의 왕복으로 네 가지를 한다:
 * 내 위치 올리기 · 남들 위치 받기 · 악수 메시지 주고받기 · 방 사건 주고받기.
 *
 * 나눠 놓으면 초당 5번 × 4 = 20번의 서버리스 호출이 되고,
 * 그건 개인 사이트가 감당할 요금이 아니다.
 */
export interface BeatResult {
  peers: PresencePeer[];
  signals: IncomingSignal[];
  events: RoomEvent[];
  cursor: number;
}

export interface BeatInput {
  beat: PresenceBeat;
  signals: OutgoingSignal[];
  events: OutgoingRoomEvent[];
  /** 마지막으로 본 사건 순번. 0 이면 "최근 것부터 조금만". */
  cursor: number;
}

export async function beatPresence(input: BeatInput): Promise<BeatResult> {
  const db = getDb();
  const { beat } = input;
  const now = new Date();

  /**
   * 쓰기와 읽기를 **한 묶음으로** 보낸다.
   *
   * 예전엔 upsert → (시그널 insert) → (사건 insert) → 읽기 셋 순서로 await 했다.
   * 넷이 서로를 안 기다려도 되는데도 왕복이 최대 네 번 났다 — 로컬에서는 1ms 라
   * 안 보이지만, 배포 환경(Vercel ↔ 원격 Postgres)에서는 왕복 하나가 수십 ms 다.
   * 악수 중에는 그 차이가 그대로 **연결이 붙는 데 걸리는 시간**이 된다.
   *
   * 순서가 상관없는 이유: 읽는 것은 전부 **남이 나에게 남긴 것**이고
   * (`ne(playerId, 나)`, `toId = 나`), 쓰는 것은 전부 **내가 남에게 남기는 것**이다.
   * 내 쓰기가 내 읽기에 영향을 주지 않으므로 같이 보내도 결과가 같다.
   */
  const alive = new Date(now.getTime() - PRESENCE_TTL_SECONDS * 1000);
  const eventFloor = new Date(now.getTime() - EVENT_TTL_SECONDS * 1000);

  const writes: Promise<unknown>[] = [
    db
      .insert(presence)
      .values({
        playerId: beat.playerId,
        room: beat.room,
        nickname: beat.nickname,
        posX: beat.x,
        posZ: beat.z,
        yaw: beat.yaw,
        posY: beat.y,
        updatedAt: now,
      })
      // 같은 탭이 계속 보내므로 INSERT 가 아니라 덮어쓰기다.
      .onConflictDoUpdate({
        target: presence.playerId,
        set: {
          room: beat.room,
          nickname: beat.nickname,
          posX: beat.x,
          posZ: beat.z,
          yaw: beat.yaw,
          posY: beat.y,
          updatedAt: now,
        },
      }),
  ];

  if (input.signals.length > 0) {
    writes.push(
      db.insert(signal).values(
        input.signals.map((message) => ({
          room: beat.room,
          fromId: beat.playerId,
          toId: message.to,
          kind: message.kind,
          payload: message.payload,
          createdAt: now,
        })),
      ),
    );
  }

  if (input.events.length > 0) {
    writes.push(
      db.insert(roomEvent).values(
        input.events.map((event) => ({
          eventId: event.id,
          room: beat.room,
          fromId: beat.playerId,
          nickname: beat.nickname,
          kind: event.kind,
          text: event.text,
          posX: event.x,
          posZ: event.z,
          yaw: event.yaw,
          createdAt: now,
        })),
      ),
    );
  }

  /**
   * 읽기 셋은 서로를 안 기다리고, 쓰기와도 안 기다린다.
   * 바깥 Promise.all 의 첫 칸만 꺼내 쓰고 쓰기는 완료만 기다린다.
   */
  const [[peers, inbox, events]] = await Promise.all([
    Promise.all([
      db
        .select({
          playerId: presence.playerId,
          nickname: presence.nickname,
          x: presence.posX,
          z: presence.posZ,
          yaw: presence.yaw,
          y: presence.posY,
        })
        .from(presence)
        .where(
          and(
            eq(presence.room, beat.room),
            ne(presence.playerId, beat.playerId),
            gt(presence.updatedAt, alive),
          ),
        )
        .limit(24),

      /**
       * 읽으면서 지운다.
       * DELETE ... RETURNING 이라 "읽고 나서 지우는" 사이에 다른 요청이 끼어들어
       * 같은 메시지를 두 번 받는 일이 없다. 악수 메시지는 재사용도 안 되고
       * 쌓아둘 이유도 없어서 이게 정확히 맞는 의미론이다.
       */
      db.delete(signal).where(eq(signal.toId, beat.playerId)).returning({
        from: signal.fromId,
        kind: signal.kind,
        payload: signal.payload,
      }),

      /**
       * 사건은 커서 뒤의 것만. 자기가 보낸 건 제외한다 — 이미 로컬에서 처리했다.
       * 처음 들어온 사람(cursor 0)에게는 최근 것 몇 개만 보여준다.
       */
      db
        .select()
        .from(roomEvent)
        .where(
          and(
            eq(roomEvent.room, beat.room),
            ne(roomEvent.fromId, beat.playerId),
            gt(roomEvent.seq, input.cursor),
            gt(roomEvent.createdAt, eventFloor),
          ),
        )
        .orderBy(desc(roomEvent.seq))
        .limit(40),
    ]),
    ...writes,
  ]);

  const parsedEvents: RoomEvent[] = [];
  for (const row of events) {
    // kind 는 varchar 라 DB 가 아무 문자열이나 담을 수 있다. 나가기 전에 좁힌다.
    const kind = roomEventKind.safeParse(row.kind);
    if (!kind.success) continue;
    parsedEvents.push({
      id: row.eventId,
      from: row.fromId,
      nickname: row.nickname,
      kind: kind.data,
      text: row.text,
      x: row.posX,
      z: row.posZ,
      yaw: row.yaw,
      seq: row.seq,
    });
  }
  // 최신순으로 가져와 자른 뒤, 화면에 뿌리기 좋게 오래된 것부터 정렬한다.
  parsedEvents.reverse();

  const highest = parsedEvents.at(-1)?.seq ?? input.cursor;

  return {
    peers,
    signals: inbox.flatMap((row) => {
      const parsed = signalKind.safeParse(row.kind);
      if (!parsed.success) return [];
      return [{ from: row.from, kind: parsed.data, payload: row.payload }];
    }),
    events: parsedEvents,
    cursor: highest,
  };
}

/** 처음 접속했을 때의 커서. 이 값보다 오래된 사건은 안 받는다. */
export async function currentEventCursor(room: string): Promise<number> {
  const [row] = await getDb()
    .select({ seq: roomEvent.seq })
    .from(roomEvent)
    .where(eq(roomEvent.room, room))
    .orderBy(desc(roomEvent.seq))
    .limit(1);
  return row?.seq ?? 0;
}

/**
 * 죽은 행 청소.
 *
 * 탭을 그냥 닫으면 "나갑니다" 신호가 오지 않으므로 유령이 남는다. 조회할 때
 * updatedAt 으로 걸러내니 화면에는 안 보이지만, 테이블은 계속 자란다.
 * 매 요청마다 지우면 쓰기 경합만 늘어나므로 가끔씩만 부른다.
 */
export async function sweepStalePresence(): Promise<void> {
  const db = getDb();
  const presenceCutoff = new Date(
    Date.now() - PRESENCE_TTL_SECONDS * 1000 * 10,
  );
  // 상대가 이미 나가버려 아무도 안 읽어간 악수 메시지도 같이 치운다.
  const signalCutoff = new Date(Date.now() - 60_000);
  const eventCutoff = new Date(Date.now() - EVENT_TTL_SECONDS * 1000 * 3);

  await Promise.all([
    db.delete(presence).where(lt(presence.updatedAt, presenceCutoff)),
    db.delete(signal).where(lt(signal.createdAt, signalCutoff)),
    db.delete(roomEvent).where(lt(roomEvent.createdAt, eventCutoff)),
  ]);
}

/** 탭을 닫을 때 보내는 작별 인사. 오면 좋고 안 와도 TTL 이 정리한다. */
export async function leavePresence(playerId: string): Promise<void> {
  const db = getDb();
  await Promise.all([
    db.delete(presence).where(eq(presence.playerId, playerId)),
    db.delete(signal).where(eq(signal.toId, playerId)),
  ]);
}

/** 지금 섬에 몇 명 있는지. */
export async function countPresence(room: string): Promise<number> {
  const alive = new Date(Date.now() - PRESENCE_TTL_SECONDS * 1000);
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(presence)
    .where(and(eq(presence.room, room), gt(presence.updatedAt, alive)));
  return row?.count ?? 0;
}
