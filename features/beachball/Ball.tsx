"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  type BufferGeometry,
  CylinderGeometry,
  LatheGeometry,
  type Mesh,
  Vector2,
  Vector3,
} from "three";
import { elevationAt } from "@/game/core/island";
import { usePlayerController } from "@/game/core/playerControl";
import { emitRoomEvent } from "@/game/net/presence";
import { CurvedMaterial } from "@/game/world/curvature";
import { mergeColored, type Piece } from "@/game/world/meshKit";
import {
  BALL_HOME,
  BALL_RADIUS,
  GOAL_CENTER_X,
  GOAL_HALF,
  GOAL_HEIGHT,
  GOAL_Z,
  KICK_COOLDOWN,
  KICK_REACH,
} from "./constants";
import {
  type BallState,
  ballAtRest,
  crossedGoal,
  kickBall,
  STEP,
  stepBall,
} from "./physics";
import { announceKick, ball, kicker, useBallEvents } from "./session";

/**
 * 비치볼.
 *
 * ── 왜 이걸 넣었나 ──
 * 이 섬에서 **사람과 사람이 하는 일**은 말 걸기와 밀치기뿐이었다. 나머지는
 * 전부 각자 보는 것들이다 — 같이 볼 수는 있어도 같이 하는 건 아니다.
 * 공은 규칙을 설명할 필요가 없는 유일한 물건이라, 두 사람이 만나면
 * 아무 안내 없이도 놀이가 시작된다.
 *
 * ── 통신은 발길질 한 번에 한 줄 ──
 * 공의 자리를 계속 뿌리지 않는다. 찰 때 **상태를 통째로** 한 번 보내고,
 * 그 뒤로는 각자 같은 계산을 돌린다(physics.ts 의 고정 걸음). 다음 발길질
 * 전까지 통신은 0 이고, 어긋나도 다음 발길질이 모두를 다시 맞춘다.
 *
 * 심판도 없다. 골을 판정하는 건 **마지막으로 찬 사람의 화면**이고, 그 사람이
 * 축포를 쏜다 — 모두가 판정하면 사람 수만큼 터진다.
 */

function buildBall(): BufferGeometry {
  const SHELL = ["#f4ede0", "#e8734a", "#3f8fd0", "#f2c14a"] as const;
  const GORES = 8;

  // 공은 가로줄이 아니라 **세로 조각**으로 칠해야 굴러가는 게 보인다.
  const profile: Vector2[] = [];
  for (let i = 0; i <= 8; i += 1) {
    const angle = -Math.PI / 2 + (Math.PI * i) / 8;
    profile.push(
      new Vector2(Math.cos(angle) * BALL_RADIUS, Math.sin(angle) * BALL_RADIUS),
    );
  }

  const pieces: Piece[] = [];
  for (let i = 0; i < GORES; i += 1) {
    const slice = (Math.PI * 2) / GORES;
    pieces.push({
      geometry: new LatheGeometry(profile, 4, i * slice, slice),
      color: SHELL[i % SHELL.length] ?? "#f4ede0",
    });
  }
  return mergeColored(pieces);
}

/** 골대 — 떠내려온 나무 두 개와 가로대. */
function buildGoal(): BufferGeometry {
  const WOOD = "#c8a06a";
  const post = () => new CylinderGeometry(0.13, 0.16, GOAL_HEIGHT, 7);

  const pieces: Piece[] = [
    {
      geometry: post(),
      color: WOOD,
      position: [-GOAL_HALF, GOAL_HEIGHT / 2, 0],
      rotation: [0, 0, 0.03],
    },
    {
      geometry: post(),
      color: WOOD,
      position: [GOAL_HALF, GOAL_HEIGHT / 2, 0],
      rotation: [0, 0, -0.03],
    },
    {
      geometry: new CylinderGeometry(0.11, 0.11, GOAL_HALF * 2 + 0.3, 7),
      color: WOOD,
      position: [0, GOAL_HEIGHT, 0],
      rotation: [0, 0, Math.PI / 2],
    },
  ];
  return mergeColored(pieces);
}

const HOME: BallState = {
  x: BALL_HOME[0],
  y: BALL_RADIUS,
  z: BALL_HOME[1],
  vx: 0,
  vy: 0,
  vz: 0,
};

export function BeachBall() {
  const geometry = useMemo(buildBall, []);
  const goalGeometry = useMemo(buildGoal, []);
  const meshRef = useRef<Mesh>(null);
  const controller = usePlayerController();
  useBallEvents();

  /** 남은 시간을 고정 걸음으로 쪼개고 남은 자투리. */
  const spare = useRef(0);
  const kickedAt = useRef(0);
  /** 골이 들어간 뒤 공을 제자리에 돌려놓을 시각(초). 0 이면 예정 없음. */
  const resetAt = useRef(0);
  const wasAt = useRef({ x: 0, z: 0 });
  const spin = useMemo(() => new Vector3(), []);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const now = state.clock.elapsedTime;
    const pose = controller.current?.pose();

    /**
     * 고정 걸음.
     *
     * ⚠ delta 를 그대로 쓰면 안 된다. 60fps 인 사람과 30fps 인 사람이 같은
     *   적분을 돌려도 결과가 갈라져서, 몇 초만 지나면 두 화면의 공이 다른
     *   자리에 있다. 걸음을 고정하고 남는 시간만 다음 프레임으로 넘긴다.
     */
    spare.current = Math.min(spare.current + delta, 0.25);
    while (spare.current >= STEP) {
      spare.current -= STEP;
      const before = { ...ball };
      const next = stepBall(ball, elevationAt);
      Object.assign(ball, next);

      // 골은 마지막으로 찬 사람만 판정한다. 모두가 하면 사람 수만큼 터진다.
      if (kicker.mine && resetAt.current === 0 && crossedGoal(before, next)) {
        resetAt.current = now + 1.6;
        emitRoomEvent("shell", `1.5,${GOAL_CENTER_X},${GOAL_Z - 1}`);
      }
    }

    // 발로 찬다 — 부딪힌 자리가 방향을 정한다.
    if (pose && now - kickedAt.current > KICK_COOLDOWN) {
      const reach = Math.hypot(pose.x - ball.x, pose.z - ball.z);
      if (reach < KICK_REACH + BALL_RADIUS) {
        const speed =
          Math.hypot(pose.x - wasAt.current.x, pose.z - wasAt.current.z) /
          Math.max(delta, 0.001);
        kickedAt.current = now;
        announceKick(kickBall(ball, pose, speed));
      }
    }
    if (pose) {
      wasAt.current.x = pose.x;
      wasAt.current.z = pose.z;
    }

    // 골 뒤에는 제자리로. 알리는 것도 찬 사람 몫이다.
    if (resetAt.current !== 0 && now > resetAt.current) {
      resetAt.current = 0;
      announceKick({ ...HOME });
    }

    mesh.position.set(ball.x, ball.y, ball.z);

    /**
     * 굴러가는 회전. 진행 방향에 **직각**인 축으로 돈다.
     * 이게 없으면 공이 미끄러지는 구슬로 보인다 — 굴러야 공이다.
     */
    const roll = Math.hypot(ball.vx, ball.vz);
    if (roll > 0.02) {
      spin.set(ball.vz, 0, -ball.vx).normalize();
      mesh.rotateOnWorldAxis(spin, (roll / BALL_RADIUS) * delta);
    }
  });

  return (
    <>
      <mesh ref={meshRef} geometry={geometry} castShadow>
        <CurvedMaterial vertexColors roughness={0.5} />
      </mesh>
      <mesh
        geometry={goalGeometry}
        position={[GOAL_CENTER_X, elevationAt(GOAL_CENTER_X, GOAL_Z), GOAL_Z]}
        castShadow
      >
        <CurvedMaterial vertexColors roughness={0.75} />
      </mesh>
    </>
  );
}

/** 공이 멈춰 있는지 — 시험과 디버깅용. */
export function ballIsResting(): boolean {
  return ballAtRest(ball, elevationAt(ball.x, ball.z));
}
