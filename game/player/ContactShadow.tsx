"use client";

import { useMemo } from "react";
import { DoubleSide, MeshBasicMaterial } from "three";
import CustomShaderMaterial from "three-custom-shader-material";
import { curvatureUniforms } from "@/game/world/curvature";
import {
  CONTACT_SHADOW_FRAGMENT,
  CONTACT_SHADOW_VERTEX,
} from "@/game/world/shaders";

/**
 * 발밑 접촉 그림자.
 *
 * 방향광 그림자만으로는 캐릭터가 "떠 있는" 것처럼 보인다. 빛이 비스듬해서
 * 그림자가 옆으로 뻗어 나가면, 몸과 땅이 **닿는 지점**에는 아무 표시가 없다.
 *
 * 발밑에 부드러운 원반 하나를 깔면 그 접점이 생긴다 — 캐주얼 3D 게임이 거의
 * 예외 없이 쓰는 기법이다. 광원 방향과 무관하게 "여기가 바닥"이라고 말해주는
 * 역할이라 방향광 그림자와 겹쳐도 서로 방해하지 않는다.
 */
export interface ContactShadowProps {
  /** 반지름(m). 몸통보다 조금 넓게. */
  radius?: number;
  /**
   * 지면 위 높이. 점프하면 부르는 쪽이 이 값을 0 으로 되돌려야
   * 그림자가 몸을 따라 같이 떠오르지 않는다.
   */
  y?: number;
  /** 0~1. 작고 가벼운 물건일수록 옅게. */
  opacity?: number;
}

export function ContactShadow({
  radius = 0.52,
  y = 0.02,
  opacity = 1,
}: ContactShadowProps) {
  /**
   * uCurvature 는 세계와 **같은 객체**를 공유하고, uStrength 만 이 그림자의 것이다.
   * 이렇게 두면 튜닝 패널에서 곡률을 바꿔도 그림자가 같이 따라 휜다.
   */
  const uniforms = useMemo(
    () => ({ ...curvatureUniforms, uStrength: { value: opacity } }),
    [opacity],
  );

  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[radius, 24]} />
      <CustomShaderMaterial
        baseMaterial={MeshBasicMaterial}
        vertexShader={CONTACT_SHADOW_VERTEX}
        fragmentShader={CONTACT_SHADOW_FRAGMENT}
        uniforms={uniforms}
        transparent
        // 깊이를 쓰지 않는다. 지면과 z-fighting 하면 깜빡인다.
        depthWrite={false}
        side={DoubleSide}
      />
    </mesh>
  );
}
