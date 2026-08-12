"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  type Group,
  type Mesh,
  MeshBasicMaterial,
} from "three";
import CustomShaderMaterial from "three-custom-shader-material";
import { serverNow } from "@/game/net/serverClock";
import {
  CurvedBasicMaterial,
  CurvedMaterial,
  curvatureUniforms,
} from "@/game/world/curvature";
import { skyState } from "@/game/world/dayNight";
import { emitParticles } from "@/game/world/particleBus";
import {
  BEAM_LENGTH,
  BEAM_PITCH,
  beamReach,
  buildBoat,
  buildBoatBeam,
  buildBoatLights,
  buildFarIsland,
  buildFish,
  buildLightPool,
  buildSchool,
  buildSharkBody,
  buildSharkTail,
  LAMP_Y,
  SHARK_TAIL_JOINT,
} from "@/game/world/seaProps";
import {
  boatsAt,
  finsAt,
  jumpHeightAt,
  jumpPitchAt,
  jumpsAt,
  schoolAt,
} from "@/game/world/seaTraffic";
import {
  BEAM_FRAGMENT,
  BEAM_VERTEX,
  LIGHT_POOL_FRAGMENT,
  LIGHT_POOL_VERTEX,
} from "@/game/world/shaders";
import { splashColor, splashSpecs } from "@/game/world/splash";

/**
 * 바다에 사는 것들 — 지나가는 배, 상어, 물고기 떼, 튀어오르는 물고기,
 * 그리고 수평선 위의 먼 섬.
 *
 * ── 왜 필요했나 ──
 * 이 섬의 바다는 **아무 일도 안 일어나는 파란 면**이었다. 파도 셰이더가 돌고
 * 물거품이 해안선을 따라다녔지만 그건 배경이지 사건이 아니다. 앉아서 같이
 * 보는 자리를 만들어 놓고 볼 게 밤 폭죽뿐이면, 낮에 앉은 사람은 3분을 기다린다.
 *
 * 자리는 전부 시계에서 나온다(seaTraffic.ts). 옆 사람과 "저 배 봐" 가 성립하려면
 * 그 배가 두 화면에서 같은 자리에 있어야 하고, 그건 통신 없이도 된다.
 * 모양은 seaProps.ts 에 있다 — 여기는 언제 어디에 놓을지만 정한다.
 */

/** 이 밝기 아래로 떨어지면 등을 켠다. 0 = 완전한 밤, 1 = 한낮. */
const LAMP_THRESHOLD = 0.32;

/**
 * 빛이 **바다보다 나중에** 그려지게 하는 순서.
 *
 * ⚠ 이게 없으면 물이 빛을 덮는다. 바다는 반투명 메시 하나인데, three 는
 *   반투명을 바운딩 구의 중심까지의 거리로 정렬한다 — 바다의 중심은 섬 한복판이라
 *   늘 "가까운 것"으로 취급되어 **먼바다의 빛 웅덩이보다 나중에** 그려진다.
 *   실제로 빛줄기 아랫부분과 물에 비친 빛이 통째로 물에 먹혔다.
 *   순서를 직접 주면 그 정렬을 건너뛴다. 깊이는 여전히 읽으므로 배에는 가려진다.
 */
const LIGHT_ORDER = 6;

/** 빛줄기가 좌우로 훑는 폭(라디안)과 한 번 왕복하는 데 걸리는 시간(초). */
const SWEEP_ARC = 0.5;
const SWEEP_PERIOD = 13;

// ── 배 ──────────────────────────────────────────────

function Boats() {
  const geometry = useMemo(buildBoat, []);
  const lightGeometry = useMemo(buildBoatLights, []);
  const beamGeometry = useMemo(buildBoatBeam, []);
  const poolGeometry = useMemo(buildLightPool, []);
  /**
   * 곡률은 세계와 **같은 객체**를 공유한다. 빛줄기만 안 휘면 배는 수평선 아래로
   * 내려가는데 빛만 제자리에 남는다 — 접촉 그림자에서 이미 겪은 실수다.
   */
  const beamUniforms = useMemo(
    () => ({
      ...curvatureUniforms,
      uBeamLength: { value: BEAM_LENGTH },
      uBeamColor: { value: new Color("#ffe7b4") },
      uBeamStrength: { value: 0.36 },
    }),
    [],
  );
  const poolUniforms = useMemo(
    () => ({
      ...curvatureUniforms,
      uPoolColor: { value: new Color("#ffdfa2") },
      uPoolStrength: { value: 0.62 },
    }),
    [],
  );
  const groupRef = useRef<Group>(null);
  const lightRef = useRef<Group>(null);
  const beamRef = useRef<Group>(null);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;

    const boat = boatsAt(serverNow() / 1000)[0];
    if (!boat) return;
    group.position.set(boat.x, boat.bob, boat.z);
    group.rotation.set(0, boat.yaw, boat.roll);
    group.scale.setScalar(boat.scale);

    // 밤에만 등을 켠다. 낮에 켜진 등은 그냥 노란 점이다.
    const lit = skyState.daylight < LAMP_THRESHOLD;
    const lights = lightRef.current;
    if (lights && lights.visible !== lit) lights.visible = lit;

    /**
     * 빛줄기가 좌우로 훑는다.
     *
     * 공유 시계로 도니 **옆 사람 화면에서도 같은 쪽을 비춘다** — 배 위치만
     * 같고 불빛이 따로 놀면 같이 보는 맛이 없다.
     */
    const sweep = beamRef.current;
    if (sweep) {
      sweep.rotation.y =
        Math.sin((serverNow() / 1000) * ((Math.PI * 2) / SWEEP_PERIOD)) *
        SWEEP_ARC;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={geometry} castShadow>
        <CurvedMaterial vertexColors roughness={0.62} />
      </mesh>

      {/*
        끌고 가는 물자국. 배가 **움직인다**는 걸 알려주는 유일한 단서다 —
        이게 없으면 아무리 잘 깎아도 물 위에 놓아둔 모형처럼 보인다.
        선체와 머티리얼을 못 합친다: 정점 색은 확산광만 바꾸므로 투명도는 따로 간다.
      */}
      <mesh position={[0, 0.03, 5.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.1, 9.5]} />
        <CurvedBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.2}
          depthWrite={false}
        />
      </mesh>

      {/*
        뱃등.

        ⚠ 실제 광원(pointLight)이 아니다. 폭죽에서 이미 배운 것 —
          밤바다에 광원을 늘리면 모든 머티리얼의 조명 계산이 그만큼 무거워지고,
          정작 화면에서는 색이 날아간 흰 얼룩만 남는다. 스스로 빛나는 재질이
          40m 밖에서는 더 등처럼 보인다.
      */}
      <group ref={lightRef} visible={false}>
        <mesh geometry={lightGeometry}>
          <CurvedBasicMaterial vertexColors />
        </mesh>
        {/* 등 주위에 번지는 빛. 이게 없으면 등이 아니라 노란 점이다. */}
        <mesh position={[0, LAMP_Y, 0.1]}>
          <sphereGeometry args={[0.5, 10, 8]} />
          <CurvedBasicMaterial
            color="#ffd76b"
            transparent
            opacity={0.28}
            depthWrite={false}
          />
        </mesh>

        {/*
          등대처럼 뻗는 빛줄기와 물 위에 지는 빛 웅덩이.

          ⚠ 둘 다 **더하기 합성**이다. 이 세계의 다른 반투명은 전부 보통 합성인데,
            그건 대낮 하늘 위에서 색이 다 날아가기 때문이었다(폭죽에서 배운 것).
            빛줄기는 밤에만 켜지고 배경이 어두운 물과 밤하늘이라, 여기서는
            더하기가 맞다 — 빛은 덮는 게 아니라 더해지는 것이다.

          깊이는 읽되 쓰지 않는다. 섬이나 배에는 가려지고 자기들끼리는 안 가린다.
        */}
        <group ref={beamRef} position={[0, LAMP_Y, 0.1]}>
          {/*
            ⚠ 각도가 **음수**다. 원뿔은 -Z 로 뻗어 있고, X 축 양의 회전은 그 축을
              위로 들어 올린다 — 부호를 뒤집어 놓으면 등대가 물이 아니라 밤하늘을
              비춘다. 실제로 그렇게 뒀다가 하늘로 쏘는 서치라이트가 됐다.
          */}
          <mesh
            geometry={beamGeometry}
            rotation={[-BEAM_PITCH, 0, 0]}
            renderOrder={LIGHT_ORDER}
          >
            <CustomShaderMaterial
              baseMaterial={MeshBasicMaterial}
              vertexShader={BEAM_VERTEX}
              fragmentShader={BEAM_FRAGMENT}
              uniforms={beamUniforms}
              transparent
              depthWrite={false}
              blending={AdditiveBlending}
              // 안쪽 벽과 바깥쪽 벽이 겹쳐 더해져야 속이 찬 빛기둥이 된다.
              side={DoubleSide}
            />
          </mesh>
          <mesh
            geometry={poolGeometry}
            position={[0, -LAMP_Y + 0.35, -beamReach()]}
            renderOrder={LIGHT_ORDER}
          >
            <CustomShaderMaterial
              baseMaterial={MeshBasicMaterial}
              vertexShader={LIGHT_POOL_VERTEX}
              fragmentShader={LIGHT_POOL_FRAGMENT}
              uniforms={poolUniforms}
              transparent
              depthWrite={false}
              blending={AdditiveBlending}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
}

// ── 상어 ────────────────────────────────────────────

/**
 * 상어.
 *
 * ⚠ 예전엔 **등지느러미 하나**가 전부였다. 물 밖으로 나오는 게 그것뿐이니
 *   그럴듯한 절약처럼 보였는데, 이 세계의 물은 투명하다 — 지느러미 아래로
 *   아무것도 없는 게 그대로 다 보였다. 물속을 안 만드는 건 여기서 안 통한다.
 *
 * 몸통과 꼬리를 나눠 굽는다. 꼬리가 흔들려야 헤엄치는 것으로 보이고,
 * 통째로 병합하면 물속을 미끄러지는 판때기가 된다.
 */
function Sharks() {
  const body = useMemo(buildSharkBody, []);
  const tail = useMemo(buildSharkTail, []);
  const groups = useRef<(Group | null)[]>([]);
  const tails = useRef<(Group | null)[]>([]);

  useFrame((state) => {
    const seconds = serverNow() / 1000;
    const clock = state.clock.elapsedTime;

    for (const fin of finsAt(seconds)) {
      const group = groups.current[fin.id];
      if (group) {
        /**
         * 몸통은 물속에 잠기고 등지느러미만 수면 위로 나온다.
         * 물결에 오르내리게 두지 않으면 물 위에 꽂아둔 표지판처럼 보인다.
         */
        group.position.set(
          fin.x,
          -0.95 + Math.sin(clock * 1.1 + fin.id * 2) * 0.07,
          fin.z,
        );
        group.rotation.y = fin.yaw;
        // 헤엄치며 몸을 좌우로 눕힌다.
        group.rotation.z = Math.sin(clock * 1.7 + fin.id) * 0.06;
      }
      const swing = tails.current[fin.id];
      if (swing) swing.rotation.y = Math.sin(clock * 2.1 + fin.id * 1.7) * 0.36;
    }
  });

  return (
    <>
      {[0, 1].map((id) => (
        <group
          key={id}
          ref={(node) => {
            groups.current[id] = node;
          }}
        >
          <mesh geometry={body} castShadow>
            <CurvedMaterial vertexColors roughness={0.45} />
          </mesh>
          <group
            ref={(node) => {
              tails.current[id] = node;
            }}
            position={[0, 0, SHARK_TAIL_JOINT]}
          >
            <mesh geometry={tail}>
              <CurvedMaterial vertexColors roughness={0.45} />
            </mesh>
          </group>
        </group>
      ))}
    </>
  );
}

// ── 물고기 떼 ────────────────────────────────────────

function School() {
  const geometry = useMemo(buildSchool, []);
  const groupRef = useRef<Group>(null);

  useFrame((state) => {
    const group = groupRef.current;
    if (!group) return;
    const spot = schoolAt(serverNow() / 1000);
    const clock = state.clock.elapsedTime;
    // 얕은 물 바로 아래. 더 깊이 넣으면 바닥색에 묻힌다.
    group.position.set(spot.x, -0.85 + Math.sin(clock * 1.3) * 0.12, spot.z);
    group.rotation.set(0, spot.yaw + Math.sin(clock * 0.7) * 0.12, 0);
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={geometry}>
        <CurvedMaterial vertexColors roughness={0.4} />
      </mesh>
    </group>
  );
}

// ── 튀어오르는 물고기 ────────────────────────────────

function splash(x: number, z: number, count: number, speed: number): void {
  emitParticles(
    splashSpecs(
      {
        x,
        y: 0,
        z,
        count,
        speed,
        spread: 0.8,
        color: splashColor(Math.random),
      },
      Math.random,
    ),
  );
}

function JumpingFish() {
  const geometry = useMemo(buildFish, []);
  const meshRef = useRef<Mesh>(null);
  /** 이미 물보라를 낸 도약. 나올 때와 들어갈 때 한 번씩만 튀겨야 한다. */
  const splashed = useRef({ key: Number.NaN, out: false, sunk: false });

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const seconds = serverNow() / 1000;
    const jump = jumpsAt(seconds)[0];
    if (!jump) {
      if (mesh.visible) mesh.visible = false;
      return;
    }

    mesh.visible = true;
    mesh.position.set(jump.x, jumpHeightAt(jump.progress), jump.z);
    mesh.rotation.set(jumpPitchAt(jump.progress), jump.yaw, 0);

    /**
     * 나올 때와 들어갈 때 물이 튄다.
     *
     * 이게 없으면 물고기가 수면을 **통과**하는 것으로 보인다 — 물이 있다는 걸
     * 알려주는 건 물고기가 아니라 그 순간에 터지는 물보라다. 낚시가 쓰는 것과
     * 같은 함수, 같은 링버퍼를 탄다.
     */
    const mark = splashed.current;
    if (mark.key !== jump.key) {
      mark.key = jump.key;
      mark.out = false;
      mark.sunk = false;
    }
    if (!mark.out) {
      mark.out = true;
      splash(jump.x, jump.z, 26, 3.4);
    }
    if (!mark.sunk && jump.progress > 0.93) {
      mark.sunk = true;
      splash(jump.x, jump.z, 34, 3);
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry} visible={false} castShadow>
      <CurvedMaterial vertexColors roughness={0.35} metalness={0.2} />
    </mesh>
  );
}

// ── 저 멀리 섬 ──────────────────────────────────────

/**
 * 수평선 위의 섬 둘.
 *
 * ── 자리 잡기 ──
 * 곡률이 거리 제곱으로 세계를 접어 내리므로(0.0013), 175m 밖이면 바다가 이미
 * 40m 아래다. 그래서 **높이 30m 짜리 섬의 위쪽 절반만** 수평선 위로 나온다 —
 * 실제 바다에서 먼 섬이 봉우리만 보이는 것과 같고, 여기서는 셰이더가 알아서 한다.
 *
 * 방위는 깃발(정북)을 피해 좌우로 벌린다. 배너가 화면 가운데 13° 를 쓰므로
 * 그 밖으로 밀어야 겹치지 않고, 가로 화각 절반(약 27°)을 넘으면 화면 밖이다.
 */
const FAR_ISLANDS: readonly {
  readonly bearing: number;
  readonly distance: number;
  readonly scale: number;
  readonly turn: number;
}[] = [
  { bearing: -0.38, distance: 178, scale: 1, turn: 0.4 },
  { bearing: 0.44, distance: 232, scale: 0.72, turn: -1.1 },
];

function FarIslands() {
  const islands = useMemo(
    () =>
      FAR_ISLANDS.map((island) => ({
        ...island,
        geometry: buildFarIsland(island.scale),
      })),
    [],
  );

  return (
    <>
      {islands.map((island) => (
        <mesh
          key={island.bearing}
          geometry={island.geometry}
          position={[
            -Math.sin(island.bearing) * island.distance,
            /**
             * 바다에 반쯤 담근다. 섬을 물 위에 얹으면 밑동이 잘린 접시처럼
             * 보이는데, 어차피 수평선 아래는 안 보이므로 묻어버리는 게 맞다.
             */
            -6 * island.scale,
            -Math.cos(island.bearing) * island.distance,
          ]}
          rotation={[0, island.turn, 0]}
        >
          <CurvedMaterial vertexColors roughness={1} />
        </mesh>
      ))}
    </>
  );
}

export function SeaLife() {
  return (
    <>
      <FarIslands />
      <Boats />
      <Sharks />
      <School />
      <JumpingFish />
    </>
  );
}
