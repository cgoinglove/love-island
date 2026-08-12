"use client";

import { type RefObject, useEffect, useMemo, useRef } from "react";
import type { Group, Mesh } from "three";
import type { AxisSource } from "@/game/core/input/keyboard";
import { createKeyboardInput } from "@/game/core/input/keyboard";
import { getInteractable } from "@/game/core/interactable";
import { elevationAt, SPAWN_POINT } from "@/game/core/island";
import { getIslandData } from "@/game/core/islandData";
import { findPath } from "@/game/core/nav/astar";
import type { PlayerController } from "@/game/core/playerControl";
import { useFixedStep } from "@/game/core/useFixedStep";
import { emitRoomEvent, getMyPlayerId } from "@/game/net/presence";
import { registerShoveHandler, useRoomEventStore } from "@/game/net/roomEvents";
import { useNickname } from "@/game/net/useNickname";
import { CurvedBasicMaterial } from "@/game/world/curvature";
import {
  SHOVE_ARC,
  SHOVE_COOLDOWN_MS,
  SHOVE_IMPULSE,
  SHOVE_LIFT,
  SHOVE_RANGE,
} from "@/shared/presence";
import type { Vec2XZ } from "@/shared/types";
import { CHARACTER_HEIGHT, CharacterModel } from "./CharacterModel";
import { ContactShadow } from "./ContactShadow";
import {
  clearPath,
  createPathFollower,
  followPath,
  isFollowing,
  setPath,
} from "./pathFollow";
import { applySitPose, applySwimPose, isSitting, splashInto } from "./poses";
import { SpeechBubble } from "./SpeechBubble";
import {
  applyImpulse,
  copyPlayerState,
  createPlayerState,
  DEFAULT_MOVE,
  interpolatePose,
  type MoveConfig,
  type MoveIntent,
  type PlayerState,
  type RenderPose,
  stepPlayer,
} from "./simulation";
import { ISLAND_WATER } from "./water";

const NO_INPUT: Vec2XZ = [0, 0];

/**
 * 스폰 지점을 조금 흩뜨린다.
 * 여러 명이 동시에 들어오면 정확히 같은 자리에 겹쳐 서서 한 명처럼 보인다.
 */
function spawnPoint(): Vec2XZ {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(Math.random()) * 1.6;
  return [
    SPAWN_POINT[0] + Math.cos(angle) * radius,
    SPAWN_POINT[1] + Math.sin(angle) * radius,
  ];
}

/** 웨이포인트에 이만큼 다가가면 통과한 것으로 본다. 캐릭터 반지름 근처가 적당하다. */
const WAYPOINT_RADIUS = 0.4;

export interface LocalPlayerProps {
  /** 카메라가 따라올 수 있도록 밖에서 넘겨받는다. */
  groupRef: RefObject<Group | null>;
  /** 탭 이동·상호작용·모바일 버튼이 캐릭터를 조종하는 통로. */
  controllerRef: RefObject<PlayerController | null>;
  config?: MoveConfig;
}

/**
 * 내 캐릭터.
 *
 * ── 이 컴포넌트의 존재 이유 절반은 "여기 useState 가 하나도 없다"는 것이다. ──
 * 위치는 React 가 모르는 값이다. 시뮬레이션 상태는 ref 안의 평범한 객체이고,
 * 매 프레임 group.position 을 직접 mutate 한다.
 * useState 로 60Hz 위치를 관리하면 초당 60번 리렌더가 돌면서 프레임을 통째로 잡아먹는다.
 * (기획서 §4.1)
 */
export function LocalPlayer({
  groupRef,
  controllerRef,
  config = DEFAULT_MOVE,
}: LocalPlayerProps) {
  const markerRef = useRef<Mesh>(null);
  const bodyRef = useRef<Group>(null);
  const shadowRef = useRef<Group>(null);

  /**
   * 내 말풍선. reflectOwnEvent 가 내 id 로 store 에 넣어주므로 같은 키로 읽는다.
   * 이 세 줄이 없어서 "채팅을 쳐도 말풍선이 안 나온다"였다.
   */
  const myId = useMemo(() => getMyPlayerId(), []);
  const myBubble = useRoomEventStore((state) => state.bubbles[myId]);
  const myNickname = useNickname();
  const inputRef = useRef<AxisSource | null>(null);
  const { navGrid } = getIslandData();

  // 매 프레임 읽히는 값들은 전부 ref 뒤에 둔다.
  const configRef = useRef(config);
  configRef.current = config;

  const followerRef = useRef<ReturnType<typeof createPathFollower> | null>(
    null,
  );
  if (followerRef.current === null) followerRef.current = createPathFollower();
  const follower = followerRef.current;

  /**
   * 고정 스텝 두 개(직전/현재)와 보간 결과 하나.
   * useMemo 가 아니라 useRef 인 이유: useMemo 는 React 가 언제든 버릴 수 있다고 문서에 적혀 있다.
   * 시뮬레이션 상태가 리셋되면 캐릭터가 스폰 지점으로 순간이동한다.
   */
  const simRef = useRef<{
    previous: PlayerState;
    current: PlayerState;
    pose: RenderPose;
    controllerPose: { x: number; z: number; yaw: number; y: number };
    intent: MoveIntent;
    /** 모바일 버튼·조이스틱이 밀어 넣는 값. 키보드와 합쳐진다. */
    virtual: { x: number; z: number; jump: boolean; sprint: boolean };
    /** 밀치기 연타 방지와 팔 휘두르는 모션에 쓴다. */
    lastShoveAt: number;
    /** 직전 프레임에 물에 있었나. 빠지는 **순간**에만 물보라를 터뜨리려고 기억한다. */
    wasSwimming: boolean;
    /** 탈것이 밀어 넣는 자리. null 이면 제 발로 다닌다. */
    carried: { x: number; z: number; y: number; yaw: number } | null;
  } | null>(null);
  if (simRef.current === null) {
    const [startX, startZ] = spawnPoint();
    simRef.current = {
      previous: createPlayerState(startX, startZ),
      current: createPlayerState(startX, startZ),
      pose: { x: startX, z: startZ, y: 0, yaw: 0 },
      controllerPose: { x: startX, z: startZ, yaw: 0, y: 0 },
      intent: { axis: [0, 0], jump: false, sprint: false },
      virtual: { x: 0, z: 0, jump: false, sprint: false },
      lastShoveAt: -9999,
      wasSwimming: false,
      carried: null,
    };
  }
  const sim = simRef.current;

  useEffect(() => {
    const source = createKeyboardInput();
    inputRef.current = source;
    return () => {
      source.dispose();
      inputRef.current = null;
    };
  }, []);

  /**
   * 남이 나를 밀쳤을 때. **판정은 맞는 쪽에서 한다.**
   * 때린 사람이 "너 이만큼 밀렸어"라고 통보하면 남의 몸을 마음대로 옮길 수 있게 된다.
   */
  useEffect(() => {
    return registerShoveHandler((event) => {
      const dx = sim.current.x - event.x;
      const dz = sim.current.z - event.z;
      const distance = Math.hypot(dx, dz);
      if (distance > SHOVE_RANGE || distance < 1e-4) return;

      // 때린 사람이 나를 보고 있었나. 등 뒤에서 휘두른 팔에 맞을 이유는 없다.
      const facingX = -Math.sin(event.yaw);
      const facingZ = -Math.cos(event.yaw);
      const dot = (dx / distance) * facingX + (dz / distance) * facingZ;
      if (Math.acos(Math.min(1, Math.max(-1, dot))) > SHOVE_ARC / 2) return;

      applyImpulse(
        sim.current,
        (dx / distance) * SHOVE_IMPULSE,
        (dz / distance) * SHOVE_IMPULSE,
        SHOVE_LIFT,
      );
      // 밀려나는 중에 경로 추종이 계속되면 도로 끌려간다.
      clearPath(follower);
    });
  }, [sim, follower]);

  // 밖에서 캐릭터를 조종할 손잡이를 걸어둔다.
  useEffect(() => {
    controllerRef.current = {
      moveTo(x, z, actionId = null) {
        const path = findPath(navGrid, [sim.current.x, sim.current.z], [x, z]);
        // 경로가 없으면(섬 반대편의 고립된 땅 등) 아무 일도 하지 않는다.
        // 아무 데나 걸어가는 것보다 가만히 있는 편이 덜 이상하다.
        if (path.length === 0) return;
        setPath(follower, path, actionId);
      },
      pose() {
        sim.controllerPose.x = sim.current.x;
        sim.controllerPose.z = sim.current.z;
        sim.controllerPose.yaw = sim.current.yaw;
        // 높이도 실어 보낸다. 이게 빠지면 남의 화면에서 내 점프와 넉백이 사라진다.
        sim.controllerPose.y = sim.current.y;
        return sim.controllerPose;
      },
      setVirtualAxis(x, z) {
        sim.virtual.x = x;
        sim.virtual.z = z;
        // 조이스틱을 잡으면 목적지로 끌려가지 않는다.
        if (x !== 0 || z !== 0) clearPath(follower);
      },
      setVirtualJump(down) {
        sim.virtual.jump = down;
      },
      setVirtualSprint(down) {
        sim.virtual.sprint = down;
      },
      carry(pose) {
        sim.carried = pose;
        if (pose) clearPath(follower);
      },
      place(x, z, yaw) {
        // 두 스텝을 모두 옮긴다. 하나만 고치면 보간이 이전 자리에서 끌고 온다.
        for (const step of [sim.current, sim.previous]) {
          step.x = x;
          step.z = z;
          step.yaw = yaw;
          step.vx = 0;
          step.vz = 0;
        }
        clearPath(follower);
      },
      shove() {
        const now = performance.now();
        if (now - sim.lastShoveAt < SHOVE_COOLDOWN_MS) return false;
        sim.lastShoveAt = now;
        // 사건만 뿌린다. 누가 맞았는지는 각자의 클라이언트가 판정한다.
        emitRoomEvent("shove", "");
        return true;
      },
    };
    return () => {
      controllerRef.current = null;
    };
  }, [controllerRef, navGrid, follower, sim]);

  useFixedStep(
    (dt) => {
      copyPlayerState(sim.current, sim.previous);

      /**
       * 탈것에 타고 있으면 시뮬레이션을 통째로 건너뛴다.
       *
       * 중력을 그대로 두고 위치만 덮어쓰면 매 스텝 떨어지려는 속도가 쌓이다가,
       * 내리는 순간 그 속도가 한꺼번에 터져 사람이 땅으로 꽂힌다.
       */
      const carried = sim.carried;
      if (carried) {
        sim.current.x = carried.x;
        sim.current.z = carried.z;
        sim.current.y = carried.y;
        sim.current.yaw = carried.yaw;
        sim.current.vx = 0;
        sim.current.vz = 0;
        sim.current.vy = 0;
        sim.current.grounded = true;
        sim.current.swimming = false;
        return;
      }

      const source = inputRef.current;
      const keyboard = source?.axis() ?? NO_INPUT;
      const axisX = keyboard[0] + sim.virtual.x;
      const axisZ = keyboard[1] + sim.virtual.z;
      const hasManualInput = axisX !== 0 || axisZ !== 0;

      // 직접 조작하는 순간 경로 추종은 취소된다. 두 입력이 싸우면
      // 캐릭터가 목적지로 끌려가면서 조작이 안 먹는 것처럼 느껴진다.
      if (hasManualInput && isFollowing(follower)) clearPath(follower);

      if (hasManualInput) {
        sim.intent.axis = [axisX, axisZ];
      } else {
        sim.intent.axis = followPath(
          follower,
          sim.current.x,
          sim.current.z,
          WAYPOINT_RADIUS,
        );
      }
      sim.intent.jump = (source?.jump() ?? false) || sim.virtual.jump;
      sim.intent.sprint = (source?.sprint() ?? false) || sim.virtual.sprint;

      stepPlayer(
        sim.current,
        sim.intent,
        dt,
        configRef.current,
        navGrid,
        ISLAND_WATER,
      );

      if (follower.arrived) {
        follower.arrived = false;
        const actionId = follower.pendingAction;
        follower.pendingAction = null;
        if (actionId !== null) getInteractable(actionId)?.onInteract();
      }
    },
    (alpha) => {
      const group = groupRef.current;
      if (!group) return;

      /**
       * 물에 빠지는 순간 한 번 크게 튄다.
       *
       * 밀치기가 처음으로 **결과**를 낳는 지점이다 — 그전까지 밀치기는
       * 상대를 조금 밀어내고 끝이었다. 물보라가 터지고 허우적대는 게 보이면
       * 그제서야 밀친 쪽도 밀린 쪽도 무슨 일이 일어났는지 안다.
       */
      if (sim.current.swimming !== sim.wasSwimming) {
        sim.wasSwimming = sim.current.swimming;
        if (sim.current.swimming) splashInto(sim.current.x, sim.current.z);
      }

      interpolatePose(sim.previous, sim.current, alpha, sim.pose);
      // 언덕을 오르내리도록 지형 높이에 붙이고, 점프한 만큼 더 띄운다.
      // 이동 판정은 평면에서 하고 높이는 렌더링에서만 얹는다 — 그래서 A* 가 2D 로 남는다.
      group.position.set(
        sim.pose.x,
        elevationAt(sim.pose.x, sim.pose.z) + sim.pose.y,
        sim.pose.z,
      );
      group.rotation.y = sim.pose.yaw;

      /**
       * 몸짓. 위치는 물리가 정하지만 "살아 있음"은 여기서 나온다.
       *  - 걸으면 좌우로 잘게 흔들리고 위아래로 통통 튄다
       *  - 속도에 비례해 앞으로 기운다 (달리면 더 숙인다)
       *  - 밀치기는 0.25초 동안 확 숙였다 펴는 모션이 덮어쓴다
       */
      const body = bodyRef.current;
      if (body) {
        const now = performance.now();
        const shoveT = (now - sim.lastShoveAt) / 250;
        const shove = shoveT < 1 ? -Math.sin(shoveT * Math.PI) * 0.55 : 0;

        const speed = Math.hypot(sim.current.vx, sim.current.vz);
        const stride = Math.min(speed / 3.4, 1.6);
        const walkPhase = now * 0.014;

        if (isSitting(myId)) {
          applySitPose(body);
        } else if (sim.current.swimming) {
          applySwimPose(body, now / 1000);
        } else {
          body.rotation.x = shove - 0.06 * stride;
          body.rotation.z = Math.sin(walkPhase) * 0.055 * stride;
          body.position.y = sim.current.grounded
            ? Math.abs(Math.sin(walkPhase)) * 0.07 * stride
            : 0.04; // 공중에선 몸을 살짝 움츠린다
        }
      }

      /**
       * 그룹 전체가 점프 높이만큼 올라가므로, 그림자는 그만큼 되돌려 땅에 붙인다.
       * 높이 뜰수록 흐리고 넓어진다 — 이게 있어야 점프가 "높다"고 읽힌다.
       */
      const shadow = shadowRef.current;
      if (shadow) {
        shadow.position.y = -sim.pose.y + 0.02;
        const spread = 1 + sim.pose.y * 0.28;
        shadow.scale.set(spread, 1, spread);
      }

      const marker = markerRef.current;
      if (!marker) return;
      const destination = follower.path[follower.path.length - 1];
      if (destination === undefined) {
        marker.visible = false;
      } else {
        marker.visible = true;
        marker.position.set(
          destination[0],
          elevationAt(destination[0], destination[1]) + 0.03,
          destination[1],
        );
      }
    },
  );

  return (
    <>
      <group ref={groupRef}>
        {/*
          접촉 그림자는 groupRef 안에 있지만 bodyRef **밖**이다.
          몸이 점프로 떠오르고 걸음으로 흔들려도 그림자는 발 아래 땅에 남는다 —
          이 분리가 "떠 있는 느낌"을 없애는 핵심이다.
        */}
        <group ref={shadowRef}>
          <ContactShadow />
        </group>
        <group ref={bodyRef}>
          <CharacterModel seed={myId} />
        </group>

        <SpeechBubble
          y={CHARACTER_HEIGHT + 0.28}
          nickname={myNickname}
          bubble={myBubble}
          isSelf
        />
      </group>

      {/* 목적지 표시. 탭했는데 아무 반응이 없으면 안 눌린 줄 안다. */}
      <mesh ref={markerRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.26, 0.38, 24]} />
        {/* 바닥에 그리는 것이므로 지형과 같은 곡률을 타야 제자리에 놓인다. */}
        <CurvedBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.75}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}
