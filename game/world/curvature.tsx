"use client";

import type { ComponentProps } from "react";
import { MeshBasicMaterial, MeshStandardMaterial } from "three";
import CustomShaderMaterial from "three-custom-shader-material";
import { CURVED_VERTEX } from "./shaders";

/**
 * 지평선 곡률을 **모든** 오브젝트가 함께 쓰기 위한 공용 유니폼.
 *
 * ── 왜 전역 객체인가 ──
 * 곡률은 씬 전체의 성질이지 오브젝트의 성질이 아니다. 지형만 휘고 캐릭터는 안 휘면
 * 멀어질수록 캐릭터가 땅에서 떠오른다 — 실제로 그렇게 보였고, 그게
 * "디자인이 깨졌다"의 정체였다.
 *
 * 값을 prop 으로 내려보내려면 feature 컴포넌트까지 전부 curvature 를 받아야 한다.
 * 씬에 하나뿐인 값이므로 유니폼 객체 하나를 공유하는 편이 정직하다.
 * three 는 uniforms 객체를 참조로 들고 있어서 여기 값을 바꾸면 전부 따라온다.
 */
export const curvatureUniforms = { uCurvature: { value: 0.0013 } };

export function setCurvature(value: number): void {
  curvatureUniforms.uCurvature.value = value;
}

/**
 * 곡률을 타는 표준 머티리얼.
 * 씬 안의 모든 입체는 이걸 써야 한다 — 하나라도 빼먹으면 그것만 공중에 뜬다.
 *
 * props 타입을 직접 적지 않고 CSM 에서 가져온다. 손으로 적으면
 * exactOptionalPropertyTypes 아래에서 optional 이 안 맞고, 새 prop 을 쓸 때마다 늘려야 한다.
 */
type CurvedMaterialProps = Omit<
  ComponentProps<typeof CustomShaderMaterial>,
  "baseMaterial" | "vertexShader" | "uniforms"
>;

export function CurvedMaterial(props: CurvedMaterialProps) {
  return (
    <CustomShaderMaterial
      baseMaterial={MeshStandardMaterial}
      vertexShader={CURVED_VERTEX}
      uniforms={curvatureUniforms}
      {...props}
    />
  );
}

/**
 * 빛을 받지 않는 것들(접촉 그림자 · 표식 링)용.
 *
 * "입체는 전부 CurvedMaterial" 이라는 규칙에 basic 머티리얼이 낄 자리가 없어서
 * 접촉 그림자를 meshBasicMaterial 로 만들었고, 그래서 **그것만 안 휘었다**.
 * 땅은 카메라에서 멀수록 내려가는데 그림자는 제자리에 남아, 정확히
 * 곡률 낙차만큼(24m 거리에서 약 0.75m) 공중에 떠 있었다.
 *
 * 규칙에 예외를 두는 대신 규칙을 지킬 수 있는 도구를 하나 더 만든다.
 */
export function CurvedBasicMaterial(props: CurvedMaterialProps) {
  return (
    <CustomShaderMaterial
      baseMaterial={MeshBasicMaterial}
      vertexShader={CURVED_VERTEX}
      uniforms={curvatureUniforms}
      {...props}
    />
  );
}
