"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { AmbientLight, DirectionalLight, HemisphereLight } from "three";
import { usePlayerController } from "@/game/core/playerControl";
import { skyState } from "./dayNight";

/** 방향광이 놓일 거리(m). 그림자 카메라 안에 들어오면 된다. */
const LIGHT_DISTANCE = 60;

/**
 * 섬의 조명. 하루 순환을 따라 하늘과 함께 움직인다.
 *
 * ── 그림자는 **섬이 아니라 사람을 따라간다** ──
 * 예전엔 그림자 카메라를 섬 크기에 맞춰 고정했다(±50m). 섬을 세 배로 키우자
 * 그 방식이 무너진다 — 같은 2048 픽셀로 300m 를 담으면 한 픽셀이 15cm 라
 * 캐릭터 그림자가 뭉개진 얼룩이 된다. 넓히지 말고 **좁혀서 따라다니게** 하면
 * 한 픽셀이 4cm 로 오히려 전보다 선명해지고, 어차피 보이는 건 카메라 주변뿐이다.
 */
const SHADOW_HALF = 42;

export function Lighting() {
  const controllerRef = usePlayerController();
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
      /**
       * 빛을 **사람 머리 위로** 옮긴다. 방향은 그대로 두고 원점만 따라간다 —
       * 그림자 카메라가 빛에 매달려 있으므로 이 한 줄이 곧 따라다니는 그림자다.
       */
      const pose = controllerRef.current?.pose();
      sun.position
        .copy(skyState.lightDirection)
        .multiplyScalar(LIGHT_DISTANCE)
        // 완전히 수평이면 그림자가 무한히 길어진다. 최소 고도를 준다.
        .setY(Math.max(skyState.lightDirection.y, 0.34) * LIGHT_DISTANCE);
      if (pose) {
        sun.position.x += pose.x;
        sun.position.z += pose.z;
        sun.target.position.set(pose.x, 0, pose.z);
        sun.target.updateMatrixWorld();
      }
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
        shadow-camera-left={-SHADOW_HALF}
        shadow-camera-right={SHADOW_HALF}
        shadow-camera-top={SHADOW_HALF}
        shadow-camera-bottom={-SHADOW_HALF}
        shadow-camera-near={1}
        shadow-camera-far={220}
        shadow-bias={-0.0008}
        shadow-normalBias={0.02}
      />
    </>
  );
}
