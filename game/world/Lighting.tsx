"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { AmbientLight, DirectionalLight, HemisphereLight } from "three";
import { ISLAND_BASE_RADIUS } from "@/game/core/island";
import { skyState } from "./dayNight";

/** 방향광이 놓일 거리(m). 그림자 카메라 안에 들어오면 된다. */
const LIGHT_DISTANCE = 60;

/**
 * 섬의 조명. 하루 순환을 따라 하늘과 함께 움직인다.
 *
 * shadow-camera 범위를 섬 크기에 딱 맞춘다. 기본값(±5)을 그대로 두면
 * 섬 바깥쪽 절반에서 그림자가 잘려 나가고, 반대로 너무 넓히면
 * 같은 해상도에 더 넓은 영역을 담느라 그림자가 뭉개진다.
 */
export function Lighting() {
  // 섬이 커진 만큼 그림자 카메라도 넓혀야 가장자리 그림자가 안 잘린다.
  const half = ISLAND_BASE_RADIUS * 1.25;

  const sunRef = useRef<DirectionalLight>(null);
  const ambientRef = useRef<AmbientLight>(null);
  const hemiRef = useRef<HemisphereLight>(null);

  /**
   * 매 프레임 skyState 를 읽어 조명을 맞춘다.
   *
   * 리액트 상태로 두면 프레임마다 씬이 리렌더된다. 빛은 씬 그래프의 성질이지
   * 컴포넌트의 상태가 아니라, ref 로 직접 고치는 편이 더 정직하기도 하다.
   */
  useFrame(() => {
    const sun = sunRef.current;
    if (sun) {
      /**
       * 보이는 해가 아니라 lightDirection 을 따른다.
       *
       * 보이는 해는 프레임에 담기려고 9° 궤도를 도는데, 그 각도로 그림자를 만들면
       * 키의 6배까지 늘어져 물체에서 떨어져 나간다. 밤에는 이 벡터가 달 쪽을 가리킨다 —
       * 해 방향을 그대로 쓰면 지평선 아래에서 지형을 비춰 그림자가 거꾸로 진다.
       */
      sun.position
        .copy(skyState.lightDirection)
        .multiplyScalar(LIGHT_DISTANCE)
        // 완전히 수평이면 그림자가 무한히 길어진다. 최소 고도를 준다.
        .setY(Math.max(skyState.lightDirection.y, 0.34) * LIGHT_DISTANCE);
      sun.color.copy(skyState.lightColor);
      sun.intensity = skyState.lightIntensity;
    }

    const ambient = ambientRef.current;
    if (ambient) {
      ambient.color.copy(skyState.ambientColor);
      ambient.intensity = skyState.ambientIntensity;
    }

    const hemi = hemiRef.current;
    if (hemi) {
      hemi.color.copy(skyState.hemiSkyColor);
      hemi.groundColor.copy(skyState.hemiGroundColor);
      hemi.intensity = skyState.hemiIntensity;
    }
  });

  return (
    <>
      {/* 하늘색 위 / 잔디 반사광 아래. 이것만으로 그늘이 검게 죽지 않는다 —
          §9 의 "그림자는 검정 대신 보색 계열" 을 조명 단계에서 해결하는 방법. */}
      <hemisphereLight ref={hemiRef} />
      <ambientLight ref={ambientRef} />
      <directionalLight
        ref={sunRef}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-camera-near={1}
        shadow-camera-far={220}
        shadow-bias={-0.0008}
        shadow-normalBias={0.02}
      />
    </>
  );
}
