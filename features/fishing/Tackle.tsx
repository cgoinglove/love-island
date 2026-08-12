"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  type Group,
  Line,
  LineBasicMaterial,
  type Mesh,
  type Object3D,
  Vector3,
} from "three";
import { elevationAt } from "@/game/core/island";
import { usePlayerController } from "@/game/core/playerControl";
import { useActivityStore, useBroadcastActivity } from "@/game/net/activity";
import { type Pose, sample } from "@/game/net/interpolation";
import { getMyPlayerId, getPeers } from "@/game/net/presence";
import { serverNow } from "@/game/net/serverClock";
import {
  CurvedBasicMaterial,
  CurvedMaterial,
  curvatureUniforms,
} from "@/game/world/curvature";
import { emitParticles } from "@/game/world/particleBus";
import { jackpotColor, splashColor, splashSpecs } from "@/game/world/splash";
import {
  PRESENCE_INTERP_DELAY_MS,
  RTC_INTERP_DELAY_MS,
} from "@/shared/presence";
import { CAST_AIM, FISHING_POSITION } from "./constants";
import {
  CAST_DISTANCE,
  CAST_SECONDS,
  FIGHT_MS,
  type FishingStage,
  useFishingStore,
} from "./session";

/**
 * 낚싯대 · 낚싯줄 · 찌.
 *
 * 팝업 안의 파란 네모 대신 **실제로 물에 던진다.** 낚싯대가 뒤로 젖혀졌다가
 * 휘두르고, 찌가 포물선을 그리며 날아가고, 입질하면 대가 활처럼 휘고,
 * 챈 순간 물속에서 좌우로 째다가 물보라와 함께 튀어나온다.
 *
 * ── 왜 이만큼 하나 ──
 * 전에는 대가 땅에 꽂힌 막대였고 찌는 위아래로만 움직였다. 판정은 다 맞는데
 * **아무 일도 안 일어나는 것처럼** 보였다 — 낚시의 재미는 확률표가 아니라
 * 줄 끝에 뭔가 걸렸다는 감각에서 나온다. 그 감각은 화면에서만 만들 수 있다.
 *
 * ── 남의 낚시도 그린다 ──
 * 활동 상태가 오가므로(game/net/activity), 옆 사람이 낚시 중이면 그 사람 손에도
 * 낚싯대가 들리고 찌가 물에 떠 있다. 남이 뭘 하는지 안 보이면 같이 있을
 * 이유가 없다.
 *
 * 좌표 계산은 전부 매 프레임 여기서 한다. 단계 전환만 store 에 있고
 * 위치는 리액트를 통과하지 않는다.
 */

/** 물 쪽. 화면 안에 남도록 정해둔 방향이다(constants.ts). */
const AIM = { x: CAST_AIM[0], z: CAST_AIM[1] };

/** 찌가 떨어지는 자리. 물 위다. */
const LANDING = new Vector3(
  FISHING_POSITION[0] + AIM.x * CAST_DISTANCE,
  0,
  FISHING_POSITION[1] + AIM.z * CAST_DISTANCE,
);

/** 이보다 멀어지면 낚시가 저절로 끝난다. 상호작용 반경(2.4)보다 넉넉하게. */
const LEAVE_DISTANCE = 5;

const LINE_SEGMENTS = 16;

/**
 * 낚싯대를 마디로 나눈다.
 *
 * 한 개의 원기둥을 통째로 돌리면 아무리 돌려도 **막대**다. 낚싯대가 낚싯대로
 * 보이는 건 휘어서다 — 손잡이는 뻣뻣하고 끝으로 갈수록 잘 휜다.
 * 마디마다 각도를 조금씩 더 주면 진짜 곡선이 나오고, 지오메트리는 네 개로
 * 고정이라 매 프레임 만들 게 없다.
 */
const ROD_JOINTS = 4;
const ROD_LENGTH = 2.2;
const SEGMENT = ROD_LENGTH / ROD_JOINTS;
/** 마디별 휨 분배. 끝으로 갈수록 많이 휜다 — 합이 1 이다. */
const BEND_SHARE = [0.1, 0.18, 0.29, 0.43] as const;

/** 손이 낚싯대를 쥐는 자리. 캐릭터 몸 기준 오프셋(m). */
const GRIP_UP = 1.12;
const GRIP_SIDE = 0.3;
const GRIP_FORWARD = 0.12;

/** 물 밖으로 튀어나오는 구간. 씨름 시간의 마지막 이만큼. */
const LEAP_FRACTION = 0.32;

interface RigFrame {
  /** 사람이 서 있는 자리(월드). */
  x: number;
  y: number;
  z: number;
  stage: FishingStage;
  /** 지금 단계의 진행도 0~1. 단계마다 뜻이 다르다. */
  progress: number;
  /** 진짜가 걸렸는가. 물보라 색이 이걸로 갈린다. */
  jackpot: boolean;
}

/** 매 프레임 이 사람의 상태를 읽어 out 에 채운다. 읽을 게 없으면 false. */
type RigSource = (out: RigFrame, nowMs: number) => boolean;

export function Tackle() {
  const stage = useFishingStore((state) => state.stage);
  const myId = useMemo(getMyPlayerId, []);

  /**
   * 내가 낚시 중이라는 걸 남들에게 알린다.
   * 시작 · 되풀이 · 끝맺음이 이 한 줄에 다 들어 있다(game/net/activity).
   */
  useBroadcastActivity("fishing", stage !== "away");

  /**
   * 낚시 중인 다른 사람들.
   *
   * `doing` 은 실제로 누가 뭘 하는지 바뀔 때만 새 객체가 된다 — 몇 초마다
   * 오는 "아직 하는 중" 신호로는 리렌더가 안 돈다.
   */
  // ⚠ 훅은 조건 밖에서 부른다. 낚시를 그만두는 순간 훅 개수가 달라지면 안 된다.
  const mine = useLocalSource();

  const doing = useActivityStore((state) => state.doing);
  const others = useMemo(
    () =>
      Object.entries(doing)
        .filter(([id, entry]) => entry.kind === "fishing" && id !== myId)
        .map(([id]) => id),
    [doing, myId],
  );

  return (
    <>
      {stage !== "away" && <Rig seed={myId} source={mine} />}
      {others.map((id) => (
        <Rig key={id} seed={id} source={peerSource(id)} />
      ))}
    </>
  );
}

/**
 * 내 상태를 읽는 창구.
 *
 * 컨트롤러가 이미 매 프레임 내 좌표를 들고 있으므로 새 공유 상태를 만들지 않는다.
 * 자리를 벗어나면 여기서 낚시를 끝낸다 — 걸어가는 게 곧 "그만두겠다" 는 뜻이다.
 */
function useLocalSource(): RigSource {
  const controllerRef = usePlayerController();
  return useMemo(
    () => (out, nowMs) => {
      const store = useFishingStore.getState();
      const pose = controllerRef.current?.pose();
      if (!pose) return false;

      const away = Math.hypot(
        pose.x - FISHING_POSITION[0],
        pose.z - FISHING_POSITION[1],
      );
      if (away > LEAVE_DISTANCE) {
        store.leave();
        return false;
      }

      out.x = pose.x;
      out.y = elevationAt(pose.x, pose.z) + pose.y;
      out.z = pose.z;
      out.stage = store.stage;
      out.jackpot = store.pending?.tier === "real";
      out.progress = progressOf(store.stage, store.stageUntil, nowMs);
      return true;
    },
    [controllerRef],
  );
}

/**
 * 남의 상태를 읽는 창구.
 *
 * 단계까지 실어 보내지는 않는다. 그건 초당 몇 번씩 바뀌는 값이라 사건으로
 * 나르기엔 잦고, 남의 화면에서 찌가 정확히 언제 잠기는지는 아무도 안 본다.
 * **낚싯대를 들고 찌가 떠 있다**는 것까지가 멀리서 읽히는 전부다.
 */
function peerSource(playerId: string): RigSource {
  const pose: Pose = { x: 0, z: 0, yaw: 0, y: 0 };
  return (out) => {
    const peer = getPeers().get(playerId);
    if (!peer) return false;
    const delay = peer.direct ? RTC_INTERP_DELAY_MS : PRESENCE_INTERP_DELAY_MS;
    if (!sample(peer.buffer, performance.now() - delay, pose)) return false;

    out.x = pose.x;
    out.y = elevationAt(pose.x, pose.z) + pose.y;
    out.z = pose.z;
    out.stage = "waiting";
    out.progress = 0;
    out.jackpot = false;
    return true;
  };
}

function progressOf(
  stage: FishingStage,
  stageUntil: number,
  nowMs: number,
): number {
  if (stage === "casting") {
    return clamp01(1 - (stageUntil - nowMs) / 1000 / CAST_SECONDS);
  }
  if (stage === "fighting") {
    return clamp01(1 - (stageUntil - nowMs) / FIGHT_MS);
  }
  return 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** 사람마다 찌가 떨어지는 자리를 조금씩 흩뜨린다. 겹치면 한 명처럼 보인다. */
function sidewaysOffset(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return (((hash % 200) / 200) * 2 - 1) * 1.6;
}

function Rig({ seed, source }: { seed: string; source: RigSource }) {
  const yawRef = useRef<Group>(null);
  const pitchRef = useRef<Group>(null);
  const jointRefs = useRef<(Group | null)[]>([]);
  const tipRef = useRef<Object3D>(null);
  const bobberRef = useRef<Group>(null);
  const catchRef = useRef<Mesh>(null);

  /** 이 사람의 찌가 떨어지는 자리. */
  const landing = useMemo(() => {
    const offset = sidewaysOffset(seed);
    // 조준 방향에 수직인 쪽으로 밀어낸다.
    return new Vector3(
      LANDING.x - AIM.z * offset,
      0,
      LANDING.z + AIM.x * offset,
    );
  }, [seed]);

  const segmentGeometry = useMemo(
    () =>
      Array.from(
        { length: ROD_JOINTS },
        (_, i) =>
          new CylinderGeometry(
            // 끝으로 갈수록 가늘어진다.
            0.022 - i * 0.004,
            0.026 - i * 0.004,
            SEGMENT,
            6,
          ),
      ),
    [],
  );

  const lineGeometry = useMemo(() => new BufferGeometry(), []);
  const lineObject = useMemo(
    () =>
      new Line(
        lineGeometry,
        new LineBasicMaterial({
          color: 0xf4f0e6,
          transparent: true,
          opacity: 0.75,
        }),
      ),
    [lineGeometry],
  );

  const scratch = useMemo(
    () => ({
      frame: {
        x: 0,
        y: 0,
        z: 0,
        stage: "ready" as FishingStage,
        progress: 0,
        jackpot: false,
      } satisfies RigFrame,
      points: Array.from({ length: LINE_SEGMENTS + 1 }, () => new Vector3()),
      grip: new Vector3(),
      tip: new Vector3(),
      bobber: new Vector3(),
      mid: new Vector3(),
      aim: new Vector3(),
      color: new Color(),
      /** 직전 프레임의 단계. 전환되는 순간에만 터뜨릴 것들이 있다. */
      lastStage: "away" as FishingStage,
      /** 씨름 중 물보라를 뿌린 마지막 시각(ms). */
      lastSpray: 0,
    }),
    [],
  );

  useFrame((state) => {
    const yawGroup = yawRef.current;
    const pitchGroup = pitchRef.current;
    const bobber = bobberRef.current;
    const tip = tipRef.current;
    if (!yawGroup || !pitchGroup || !bobber || !tip) return;

    const nowMs = serverNow();
    const frame = scratch.frame;
    if (!source(frame, nowMs)) {
      yawGroup.visible = false;
      bobber.visible = false;
      lineObject.visible = false;
      return;
    }
    yawGroup.visible = true;
    lineObject.visible = true;

    const t = nowMs / 1000;
    const { stage, progress } = frame;

    // ── 서 있는 사람 기준으로 손 위치와 조준 방향 ──
    const aim = scratch.aim
      .set(landing.x - frame.x, 0, landing.z - frame.z)
      .normalize();
    // 로컬 -Z 가 물 쪽을 보도록.
    const aimYaw = Math.atan2(-aim.x, -aim.z);

    scratch.grip.set(
      frame.x + aim.x * GRIP_FORWARD - aim.z * GRIP_SIDE,
      frame.y + GRIP_UP,
      frame.z + aim.z * GRIP_FORWARD + aim.x * GRIP_SIDE,
    );
    yawGroup.position.copy(scratch.grip);
    yawGroup.rotation.y = aimYaw;

    /**
     * 낚싯대의 각도와 휨.
     *
     *  - 던지기: 앞의 30% 는 뒤로 젖히고(윈드업), 나머지에서 앞으로 후려친다
     *  - 입질: 끝이 톡톡 채인다
     *  - 씨름: 대를 세우고 끝은 물 쪽으로 활처럼 휜다. 세 번 펌핑한다
     */
    let pitch = 0.92;
    let bend = 0.1;

    if (stage === "casting") {
      const windup = clamp01(progress / 0.3);
      const whip = clamp01((progress - 0.3) / 0.7);
      pitch = -0.5 + windup * 0.4 + whip * 1.55;
      bend = 0.55 * Math.sin(whip * Math.PI) + 0.2 * (1 - windup);
    } else if (stage === "bite") {
      pitch = 0.86 + Math.sin(t * 24) * 0.05;
      bend = 0.34 + Math.abs(Math.sin(t * 21)) * 0.3;
    } else if (stage === "fighting") {
      const leap = clamp01((progress - (1 - LEAP_FRACTION)) / LEAP_FRACTION);
      // 펌핑 — 당겼다 놨다를 세 번.
      const pump = Math.sin(progress * Math.PI * 3);
      pitch = 0.5 - pump * 0.22 - leap * 0.55;
      bend = (1.15 + pump * 0.25) * (1 - leap * 0.75);
    } else if (stage === "waiting" || stage === "ready") {
      // 가만히 있어도 손이 미세하게 움직인다. 완전히 굳어 있으면 인형이다.
      pitch = 0.92 + Math.sin(t * 1.3) * 0.03;
      bend = 0.12 + Math.sin(t * 0.9) * 0.03;
    }

    pitchGroup.rotation.x = -pitch;
    for (let i = 0; i < ROD_JOINTS; i += 1) {
      const joint = jointRefs.current[i];
      if (joint) joint.rotation.x = bend * (BEND_SHARE[i] as number);
    }

    // 마디를 다 돌린 **뒤** 끝점의 월드 좌표를 읽는다. 순서가 바뀌면 한 프레임 늦는다.
    yawGroup.updateWorldMatrix(true, true);
    tip.getWorldPosition(scratch.tip);

    // ── 찌 ──
    const target = scratch.bobber;
    const catchMesh = catchRef.current;
    let catchVisible = false;

    if (stage === "casting") {
      target.lerpVectors(scratch.tip, landing, progress);
      // 던진 힘. 가운데서 가장 높이 뜬다.
      target.y += Math.sin(progress * Math.PI) * 2.6;
    } else if (stage === "ready" || stage === "missed" || stage === "caught") {
      // 대 끝에 매달려 달랑거린다.
      target.set(
        scratch.tip.x,
        scratch.tip.y - 0.45 + Math.sin(t * 2.4) * 0.04,
        scratch.tip.z,
      );
    } else if (stage === "fighting") {
      const leap = clamp01((progress - (1 - LEAP_FRACTION)) / LEAP_FRACTION);
      /**
       * 물속에서 좌우로 째다가 튀어나온다.
       *
       * 옆으로 긋는 폭이 점점 줄면서 사람 쪽으로 끌려온다 — 버티는 게 점점
       * 약해지는 것으로 읽힌다. 마지막에 수면을 뚫고 대 끝으로 날아온다.
       */
      const swing = Math.sin(progress * Math.PI * 5) * 1.5 * (1 - progress);
      const pulled = progress * 0.45;
      target.set(
        landing.x - aim.x * CAST_DISTANCE * pulled - aim.z * swing,
        -0.3 + Math.sin(t * 30) * 0.1,
        landing.z - aim.z * CAST_DISTANCE * pulled + aim.x * swing,
      );
      if (leap > 0) {
        // 수면에서 대 끝까지 포물선을 그리며 날아온다.
        const arc = leap * leap;
        target.lerp(scratch.tip, arc);
        target.y += Math.sin(leap * Math.PI) * 1.5;
        catchVisible = true;
      }
    } else {
      target.copy(landing);
      if (stage === "bite") {
        // 입질. 쑥 잠겼다 올라온다.
        target.y = -0.35 + Math.sin(t * 26) * 0.14;
      } else {
        // 파도에 까딱인다. 멈춰 있으면 물 위가 아니라 유리 위다.
        target.y = 0.06 + Math.sin(t * 2.1) * 0.07;
      }
    }
    bobber.position.copy(target);
    bobber.visible = true;

    if (catchMesh) {
      catchMesh.visible = catchVisible;
      if (catchVisible) {
        catchMesh.rotation.x = t * 9;
        catchMesh.rotation.z = t * 6;
        // 커피면 금빛, 꽝이면 흐린 은빛.
        (catchMesh.material as { color?: Color }).color?.set(
          frame.jackpot ? "#ffcf5c" : "#c9d6dc",
        );
      }
    }

    // ── 물보라 ──
    spray(scratch, frame, target, nowMs);

    // ── 낚싯줄 ──
    /**
     * 줄은 늘어진다. 손끝과 찌를 곧은 선으로 이으면 실이 아니라 막대다.
     * 팽팽할수록(씨름 중) 덜 늘어진다.
     */
    const sag =
      stage === "casting"
        ? 0.12
        : stage === "fighting" || stage === "bite"
          ? 0.06
          : 0.4;
    const mid = scratch.mid
      .addVectors(scratch.tip, target)
      .multiplyScalar(0.5)
      .setY(Math.min(scratch.tip.y, target.y) - sag);
    const curve = new CatmullRomCurve3([scratch.tip, mid, target]);
    /**
     * ⚠ 줄에도 **손으로** 곡률을 먹인다.
     *
     * 낚싯대와 찌는 CurvedMaterial 이라 셰이더가 알아서 내려주는데, 줄만 그냥
     * LineBasicMaterial 이라 안 휘었다. 30m 거리에서 낙차가 1.2m 라, 줄만 허공에
     * 붕 뜬 채로 그려졌다 — 세계 전체가 지키는 규칙에 선 하나가 빠진 셈이었다.
     * 점을 여기서 만들고 있으니 여기서 같은 식을 적용하는 게 가장 간단하다.
     */
    const camera = state.camera.position;
    const curvature = curvatureUniforms.uCurvature.value;
    for (let i = 0; i <= LINE_SEGMENTS; i += 1) {
      const point = curve.getPoint(
        i / LINE_SEGMENTS,
        scratch.points[i] as Vector3,
      );
      const d = Math.hypot(point.x - camera.x, point.z - camera.z);
      point.y -= d * d * curvature;
    }
    lineGeometry.setFromPoints(scratch.points);

    scratch.lastStage = stage;
  });

  return (
    <group>
      {/* 손에 들린 낚싯대. 방위 → 기울기 → 마디 순으로 겹친다. */}
      <group ref={yawRef}>
        <group ref={pitchRef}>
          <RodChain
            geometry={segmentGeometry}
            jointRefs={jointRefs}
            tipRef={tipRef}
          />
        </group>
      </group>

      {/*
        낚싯줄.
        JSX 의 <line> 은 R3F 에서 SVG 요소와 이름이 겹쳐 타입이 어긋난다.
        객체를 직접 만들어 붙이는 게 우회가 아니라 정공법이다.
      */}
      <primitive object={lineObject} />

      {/* 찌 */}
      <group ref={bobberRef}>
        <mesh castShadow>
          <sphereGeometry args={[0.2, 12, 10]} />
          <CurvedMaterial color="#ff4d4d" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.17, 0]}>
          <sphereGeometry args={[0.18, 12, 10]} />
          <CurvedMaterial color="#fdf6e8" roughness={0.5} />
        </mesh>
        {/* 물에 닿은 자리에 퍼지는 파문. 찌가 물 위에 있다는 유일한 단서다. */}
        <mesh position={[0, -0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 0.62, 20]} />
          <CurvedBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.35}
            depthWrite={false}
          />
        </mesh>
        {/*
          물 밖으로 딸려 나오는 것. 뭐가 걸렸는지는 카드가 말해주지만,
          **뭔가 나왔다**는 건 카드가 뜨기 전에 보여야 한다.
        */}
        <mesh ref={catchRef} position={[0, -0.34, 0]} visible={false}>
          <sphereGeometry args={[0.19, 10, 8]} />
          <CurvedMaterial color="#c9d6dc" roughness={0.35} metalness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * 마디를 재귀로 겹쳐 쌓는다.
 * 각 마디는 부모의 끝에 붙고, 부모가 돌면 그 아래가 통째로 따라 돈다 —
 * 그래서 조금씩 준 각도가 끝에서 곡선으로 모인다.
 */
function RodChain({
  geometry,
  jointRefs,
  tipRef,
  index = 0,
}: {
  geometry: CylinderGeometry[];
  jointRefs: { current: (Group | null)[] };
  tipRef: { current: Object3D | null };
  index?: number;
}) {
  if (index >= ROD_JOINTS) {
    return <object3D ref={tipRef} />;
  }
  return (
    <group
      ref={(node) => {
        jointRefs.current[index] = node;
      }}
    >
      <mesh
        geometry={geometry[index] as CylinderGeometry}
        position={[0, SEGMENT / 2, 0]}
        castShadow={index === 0}
      >
        <CurvedMaterial color="#4a3428" roughness={0.6} />
      </mesh>
      <group position={[0, SEGMENT, 0]}>
        <RodChain
          geometry={geometry}
          jointRefs={jointRefs}
          tipRef={tipRef}
          index={index + 1}
        />
      </group>
    </group>
  );
}

/** 물보라를 뿌린다. 단계가 바뀌는 순간과 씨름하는 동안. */
function spray(
  scratch: {
    lastStage: FishingStage;
    lastSpray: number;
    color: Color;
  },
  frame: RigFrame,
  bobber: Vector3,
  nowMs: number,
): void {
  const { stage } = frame;
  const changed = stage !== scratch.lastStage;
  const pick = frame.jackpot ? jackpotColor : splashColor;

  if (changed && (stage === "waiting" || stage === "bite")) {
    // 찌가 물에 떨어지는 순간, 그리고 쑥 잠기는 순간.
    emitParticles(
      splashSpecs(
        {
          x: bobber.x,
          y: 0,
          z: bobber.z,
          count: stage === "bite" ? 26 : 34,
          speed: stage === "bite" ? 3.4 : 4.2,
          spread: 0.85,
          color: pick(Math.random),
        },
        Math.random,
      ),
    );
  }

  if (stage !== "fighting") return;

  const leaping = frame.progress > 1 - LEAP_FRACTION;
  if (changed) {
    // 챈 순간 — 수면이 한 번 크게 터진다.
    emitParticles(
      splashSpecs(
        {
          x: bobber.x,
          y: 0,
          z: bobber.z,
          count: 90,
          speed: 6.5,
          spread: 1,
          color: pick(Math.random),
        },
        Math.random,
      ),
    );
  }

  // 물속을 째고 다니는 동안 흔적이 남는다. 매 프레임 뿌리면 낭비라 60ms 마다.
  if (nowMs - scratch.lastSpray > 60) {
    scratch.lastSpray = nowMs;
    emitParticles(
      splashSpecs(
        {
          x: bobber.x,
          y: 0,
          z: bobber.z,
          count: leaping ? 22 : 9,
          speed: leaping ? 5.5 : 2.6,
          spread: 0.9,
          color: pick(Math.random),
        },
        Math.random,
      ),
    );
  }
}
