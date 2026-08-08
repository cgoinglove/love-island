"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Group, Mesh } from "three";
import {
  BOT_IDLE_LINES,
  BOT_TOPICS,
  GREETING_KEY,
  IDLE_PREFIX,
  linesFor,
  topicById,
} from "@/game/core/bot/script";
import {
  BOT_LINE_MS,
  type BotDecision,
  currentLine,
  damp,
  dampAngle,
  isOwner,
  poseAlongPath,
  SMOOTH_LAMBDA,
  SMOOTH_SNAP_DISTANCE,
} from "@/game/core/bot/state";
import { elevationAt } from "@/game/core/island";
import { getIslandData } from "@/game/core/islandData";
import { findPath } from "@/game/core/nav/astar";
import { awardStamp } from "@/game/hud/stamps";
import {
  emitRoomEvent,
  getMyPlayerId,
  usePresenceStore,
} from "@/game/net/presence";
import { parseBotDecision, registerBotHandler } from "@/game/net/roomEvents";
import { serverNow } from "@/game/net/serverClock";
import { ContactShadow } from "@/game/player/ContactShadow";
import {
  BOT_HOVER,
  createBotBodyGeometry,
  createBotCursorGeometry,
  createBotCursorRingGeometry,
  createBotFaceTexture,
  createBotOrbGeometry,
  createBotRingGeometry,
} from "@/game/world/botGeometry";
import { CurvedBasicMaterial, CurvedMaterial } from "@/game/world/curvature";
import type { Vec2XZ } from "@/shared/types";

/**
 * 안내 봇 "cgoing-bot".
 *
 * ── 한 마리를 여럿이 함께 본다 ──
 * 봇은 섬에 하나뿐이고, 누가 말을 걸든 **모두가 같은 봇이 움직이는 걸 본다.**
 * 그게 되려면 두 가지가 필요하다:
 *
 *  1. **결정을 내리는 사람이 하나** — playerId 가 가장 작은 사람이 소유자다.
 *     목록만 보면 각자 같은 답을 얻으므로 협상이 없다. (game/core/bot/state.ts)
 *  2. **위치가 아니라 결정을 나눈다** — "언제 어디서 어디로" 만 보내고, 위치는
 *     각자 같은 A* 와 공유 시계로 계산한다. 20Hz 좌표 스트림이 필요 없다.
 *
 * ── 확장하는 법 ──
 * 봇이 할 줄 아는 일을 늘리려면 `game/core/bot/script.ts` 의 BOT_TOPICS 에 한 줄
 * 더하면 된다. 여기 코드는 안 건드려도 된다 — 대사·목적지·도장이 전부 데이터다.
 */

/** 봇이 평소 서 있는 자리. 스폰에서 바로 보이는 거리에 둔다. */
const BOT_HOME: Vec2XZ = [4, 25];

/** 이 거리 안에 사람이 들어오면 인사한다. */
const GREET_RADIUS = 7;
/** 한 번 인사한 사람에게 다시 인사하기까지의 간격(ms). */
const GREET_COOLDOWN_MS = 90_000;
/** 아무 일도 없을 때 혼잣말하는 간격(ms). */
const IDLE_CHATTER_MS = 26_000;

/** 봇의 외형 씨앗. 사람과 겹치지 않는 고정 값이라 늘 같은 모습이다. */
const BOT_NAME = "cgoing-bot";

/** 몸은 한 번만 굽는다. 봇은 섬에 하나뿐이다. */
const BODY_GEOMETRY = createBotBodyGeometry();
const RING_GEOMETRY = createBotRingGeometry();
const ORB_GEOMETRY = createBotOrbGeometry();
const CURSOR_GEOMETRY = createBotCursorGeometry();
const CURSOR_RING_GEOMETRY = createBotCursorRingGeometry();

/** 클릭 유도 커서가 뜨는 자리(봇 기준). 이름표 오른쪽에서 그쪽을 가리킨다. */
const CURSOR_ANCHOR: readonly [number, number, number] = [0.66, 2.52, 0];
/** 누르는 시늉의 주기(초). 너무 빠르면 재촉으로, 너무 느리면 장식으로 보인다. */
const CURSOR_PERIOD = 2.4;

interface Live {
  decision: BotDecision;
  path: Vec2XZ[];
}

function decisionToLive(decision: BotDecision): Live {
  /**
   * 경로는 **각자 계산한다.** 같은 격자에 같은 A* 를 돌리므로 결과가 같고,
   * 그래서 좌표를 주고받지 않아도 모두가 같은 봇을 본다.
   */
  const waypoints = findPath(
    getIslandData().navGrid,
    decision.from,
    decision.target,
  );

  /**
   * ⚠ findPath 는 **출발점을 빼고** 돌려준다 — 플레이어는 이미 거기 서 있으니까.
   *   그걸 그대로 쓰면 막힘없는 직선 구간에서 경로가 [목적지] 한 점이 되고,
   *   poseAlongPath 는 점 하나짜리 경로를 "이미 도착"으로 읽어 **봇이 곧장 찍힌다.**
   *   실제로 그게 "순간이동" 의 정체였다. 걸어야 하는 쪽은 출발점부터 필요하다.
   */
  const path: Vec2XZ[] =
    waypoints.length > 0 ? [decision.from, ...waypoints] : [decision.from];

  // 길이 없으면(물 건너 등) 제자리에서 말만 한다. 벽을 뚫고 가는 것보다 낫다.
  return { decision, path };
}

const STAND_STILL: BotDecision = {
  id: "boot",
  from: BOT_HOME,
  target: BOT_HOME,
  startedAt: 0,
  lines: [],
  topicId: null,
  requestedBy: null,
};

export function GuideBot({
  playerRef,
}: {
  playerRef: React.RefObject<Group | null>;
}) {
  const groupRef = useRef<Group>(null);
  const bodyRef = useRef<Group>(null);
  const ringRef = useRef<Mesh>(null);
  const leftOrbRef = useRef<Mesh>(null);
  const rightOrbRef = useRef<Mesh>(null);
  const cursorRef = useRef<Group>(null);
  const cursorArrowRef = useRef<Mesh>(null);
  const cursorRingRef = useRef<Mesh>(null);
  // 캔버스를 만지므로 브라우저에서만 굽는다.
  const faceTexture = useMemo(createBotFaceTexture, []);

  const myId = useMemo(() => getMyPlayerId(), []);
  const peerList = usePresenceStore((state) => state.peerList);
  const owner = useMemo(
    () => isOwner(myId, [myId, ...peerList.map((p) => p.playerId)]),
    [myId, peerList],
  );

  const live = useRef<Live>(decisionToLive(STAND_STILL));
  /**
   * 화면에 그리는 위치. 계산된 권위 위치와 **따로** 둔다.
   * 결정이 늦게 도착한 만큼 권위 위치는 이미 앞서 있는데, 거기 바로 갖다 놓으면
   * peer 화면에서 봇이 건너뛴다. 이 값이 뒤따라가면서 그 불연속을 먹는다.
   */
  const rendered = useRef({
    x: BOT_HOME[0],
    z: BOT_HOME[1],
    yaw: 0,
    ready: false,
  });
  const [line, setLine] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  /**
   * 한 번이라도 눌러봤는가.
   *
   * 유도는 **모르는 사람에게만** 필요하다. 눌러 본 뒤에도 커서가 계속 까딱이면
   * 그때부터는 안내가 아니라 잔소리다.
   */
  const [tried, setTried] = useState(false);

  /** 소유자만 쓰는 기억. 누구에게 언제 인사했는지. */
  const greeted = useRef(new Map<string, number>());
  const lastChatter = useRef(0);

  /** 결정을 내리고 모두에게 알린다. 소유자만 부른다. */
  const decide = useCallback(
    (
      target: Vec2XZ,
      /** 대본 키. 대사 자체가 아니다 — 통신에 대사를 실어 보내지 않는다. */
      say: string | null,
      topicId: string | null,
      requestedBy: string | null,
    ) => {
      // 출발점은 **지금 서 있는 자리**다. 목적지를 쓰면 걷던 도중에 부탁받았을 때
      // 봇이 아직 도착 안 한 곳에서 순간이동한 것처럼 보인다.
      const pose = poseAlongPath(
        live.current.path,
        (serverNow() - live.current.decision.startedAt) / 1000,
      );
      const start: Vec2XZ = [pose.x, pose.z];

      emitRoomEvent(
        "bot",
        JSON.stringify({
          id: `b_${Math.random().toString(36).slice(2, 10)}`,
          tx: target[0],
          tz: target[1],
          fx: start[0],
          fz: start[1],
          at: serverNow(),
          say,
          topic: topicId,
          by: requestedBy,
        }),
      );
    },
    [],
  );

  // ── 모두: 결정을 받아 반영한다 ──
  useEffect(() => {
    return registerBotHandler((event) => {
      if (event.kind === "botAsk") {
        // 부탁은 소유자만 처리한다. 아니면 흘려보낸다.
        if (!owner) return;
        const topic = topicById(event.text);
        if (!topic) return;
        const here = live.current.decision.target;
        decide(topic.guideTo ?? here, topic.id, topic.id, event.from);
        return;
      }

      const parsed = parseBotDecision(event.text);
      if (!parsed.success || !parsed.data) return;
      const wire = parsed.data;
      live.current = decisionToLive({
        id: wire.id,
        from: [wire.fx, wire.fz],
        target: [wire.tx, wire.tz],
        startedAt: wire.at,
        // 대사는 키로 받아 여기서 편다. 모두가 같은 대본을 갖고 있어서 가능하다.
        lines: linesFor(wire.say),
        topicId: wire.topic,
        requestedBy: wire.by,
      });

      /**
       * 도장은 **부탁한 사람에게만** 찍힌다. 옆에서 구경한 사람까지 찍히면
       * 미션이 미션이 아니게 된다.
       */
      if (wire.by === myId && wire.topic) {
        const topic = topicById(wire.topic);
        if (topic?.awards) awardStamp(topic.awards);
      }
    });
  }, [owner, decide, myId]);

  // ── 소유자: 봇의 판단 ──
  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const now = serverNow();
    const elapsedMs = now - live.current.decision.startedAt;
    const pose = poseAlongPath(live.current.path, elapsedMs / 1000);

    // 권위 위치를 뒤따라간다. 처음 한 번은 그냥 맞춘다 — 첫 프레임까지 미끄러질 이유가 없다.
    const draw = rendered.current;
    const gap = Math.hypot(pose.x - draw.x, pose.z - draw.z);
    const dt = Math.min(delta, 0.1);

    if (!draw.ready || gap > SMOOTH_SNAP_DISTANCE) {
      draw.x = pose.x;
      draw.z = pose.z;
      draw.yaw = pose.yaw;
      draw.ready = true;
    } else {
      draw.x = damp(draw.x, pose.x, SMOOTH_LAMBDA, dt);
      draw.z = damp(draw.z, pose.z, SMOOTH_LAMBDA, dt);
      draw.yaw = dampAngle(draw.yaw, pose.yaw, SMOOTH_LAMBDA, dt);
    }

    group.position.set(draw.x, elevationAt(draw.x, draw.z), draw.z);
    group.rotation.y = draw.yaw;

    const t = now / 1000;

    const body = bodyRef.current;
    if (body) {
      /**
       * 걷는 게 아니라 **떠 있다.** 늘 위아래로 흔들리고, 움직일 땐 앞으로 기운다.
       * 다리가 없으니 발 딛는 애니메이션이 필요 없고, 그게 사람과 다르게 보이는 이유다.
       */
      const walking = pose.moving || gap > 0.05;
      body.position.y = Math.sin(t * 1.9) * 0.09;
      body.rotation.x = walking ? 0.12 : 0;
      body.rotation.z = Math.sin(t * 1.3) * 0.04;
    }

    // 고리는 계속 돈다. 멈춘 기계는 꺼진 기계로 보인다.
    const ring = ringRef.current;
    if (ring) {
      ring.rotation.y = t * 1.1;
      ring.rotation.z = Math.sin(t * 0.7) * 0.25;
    }

    // 구슬 둘은 몸 옆을 천천히 맴돈다.
    for (const [side, ref] of [
      [-1, leftOrbRef],
      [1, rightOrbRef],
    ] as const) {
      const orb = ref.current;
      if (!orb) continue;
      const phase = t * 1.4 + (side > 0 ? Math.PI : 0);
      orb.position.set(
        side * 0.62 + Math.sin(phase) * 0.07,
        BOT_HOVER + 0.72 + Math.sin(phase * 1.3) * 0.13,
        Math.cos(phase) * 0.12,
      );
      orb.rotation.set(phase * 0.6, phase, 0);
    }

    /**
     * 클릭 유도 커서.
     *
     * 봇은 몸이 돌지만(rotation.y) 커서는 늘 정면을 봐야 하므로 **반대로 돌려** 편다.
     * 카메라 방위가 고정이라 이 한 줄이면 빌보드가 완성된다.
     */
    const cursor = cursorRef.current;
    if (cursor) {
      cursor.rotation.y = -draw.yaw;

      // 0 → 1 → 0. 한 주기에 한 번만 짧게 "누른다".
      const beat =
        Math.max(0, Math.sin((t / CURSOR_PERIOD) * Math.PI * 2)) ** 4;

      const arrow = cursorArrowRef.current;
      if (arrow) {
        // 가리키는 축(왼쪽 아래)을 따라 찌른다. 위아래로만 움직이면 그냥 떠 있는 화살표다.
        arrow.position.set(-0.16 * beat, 0.1 - 0.16 * beat, 0);
      }

      const ring = cursorRingRef.current;
      if (ring) {
        // 누른 직후부터 퍼진다. 커지면서 옅어지는 게 "닿았다"는 신호다.
        const spread = 0.55 + beat * 1.5;
        ring.scale.set(spread, spread, 1);
        ring.visible = beat > 0.02;
        const material = ring.material;
        if (!Array.isArray(material)) material.opacity = beat * 0.85;
      }
    }

    const next = currentLine(live.current.decision.lines, elapsedMs);
    setLine((prev) => (prev === next ? prev : next));

    if (!owner) return;

    // 인사: 가까이 온 사람에게, 오래 안 본 사람에게만.
    const player = playerRef.current;
    if (player) {
      const distance = Math.hypot(
        player.position.x - pose.x,
        player.position.z - pose.z,
      );
      const lastGreet = greeted.current.get(myId) ?? 0;
      if (
        distance < GREET_RADIUS &&
        now - lastGreet > GREET_COOLDOWN_MS &&
        elapsedMs > BOT_LINE_MS * live.current.decision.lines.length
      ) {
        greeted.current.set(myId, now);
        decide([pose.x, pose.z], GREETING_KEY, null, null);
        return;
      }
    }

    // 혼잣말: 할 일이 없을 때만. 안내 중에 끼어들면 안 된다.
    const busy =
      pose.moving ||
      elapsedMs < BOT_LINE_MS * live.current.decision.lines.length;
    if (!busy && now - lastChatter.current > IDLE_CHATTER_MS) {
      lastChatter.current = now;
      const index = Math.floor(Math.random() * BOT_IDLE_LINES.length);
      decide([pose.x, pose.z], `${IDLE_PREFIX}${index}`, null, null);
    }
  });

  const ask = useCallback((topicId: string) => {
    setMenuOpen(false);
    emitRoomEvent("botAsk", topicId);
  }, []);

  const toggleMenu = useCallback((event?: { stopPropagation(): void }) => {
    // 안 막으면 같은 탭이 지형까지 내려가 봇 발밑으로 걸어간다.
    event?.stopPropagation();
    setMenuOpen((open) => !open);
    setTried(true);
  }, []);

  return (
    <group ref={groupRef}>
      {/* 떠 있어도 그림자는 땅에 있다. 없으면 어디쯤 떠 있는지 알 수가 없다. */}
      <ContactShadow radius={0.6} opacity={0.8} />

      {/*
        누르는 자리.

        이름표만 눌리게 뒀더니 24m 밖에서 60px 짜리 알약을 정확히 맞춰야 했다 —
        모바일에서는 사실상 불가능하다. 봇을 감싸는 **투명한 구**를 두면
        "봇을 누른다" 가 곧 조작이 된다. 눌러야 하는 건 이름표가 아니라 봇이다.

        보이진 않지만 렌더 대상이어야 한다(visible={false} 는 광선에 안 잡힌다).
        투명도 0 · 깊이 미기록이면 화면에는 아무 흔적도 안 남는다.
      */}
      <mesh position={[0, BOT_HOVER + 0.8, 0]} onPointerDown={toggleMenu}>
        <sphereGeometry args={[1.35, 10, 8]} />
        <CurvedBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <group ref={bodyRef}>
        <mesh geometry={BODY_GEOMETRY} castShadow>
          <CurvedMaterial vertexColors roughness={0.45} metalness={0.15} />
        </mesh>

        {/* 얼굴. 머리 앞면(-Z)에 붙는다. */}
        <mesh position={[0, BOT_HOVER + 1.12, -0.29]}>
          <planeGeometry args={[0.42, 0.32]} />
          <CurvedMaterial
            map={faceTexture}
            emissiveMap={faceTexture}
            emissive="#ffffff"
            emissiveIntensity={0.9}
            roughness={0.6}
            toneMapped={false}
          />
        </mesh>

        {/* 몸을 도는 고리 */}
        <mesh
          ref={ringRef}
          geometry={RING_GEOMETRY}
          position={[0, BOT_HOVER + 0.5, 0]}
        >
          <CurvedMaterial vertexColors roughness={0.4} />
        </mesh>

        {/* 팔 대신 떠 있는 구슬 둘 */}
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            ref={side < 0 ? leftOrbRef : rightOrbRef}
            geometry={ORB_GEOMETRY}
            castShadow
          >
            <CurvedMaterial vertexColors roughness={0.4} metalness={0.2} />
          </mesh>
        ))}
      </group>

      {/*
        클릭 유도 커서.

        이름표가 눌러야 하는 버튼이라는 걸 알려주는 유일한 단서다 —
        화면에 놓인 것만으로는 그게 버튼인 줄 모른다.
        빛을 안 받는 재질을 쓴다. UI 를 겸하는 물건이라 밤이라고 어두워지면 안 된다.
      */}
      {!tried && (
        <group ref={cursorRef} position={CURSOR_ANCHOR}>
          <mesh ref={cursorArrowRef} geometry={CURSOR_GEOMETRY} scale={0.52}>
            <CurvedBasicMaterial vertexColors />
          </mesh>
          <mesh ref={cursorRingRef}>
            <primitive object={CURSOR_RING_GEOMETRY} attach="geometry" />
            <CurvedBasicMaterial
              vertexColors
              transparent
              opacity={0}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      <Html
        position={[0, 2.35, 0]}
        center
        zIndexRange={[14, 0]}
        style={{ pointerEvents: "auto" }}
      >
        <div className="flex w-max flex-col items-center gap-1.5">
          {line && (
            <div className="zoom-in w-max max-w-[260px] animate-in whitespace-pre-wrap break-words rounded-2xl bg-[#fdf6e8] px-3.5 py-2 text-center font-medium text-[14px] text-[#3a2a22] leading-snug shadow-[0_4px_12px_-3px_rgba(0,0,0,0.4)]">
              {line}
            </div>
          )}

          {menuOpen && (
            <div className="zoom-in flex max-w-[280px] animate-in flex-wrap justify-center gap-1.5">
              {BOT_TOPICS.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => ask(topic.id)}
                  className="rounded-full bg-[#fdf6e8] px-3.5 py-2 font-semibold text-[13px] text-[#3a2a22] shadow-[0_3px_10px_-3px_rgba(0,0,0,0.45)] transition active:translate-y-[1.5px]"
                >
                  {topic.label}
                </button>
              ))}
            </div>
          )}

          {/* 이름표도 여전히 눌린다. 손가락이 큰 화면을 생각해 넉넉하게 잡는다. */}
          <button
            type="button"
            onClick={() => toggleMenu()}
            className="whitespace-nowrap rounded-full bg-[#5e9c55] px-4 py-2 font-bold text-[13px] text-[#fdf6e8] shadow-[0_3px_10px_-3px_rgba(0,0,0,0.45)] transition active:translate-y-[1.5px]"
          >
            {BOT_NAME} {menuOpen ? "▾" : "▸"}
          </button>
        </div>
      </Html>
    </group>
  );
}
