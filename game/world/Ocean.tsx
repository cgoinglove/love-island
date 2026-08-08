"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import { Color, MeshStandardMaterial, PlaneGeometry } from "three";
import CustomShaderMaterial from "three-custom-shader-material";
import { skyState } from "./dayNight";
import { OCEAN_FRAGMENT, OCEAN_VERTEX } from "./shaders";

/** 바다 크기. 곡률이 이 끝을 지평선 아래로 접어 내려서 "끝"이 안 보인다. */
const OCEAN_SIZE = 420;
// 파도 파장이 ~18m 라 2.8m 간격이면 충분하다. 220 → 150 으로 삼각형 5만 개를 그냥 벌었다.
const OCEAN_SEGMENTS = 150;

export interface OceanProps {
  curvature: number;
}

/**
 * 러브 아일랜드를 둘러싼 바다.
 *
 * MeshStandardMaterial 위에 CSM 으로 얹었다. 라이팅·그림자·안개를 직접 구현하지 않고
 * 위치(파도 + 곡률)와 색(수심 + 물거품)만 덮어쓰기 위해서다. (기획서 §9)
 *
 * 물거품은 shaders.ts 의 shoreDistance 로 해안선을 계산해서 그린다 —
 * 지형 메시와 같은 수식이라 물거품이 모래사장 위에 정확히 얹힌다.
 */
export function Ocean({ curvature }: OceanProps) {
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uCurvature: { value: curvature },
      /**
       * 물색과 태양 방향은 하루 순환이 정한다. 객체를 그대로 공유하므로
       * 해가 지면 물도 같이 어두워지고, 반짝이는 길도 실제 태양을 따라 움직인다.
       * 각자 시간을 재면 해는 졌는데 물만 대낮인 화면이 나온다.
       */
      uShallowColor: { value: skyState.shallowWater },
      uDeepColor: { value: skyState.deepWater },
      uFoamColor: { value: new Color("#f2fbff") },
      uSunDirection: { value: skyState.sunDirection },
    }),
    [curvature],
  );

  // uniforms 객체를 그대로 머티리얼에 넘기므로 참조가 같다. ref 를 거칠 필요 없이
  // 여기서 값만 올리면 셰이더가 다음 프레임에 그 값을 본다.
  useFrame((_, delta) => {
    uniforms.uTime.value += delta;
  });

  /**
   * ⚠ 메시를 눕히지 않고 **지오메트리를 구워서** 눕힌다.
   *
   * `<mesh rotation={[-π/2,0,0]}>` 로 눕히면 평면의 로컬 Y 축이 월드 -Z 를 가리킨다.
   * 곡률 셰이더는 csm_Position.y 를 내리는데, 그 y 가 월드 Z 라서
   * 바다가 아래로 꺼지는 대신 **앞뒤로 밀렸다** — 멀리서 보면 바다가 섬 위로 올라오고
   * 걸어가면 그 덮개가 벗겨지는 것처럼 보였다.
   *
   * geometry.rotateX 는 회전을 버텍스에 구워 넣으므로 로컬 Y = 월드 Y 가 유지된다.
   * Terrain 은 처음부터 이 방식이라 멀쩡했다.
   */
  const geometry = useMemo(() => {
    const plane = new PlaneGeometry(
      OCEAN_SIZE,
      OCEAN_SIZE,
      OCEAN_SEGMENTS,
      OCEAN_SEGMENTS,
    );
    plane.rotateX(-Math.PI / 2);
    return plane;
  }, []);

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <CustomShaderMaterial
        baseMaterial={MeshStandardMaterial}
        vertexShader={OCEAN_VERTEX}
        fragmentShader={OCEAN_FRAGMENT}
        uniforms={uniforms}
        transparent
        // 얕은 물이 반투명해서 아래 모래톱이 비친다. depthWrite 를 끄면
        // 물 아래 지형이 물보다 먼저 정렬되어 사라지는 일이 없다.
        depthWrite={false}
        roughness={0.12}
        metalness={0.15}
      />
    </mesh>
  );
}
