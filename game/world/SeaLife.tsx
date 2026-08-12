"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  type Group,
  type Material,
  type Mesh,
  MeshBasicMaterial,
} from "three";
import CustomShaderMaterial from "three-custom-shader-material";
import { elevationAt } from "@/game/core/island";
import { serverNow } from "@/game/net/serverClock";
import {
  CurvedBasicMaterial,
  CurvedMaterial,
  curvatureUniforms,
} from "@/game/world/curvature";
import { CYCLE_SECONDS, skyState } from "@/game/world/dayNight";
import { emitParticles } from "@/game/world/particleBus";
import {
  BEAM_LENGTH,
  BEAM_PITCH,
  beamReach,
  buildBoat,
  buildBoatBeam,
  buildBoatLights,
  buildCrab,
  buildFarIsland,
  buildFish,
  buildLightPool,
  buildSchool,
  buildSharkBody,
  buildSharkTail,
  buildWhale,
  buildWhaleTail,
  LAMP_Y,
  SHARK_TAIL_JOINT,
  WHALE_BLOWHOLE,
  WHALE_TAIL_JOINT,
} from "@/game/world/seaProps";
import {
  boatsAt,
  crabsAt,
  finsAt,
  jumpHeightAt,
  jumpPitchAt,
  jumpsAt,
  schoolsAt,
  whaleAt,
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
  const hullRef = useRef<Mesh>(null);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;

    const boat = boatsAt(serverNow() / 1000)[0];
    if (!boat) return;
    group.position.set(boat.x, boat.bob, boat.z);
    group.rotation.set(0, boat.yaw, boat.roll);
    group.scale.setScalar(boat.scale);
    group.visible = boat.fade > 0.02;

    /**
     * 항로 끝에서 스르르 사라지고 스르르 나타난다.
     *
     * ⚠ 되돌아가는 순간은 화면 밖이라고 계산해 뒀지만, 그건 **보는 사람이
     *   어디 서 있느냐**에 달린 계산이다. 화면은 사람을 따라 움직이므로
     *   섬 서쪽 끝에 서면 그 순간이 화면 안으로 들어온다 — 배가 눈앞에서
     *   깜빡 사라지고 반대편에 깜빡 나타난다. 흐려두면 어디서 보든
     *   수평선 안개에 녹아드는 것으로 보인다.
     */
    const hull = hullRef.current;
    if (hull) (hull.material as Material).opacity = boat.fade;

    // 밤에만 등을 켠다. 낮에 켜진 등은 그냥 노란 점이다.
    // 흐려지는 동안은 등도 끈다 — 반투명한 배에 등만 또렷하면 그게 더 이상하다.
    const lit = skyState.daylight < LAMP_THRESHOLD && boat.fade > 0.75;
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
      <mesh ref={hullRef} geometry={geometry} castShadow>
        <CurvedMaterial vertexColors roughness={0.62} transparent />
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

function Schools() {
  const geometry = useMemo(buildSchool, []);
  const groups = useRef<(Group | null)[]>([]);

  useFrame((state) => {
    const clock = state.clock.elapsedTime;
    for (const spot of schoolsAt(serverNow() / 1000)) {
      const group = groups.current[spot.id];
      if (!group) continue;
      // 얕은 물 바로 아래. 더 깊이 넣으면 바닥색에 묻힌다.
      group.position.set(
        spot.x,
        -0.85 + Math.sin(clock * 1.3 + spot.id * 2) * 0.12,
        spot.z,
      );
      group.rotation.set(
        0,
        spot.yaw + Math.sin(clock * 0.7 + spot.id) * 0.12,
        0,
      );
    }
  });

  return (
    <>
      {[0, 1, 2].map((id) => (
        <group
          key={id}
          ref={(node) => {
            groups.current[id] = node;
          }}
        >
          <mesh geometry={geometry}>
            <CurvedMaterial vertexColors roughness={0.4} />
          </mesh>
        </group>
      ))}
    </>
  );
}

// ── 꽃게 ────────────────────────────────────────────

/**
 * 모래밭을 걸어다니는 꽃게 셋.
 *
 * ── 왜 육지에도 뭔가 필요한가 ──
 * 바다에는 배도 상어도 물고기도 생겼는데 **뭍은 여전히 조용했다.** 걸어다니는
 * 동안 눈에 걸리는 게 하나도 없으면 섬이 두 배가 된 게 넓은 게 아니라 빈 것이 된다.
 * 게는 그 자리를 채우기에 딱 맞다 — 작고, 빠르지 않고, 다가가도 도망가지 않아도
 * 이상하지 않다.
 *
 * 자리는 시계에서 나온다(seaTraffic). 옆 사람 화면에서도 같은 게가 같은 자리에 있다.
 */
function Crabs() {
  const geometry = useMemo(buildCrab, []);
  const groups = useRef<(Group | null)[]>([]);

  useFrame((state) => {
    const seconds = serverNow() / 1000;
    const clock = state.clock.elapsedTime;

    for (const crab of crabsAt(seconds)) {
      const group = groups.current[crab.id];
      if (!group) continue;
      /**
       * 모래에 붙여 놓되 걸을 때마다 통통 튄다. 게는 다리가 여덟이라
       * 실제로도 몸이 잘게 흔들린다 — 그게 없으면 미끄러지는 스티커다.
       */
      group.position.set(
        crab.x,
        elevationAt(crab.x, crab.z) +
          Math.abs(Math.sin(clock * 7 + crab.id)) * 0.03,
        crab.z,
      );
      group.rotation.y = crab.yaw;
      group.rotation.z = Math.sin(clock * 7 + crab.id) * 0.08;
    }
  });

  return (
    <>
      {[0, 1, 2, 3, 4].map((id) => (
        <group
          key={id}
          ref={(node) => {
            groups.current[id] = node;
          }}
        >
          <mesh geometry={geometry} castShadow>
            <CurvedMaterial vertexColors roughness={0.55} />
          </mesh>
        </group>
      ))}
    </>
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

// ── 고래 ────────────────────────────────────────────

/**
 * 하루 두 번 지나가는 고래.
 *
 * 자세는 전부 시간표(seaTraffic)가 정하고, 여기서는 **물이 터지는 순간**만
 * 맡는다 — 분수 두 번과 착수 한 번. 그 셋이 이 장면의 전부라, 대목이
 * 바뀌는 순간을 놓치지 않으려고 시간이 아니라 **단계 번호**로 감시한다.
 * 프레임이 한 번 걸러지면 시간 비교는 그 순간을 통째로 건너뛴다.
 */
/**
 * 고래의 물기둥.
 *
 * ⚠ 낚시·물고기가 쓰는 물보라(splashSpecs)를 그대로 쓰면 **안 보인다.**
 *   그건 코앞에서 튀는 물방울이라 알갱이가 20cm 에 수명이 1초인데, 60m 밖에
 *   그걸 뿌리면 화면에서 반짝이 몇 점이다. 여기 필요한 건 방울이 아니라
 *   **안개 기둥**이다 — 굵고, 느리게 떨어지고, 오래 남는다.
 */
function mist(
  x: number,
  y: number,
  z: number,
  count: number,
  speed: number,
  spread: number,
  color: Color,
): void {
  const specs = [];
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const tilt = Math.sqrt(Math.random()) * spread;
    const rise = speed * (0.4 + Math.random() * 0.8);
    specs.push({
      ox: x + Math.cos(angle) * tilt * 0.4,
      oy: y,
      oz: z + Math.sin(angle) * tilt * 0.4,
      vx: Math.cos(angle) * tilt * rise,
      vy: rise,
      vz: Math.sin(angle) * tilt * rise,
      drag: 1.2,
      // 물방울(-16)보다 훨씬 가볍다. 물안개는 떨어지는 게 아니라 흩어진다.
      gravity: -4.2,
      life: 2.2 + Math.random() * 2.4,
      delay: 0,
      size: 0.9 + Math.random() * 2.2,
      color,
      shape: 2 as const,
      seed: Math.random(),
      floor: 0,
    });
  }
  emitParticles(specs);
}

function Whale() {
  const geometry = useMemo(buildWhale, []);
  const tailGeometry = useMemo(buildWhaleTail, []);
  const spoutColor = useMemo(() => new Color("#eaf6ff"), []);
  const splashDown = useMemo(() => new Color("#dff0f6"), []);
  const groupRef = useRef<Group>(null);
  const tailRef = useRef<Group>(null);
  const wakeRef = useRef<Mesh>(null);
  /** 마지막으로 처리한 (쇼 번호, 단계). 같은 대목을 두 번 터뜨리지 않는다. */
  const seen = useRef({ key: Number.NaN, stage: -1 });

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;

    const seconds = serverNow() / 1000;
    const whale = whaleAt(seconds, CYCLE_SECONDS);
    const wake = wakeRef.current;
    if (!whale) {
      if (group.visible) group.visible = false;
      if (wake?.visible) wake.visible = false;
      return;
    }
    group.visible = true;

    /**
     * 꼬리를 젓는다. 상어는 좌우로, 고래는 **위아래**로 젓는다 —
     * 이 한 축의 차이가 물고기와 젖먹이동물을 가른다.
     *
     * 공유 시계로 도니 옆 사람 화면에서도 같은 박자로 젓는다.
     */
    const tail = tailRef.current;
    if (tail) tail.rotation.x = Math.sin(seconds * 2.6) * 0.34;

    /**
     * 끌고 가는 물자국. 배와 같은 이유로 필요하다 — 이게 없으면 아무리 잘
     * 깎아도 물 위에 **놓아둔 것**처럼 보인다. 물에 잠긴 동안만 그린다.
     *
     * 몸과 달리 **수면에 눕는다.** 몸에 붙이면 도약할 때 물자국이 같이
     * 하늘로 서는데, 그건 물자국이 아니라 지느러미다.
     */
    if (wake) {
      wake.visible = whale.y < 2 && whale.y > -2.5;
      wake.position.set(whale.x, 0.05, whale.z);
      wake.rotation.set(-Math.PI / 2, 0, -whale.yaw);
    }
    group.position.set(whale.x, whale.y, whale.z);
    /**
     * ⚠ 회전 순서가 기본값(XYZ)이면 **도약 각도가 통째로 사라진다.**
     *   기본 순서는 고개를 세계의 X 축 기준으로 드는데, 고래는 동쪽을 보고
     *   가므로 그 축이 고래의 **몸통 축**이다 — 코를 드는 대신 몸이 옆으로
     *   구른다. 실제로 그렇게 나와서 도약하는 대목의 고래가 옆으로 누운 채
     *   수평선 위에 뜬 **비행선**으로 보였다.
     *   YXZ 는 방위를 먼저 돌리고 그 다음에 고개를 든다.
     */
    group.rotation.order = "YXZ";
    group.rotation.set(whale.pitch, whale.yaw, whale.roll);

    const mark = seen.current;
    if (mark.key !== whale.key) {
      mark.key = whale.key;
      mark.stage = -1;
    }
    if (whale.stage === mark.stage) return;
    mark.stage = whale.stage;

    /**
     * 분수. 물보라와 같은 링버퍼를 쓰되 **위로 좁게** 쏜다 —
     * 옆으로 퍼지면 그냥 물보라고, 곧게 서야 고래 숨이다.
     */
    /**
     * 분수 한 번. 100m 밖이라 **크게 한 번**이어야 보인다 —
     * 작게 두 번은 둘 다 안 보이는 것과 같다.
     */
    if (whale.stage === 1) {
      /**
       * ⚠ 숨구멍 자리는 **몸에 붙은 좌표**라 방위를 먹여야 세계 좌표가 된다.
       *   그냥 더했더니 고래는 동쪽을 보고 가는데 물기둥만 8m 북쪽에서
       *   솟았다 — 등 한복판에서 김이 나는 그림이었다.
       */
      const nose = -WHALE_BLOWHOLE[2];
      mist(
        whale.x + Math.sin(whale.yaw) * -nose,
        whale.y + WHALE_BLOWHOLE[1],
        whale.z + Math.cos(whale.yaw) * -nose,
        700,
        24,
        0.13,
        spoutColor,
      );
    }
    // 착수. 20m 짜리가 떨어지는 자리라 물보라도 그만큼이어야 한다.
    if (whale.stage === 5) {
      mist(whale.x, 0, whale.z, 600, 14, 1.6, splashDown);
    }
  });

  return (
    <>
      <group ref={groupRef} visible={false}>
        <mesh geometry={geometry} castShadow>
          <CurvedMaterial vertexColors roughness={0.45} />
        </mesh>
        <group ref={tailRef} position={[0, 0, WHALE_TAIL_JOINT]}>
          <mesh geometry={tailGeometry} castShadow>
            <CurvedMaterial vertexColors roughness={0.45} />
          </mesh>
        </group>
      </group>

      <mesh ref={wakeRef} visible={false}>
        <planeGeometry args={[7, 34]} />
        <CurvedBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.16}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

// ── 저 멀리 섬 ──────────────────────────────────────

/**
 * 수평선 위의 섬 둘.
 *
 * ── 자리 잡기 ──
 * 곡률이 거리 제곱으로 세계를 접어 내리므로(0.0013), 175m 밖이면 바다가 이미
 * 40m 아래다. 섬이 세 배가 되면서 보는 사람이 북쪽으로 60m 더 나갔으므로,
 * 거리는 그대로 두고 **크기만** 키웠다 — 더 멀리 물리면 통째로 수평선 아래다. 그래서 **높이 30m 짜리 섬의 위쪽 절반만** 수평선 위로 나온다 —
 * 실제 바다에서 먼 섬이 봉우리만 보이는 것과 같고, 여기서는 셰이더가 알아서 한다.
 *
 * 방위는 깃발(정북)을 피해 좌우로 벌린다. 배너가 화면 가운데 13° 를 쓰므로
 * 그 밖으로 밀어야 겹치지 않고, 가로 화각 절반(약 27°)을 넘으면 화면 밖이다.
 */
/**
 * ⚠ 크기와 높이를 **따로** 정한다.
 *
 * 한 번 통째로 키웠다가 실패했다(배율 2.6). 곡률이 175m 에서 40m 를 끌어내리므로
 * 수평선 위로 나오려면 높아야 하는데, 배율 하나로 키우면 **가로도 같이** 커져서
 * 화면 가로의 절반을 먹는 회색 덩어리가 됐다 — 멀어 보이는 게 아니라 그냥 큰 것이다.
 *
 * 멀리 있어 보이게 하는 건 **작은 각크기**이고, 보이게 하는 건 **꼭대기 높이**다.
 * 둘은 다른 손잡이여야 한다. spread 는 가로, top 은 수평선 위로 내밀 높이다.
 */
const FAR_ISLANDS: readonly {
  readonly bearing: number;
  readonly distance: number;
  /** 가로 크기 배수. 각크기를 정한다. */
  readonly spread: number;
  /** 세로 배수. 멀수록 크게 — 곡률이 거리 제곱으로 끌어내리기 때문이다. */
  readonly rise: number;
  /** 꼭대기의 해수면 기준 높이(m). 곡률 낙차를 이겨야 보인다. */
  readonly top: number;
  readonly turn: number;
}[] = [
  /**
   * turn 이 거의 0 인 건 의도다. 능선을 **옆선으로 그려 얇게 밀어낸** 물건이라
   * 크게 돌리면 두께가 드러나 판때기로 보인다. 카메라는 방위가 고정이니
   * 정면을 유지하는 게 맞다.
   */
  /**
   * ⚠ **거리로 멀리 보내면 우뚝 솟는다.** 곡률이 거리 제곱으로 바다를 접어
   *   내리므로(300m 면 117m 아래), 멀수록 꼭대기가 그만큼 더 높아야 수평선
   *   위로 얼굴을 내민다 — 한 번 300·380m 에 두고 꼭대기를 130·170m 로
   *   올렸더니 섬이 아니라 **산맥**이 됐다. 멀리 보내려고 한 짓이 정확히
   *   반대 결과를 낳는다.
   *
   *   멀어 보이는 건 거리가 아니라 **작은 각크기와 옅은 색**이다. 그래서
   *   거리는 오히려 당기고(170·220m) 높이를 상식적인 섬 크기로 되돌린다.
   *   여기서 수평선 위로 나오는 건 8~10m 남짓, 각으로 3° 다.
   *
   * ⚠ 낙차는 **보는 사람에게서의 거리**로 잰다. 섬 중심 기준으로 재면
   *   북쪽 물가에 선 사람에게는 그만큼 더 커 보인다.
   */
  { bearing: -0.3, distance: 170, spread: 0.85, rise: 1, top: 17, turn: 0.12 },
  {
    bearing: 0.34,
    distance: 220,
    spread: 0.7,
    rise: 1.25,
    top: 32,
    turn: -0.16,
  },
];

/** buildFarIsland 가 만드는 지오메트리의 로컬 꼭대기(배율 1 기준). */
const ISLAND_LOCAL_TOP = 24;

/**
 * 낮에는 푸옇게, 밤에는 어둡게.
 *
 * ⚠ 먼 섬은 빛을 안 받는 재질이라(그래야 해를 등져도 회색 산이 안 된다)
 *   **밤에도 혼자 환하다.** 세계가 다 어두워졌는데 수평선 위 섬만 대낮이면
 *   그림자놀이 배경처럼 떠 보인다. 조명을 켜는 대신 색을 시각에 맞춰 곱한다 —
 *   정점 색에 곱해지는 값이라 능선·모래·나무의 관계는 그대로 유지된다.
 */
function useHazeTint(): (target: Color) => void {
  const day = useMemo(() => new Color("#ffffff"), []);
  const night = useMemo(() => new Color("#2a3d5c"), []);
  return useMemo(
    () => (target: Color) => {
      target.copy(night).lerp(day, skyState.daylight);
    },
    [day, night],
  );
}

function FarIslands() {
  const tint = useHazeTint();
  const materials = useRef<(MeshBasicMaterial | null)[]>([]);

  useFrame(() => {
    for (const material of materials.current) {
      if (material) tint(material.color);
    }
  });

  const islands = useMemo(
    () =>
      FAR_ISLANDS.map((island) => ({
        ...island,
        geometry: buildFarIsland(island.spread, island.rise),
        // 꼭대기가 원하는 높이에 오도록 통째로 내리거나 올린다.
        lift: island.top - ISLAND_LOCAL_TOP * island.rise,
      })),
    [],
  );

  return (
    <>
      {islands.map((island, index) => (
        <mesh
          key={island.bearing}
          geometry={island.geometry}
          position={[
            -Math.sin(island.bearing) * island.distance,
            /**
             * 바다에 반쯤 담근다. 섬을 물 위에 얹으면 밑동이 잘린 접시처럼
             * 보이는데, 어차피 수평선 아래는 안 보이므로 묻어버리는 게 맞다.
             */
            island.lift,
            -Math.cos(island.bearing) * island.distance,
          ]}
          rotation={[0, island.turn, 0]}
        >
          {/*
            ⚠ 빛을 안 받는 재질이다. 175m 밖은 조명이 의미를 잃는 거리인데,
              빛을 받게 두면 해를 등진 낮에 **회색 산**이 되어 버린다 —
              멀리 있어 보이게 하려고 고른 푸연 색이 조명에 통째로 먹힌다.
              먼 배경을 칠한 색 그대로 두는 건 배경화의 오래된 방식이다.
          */}
          <CurvedBasicMaterial
            ref={(node: MeshBasicMaterial | null) => {
              materials.current[index] = node;
            }}
            vertexColors
          />
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
      <Schools />
      <Crabs />
      <Whale />
      <JumpingFish />
    </>
  );
}
