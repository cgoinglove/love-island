"use client";

import { useMemo } from "react";
import { BackSide, ShaderMaterial, SphereGeometry } from "three";
import { skyState } from "./dayNight";

/**
 * 하늘 돔.
 *
 * 단색 배경을 쓰다가 그라데이션으로 바꿨다. 바다와 하늘이 같은 파랑 한 톤이면
 * 수평선이 사라져서 화면이 납작해진다. 위는 짙은 하늘, 수평선은 옅은 살구빛으로
 * 깔아주면 그 경계 하나로 깊이가 생긴다.
 *
 * 카메라를 따라다니지 않아도 된다 — 반지름이 충분히 커서 섬 안에서는
 * 어디로 가도 안쪽 면만 보인다.
 */
/** 카메라 far(1600) 보다 작아야 잘리지 않고, 바다(420) 보다는 커야 감싼다. */
const RADIUS = 700;

const VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uHaze;
  varying vec3 vWorld;

  void main() {
    float h = normalize(vWorld).y;

    // 수평선 바로 위의 옅은 띠. 이게 있어야 "먼 공기"가 느껴진다.
    float haze = smoothstep(-0.04, 0.03, h) * (1.0 - smoothstep(0.02, 0.13, h));
    vec3 color = mix(uHorizon, uZenith, smoothstep(-0.02, 0.17, h));
    color = mix(color, uHaze, haze * 0.45);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function Sky() {
  const geometry = useMemo(() => new SphereGeometry(RADIUS, 32, 24), []);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        // 안쪽에서 보므로 뒷면을 그린다. 깊이는 쓰지도 쓰이지도 않는다.
        side: BackSide,
        depthWrite: false,
        /**
         * 색은 하루 순환이 정한다. Color 객체를 **그대로** 넘기므로 참조가 같고,
         * updateSky 가 제자리에서 고치면 다음 프레임에 셰이더가 그 값을 본다.
         */
        uniforms: {
          uZenith: { value: skyState.zenithColor },
          uHorizon: { value: skyState.horizonColor },
          uHaze: { value: skyState.hazeColor },
        },
      }),
    [],
  );

  return (
    <mesh
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={-1}
    />
  );
}
