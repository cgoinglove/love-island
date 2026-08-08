"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  type Group,
  LinearFilter,
  type Points,
  ShaderMaterial,
  type Sprite,
} from "three";
import { serverNow } from "@/game/net/serverClock";
import { skyState, updateSky } from "./dayNight";
import { SHOOTING_STAR_DURATION, shootingStarAt } from "./nightShow";

/**
 * 하늘에 뜨는 것들 — 태양 · 달 · 별.
 *
 * 하루 순환을 실제로 굴리는 곳이기도 하다. updateSky 를 부르는 자리는 씬에 하나여야
 * 한다 — 두 곳에서 부르면 같은 프레임에 위상이 두 번 진행해 하루가 두 배로 빨라진다.
 *
 * 세 천체 모두 곡률을 타지 않는다. 배경이지 지형이 아니라 휘어야 할 이유가 없다.
 */

/** 천체가 놓이는 거리(m). 하늘 돔(700)보다 안쪽이어야 가려지지 않는다. */
const DISTANCE = 560;
const SUN_SIZE = 110;
const MOON_SIZE = 74;
const STAR_COUNT = 420;

/**
 * 부드럽게 떨어지는 그라데이션 원반.
 *
 * 원판 여러 장을 겹쳐 후광을 만들었다가 도넛이 됐다. 가장자리가 뚜렷한 원을 겹치면
 * 그 경계가 그대로 테두리로 보인다. 한 장으로 끝까지 흘려보내는 게 답이다.
 */
function makeGlowTexture(stops: readonly [number, string][]): CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  return texture;
}

const SUN_STOPS: readonly [number, string][] = [
  [0.0, "rgba(255,253,246,1)"],
  [0.07, "rgba(255,250,232,1)"],
  [0.11, "rgba(255,236,196,0.85)"],
  [0.22, "rgba(255,214,150,0.4)"],
  [0.4, "rgba(255,196,130,0.16)"],
  [0.65, "rgba(255,190,130,0.05)"],
  [1.0, "rgba(255,190,130,0)"],
];

const MOON_STOPS: readonly [number, string][] = [
  [0.0, "rgba(255,255,252,1)"],
  [0.16, "rgba(244,247,255,1)"],
  [0.2, "rgba(226,236,255,0.55)"],
  [0.34, "rgba(200,220,255,0.18)"],
  [0.62, "rgba(180,205,255,0.05)"],
  [1.0, "rgba(180,205,255,0)"],
];

/**
 * 별.
 *
 * ⚠ 해·달과 **같은 각도대**에 뿌려야 한다. 상반구(y > 0)에 뿌렸더니 하나도 안 보였다 —
 *   카메라가 숙이고 있어서 기하학적 지평선이 이미 화면 맨 위이고, 화면에서 하늘로
 *   보이는 띠는 곡률로 접힌 먼바다 위쪽, 즉 지평선 **아래** 각도대이기 때문이다.
 *   그 띠(대략 -19°~+2°)를 채우면 화면 가득한 별하늘이 된다.
 */
const STAR_BAND_LOW = -0.33;
const STAR_BAND_HIGH = 0.04;

function makeStarGeometry(): BufferGeometry {
  const positions = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);

  // 고정 시드. 별자리가 매번 바뀌면 "같은 섬"이라는 느낌이 사라진다.
  let seed = 0x5eed1;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  for (let i = 0; i < STAR_COUNT; i += 1) {
    // 구면에 고르게 뿌리려면 y 를 균등하게 뽑아야 한다(원기둥 사영).
    const y = STAR_BAND_LOW + random() * (STAR_BAND_HIGH - STAR_BAND_LOW);
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = random() * Math.PI * 2;
    positions[i * 3] = Math.cos(angle) * radius * DISTANCE;
    positions[i * 3 + 1] = y * DISTANCE;
    positions[i * 3 + 2] = Math.sin(angle) * radius * DISTANCE;
    // 크기를 제각각으로 줘야 별이 격자처럼 안 보인다.
    sizes[i] = 1.6 + random() * random() * 6.0;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("size", new BufferAttribute(sizes, 1));
  return geometry;
}

const STAR_VERTEX = /* glsl */ `
  attribute float size;
  varying float vSize;
  void main() {
    vSize = size;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size;
    gl_Position = projectionMatrix * mv;
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying float vSize;
  void main() {
    // 점 안에서 가운데만 밝게. 사각형 그대로 두면 밤하늘에 네모가 뿌려진다.
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float alpha = pow(max(0.0, 1.0 - d), 2.0) * uOpacity;
    if (alpha <= 0.004) discard;
    gl_FragColor = vec4(vec3(1.0, 0.98, 0.94), alpha);
  }
`;

export function Celestial() {
  const shootingRef = useRef<Group>(null);
  const sunRef = useRef<Sprite>(null);
  const moonRef = useRef<Sprite>(null);
  const starsRef = useRef<Points>(null);

  const sunTexture = useMemo(() => makeGlowTexture(SUN_STOPS), []);
  const moonTexture = useMemo(() => makeGlowTexture(MOON_STOPS), []);
  const starGeometry = useMemo(makeStarGeometry, []);
  const starUniforms = useMemo(() => ({ uOpacity: { value: 0 } }), []);
  /**
   * 머티리얼을 JSX 자식(<shaderMaterial />)으로 두면 별이 아예 안 그려졌다.
   * 인스턴스를 직접 만들어 material prop 으로 넘기면 그린다 —
   * Reactions 의 파티클 풀도 같은 방식이라 여기만 다르게 할 이유가 없다.
   */
  const starMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: STAR_VERTEX,
        fragmentShader: STAR_FRAGMENT,
        uniforms: starUniforms,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [starUniforms],
  );

  const scene = useThree((state) => state.scene);

  useFrame((state) => {
    /**
     * 하루를 굴리는 유일한 자리.
     *
     * 렌더러의 elapsedTime 이 아니라 **서버 보정 벽시계**를 쓴다. 그래야 같은 순간에
     * 들어온 사람들이 같은 하늘을 본다 — 먼저 들어온 사람은 밤인데 방금 들어온
     * 사람은 아침인 화면이 나오면 같은 섬에 있다는 감각이 깨진다.
     */
    updateSky(serverNow() / 1000);

    const sun = sunRef.current;
    if (sun) {
      sun.position.copy(skyState.sunDirection).multiplyScalar(DISTANCE);
      /**
       * 지평선 아래로 완전히 내려간 뒤에도 스프라이트를 그대로 두면 바다 밑에서
       * 빛나는 점이 된다. 고도로 서서히 지운다 — 지는 동안은 보여야 하므로
       * 딱 잘라 끄지 않는다.
       */
      /**
       * 궤도가 지평선 아래 각도대에 있으므로 y 로 끄면 항상 꺼진다.
       * 위상으로 판단한다 — daylight 가 0 이 되는 구간이 곧 해가 진 뒤다.
       */
      const material = sun.material;
      material.opacity = Math.min(
        1,
        skyState.daylight * 3 + skyState.goldenHour,
      );
      // 수평선에 걸린 해는 크고 붉게 보인다.
      const swell = 1 + skyState.goldenHour * 0.35;
      sun.scale.set(SUN_SIZE * swell, SUN_SIZE * swell, 1);
      material.color.copy(SUN_TINT).lerp(SUNSET_TINT, skyState.goldenHour);
    }

    const moon = moonRef.current;
    if (moon) {
      moon.position.copy(skyState.moonDirection).multiplyScalar(DISTANCE);
      // 밤에 또렷하고 낮에는 흐릿하다. 아예 지우지는 않는다 — 낮달도 있다.
      moon.material.opacity = 0.12 + 0.88 * skyState.starOpacity;
    }

    starUniforms.uOpacity.value = skyState.starOpacity;

    const stars = starsRef.current;
    if (stars) {
      // 별은 아주 느리게 돈다. 멈춰 있으면 배경 그림이고, 돌면 하늘이 된다.
      stars.rotation.y = state.clock.elapsedTime * 0.004;
    }

    /**
     * 별똥별. 시각만으로 정해지므로 아무도 신호를 안 보내도 모두가 같은 걸 본다.
     * 낮밤 순환과 같은 원리다.
     */
    // 별똥별도 공유 벽시계를 본다 — 렌더러 시계를 쓰면 사람마다 다른 별이 흐른다.
    const clock = serverNow();
    const streak = shootingRef.current;
    if (streak) {
      const star = shootingStarAt(clock / 1000, skyState.starOpacity);
      if (!star) {
        streak.visible = false;
      } else {
        const progress =
          (clock / 1000 - star.startedAt) / SHOOTING_STAR_DURATION;
        const bearing = star.bearing + star.travel * progress;
        const elevation = star.elevation - 0.12 * progress;
        streak.visible = true;
        streak.position.set(
          Math.sin(bearing) * Math.cos(elevation) * DISTANCE,
          Math.sin(elevation) * DISTANCE,
          -Math.cos(bearing) * Math.cos(elevation) * DISTANCE,
        );
        // 진행 방향으로 눕힌다. 꼬리가 지나온 쪽을 향해야 흐르는 것으로 보인다.
        streak.rotation.z = star.travel > 0 ? -0.5 : 0.5;
        // 나타났다 사라진다. 뚝 끊기면 별똥별이 아니라 깜빡임이다.
        const fade = Math.sin(Math.min(1, Math.max(0, progress)) * Math.PI);
        streak.scale.setScalar(fade);
      }
    }

    // 안개도 하늘과 같은 색이어야 수평선이 이어진다.
    if (scene.fog) scene.fog.color.copy(skyState.fogColor);
  });

  return (
    <>
      <sprite
        ref={sunRef}
        scale={[SUN_SIZE, SUN_SIZE, 1]}
        frustumCulled={false}
      >
        <spriteMaterial
          map={sunTexture}
          transparent
          depthWrite={false}
          /**
           * ⚠ 안개를 끈다. 씬 안개는 280~760m 인데 천체는 560m 에 있어서
           *   그대로 두면 하늘색에 묻혀 사라진다 — 실제로 "태양이 없다" 로 보였다.
           *   해와 달은 대기 **너머**에 있는 것이므로 안개를 먹지 않는 게 맞기도 하다.
           */
          fog={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </sprite>

      <sprite
        ref={moonRef}
        scale={[MOON_SIZE, MOON_SIZE, 1]}
        frustumCulled={false}
      >
        <spriteMaterial
          map={moonTexture}
          transparent
          depthWrite={false}
          fog={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </sprite>

      {/* 별똥별. 밝은 머리에 꼬리 하나. */}
      <group ref={shootingRef} visible={false}>
        <sprite scale={[7, 7, 1]}>
          <spriteMaterial
            map={moonTexture}
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
            fog={false}
          />
        </sprite>
        <mesh position={[-11, 0, 0]}>
          <planeGeometry args={[24, 0.9]} />
          <meshBasicMaterial
            color="#dceaff"
            transparent
            opacity={0.55}
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
            fog={false}
          />
        </mesh>
      </group>

      <points
        ref={starsRef}
        geometry={starGeometry}
        material={starMaterial}
        frustumCulled={false}
      />
    </>
  );
}

const SUN_TINT = new Color("#ffffff");
const SUNSET_TINT = new Color("#ff9a5a");
