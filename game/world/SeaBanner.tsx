"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import {
  CanvasTexture,
  DoubleSide,
  LinearFilter,
  MeshStandardMaterial,
} from "three";
import CustomShaderMaterial from "three-custom-shader-material";
import { SEA_BANNER } from "@/game/core/island";
import { OWNER_NAME, SITE_NAME } from "@/shared/constants";
import { CurvedMaterial } from "./curvature";
import { BANNER_VERTEX } from "./shaders";

/**
 * 바다에 꽂힌 대형 배너.
 *
 * 섬 밖은 걸어서 못 가는 영역이라 그냥 빈 물이었다. 거기 큰 깃발을 세우면
 * 못 가는 곳이 "볼 것"으로 바뀐다 — 경계가 벽이 아니라 배경이 된다.
 *
 * 글자는 CanvasTexture 로 굽는다. 천이 펄럭이므로 DOM 오버레이(Html)로는 못 붙인다 —
 * 화면 좌표에 고정된 라벨은 아무리 흔들어도 같이 흔들리지 않는다.
 */

const WIDTH = 14;
const HEIGHT = 7.4;
const POLE_HEIGHT = 13;

function makeBannerTexture(): CanvasTexture {
  const scale = 64;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * scale;
  canvas.height = HEIGHT * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new CanvasTexture(canvas);

  // 천 바탕. 위아래로 아주 옅은 그라데이션을 줘야 평면 스티커처럼 안 보인다.
  const backdrop = ctx.createLinearGradient(0, 0, 0, canvas.height);
  backdrop.addColorStop(0, "#f7f2e4");
  backdrop.addColorStop(1, "#e6dcc4");
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#c2703f";
  ctx.lineWidth = 10 * (scale / 64);
  ctx.strokeRect(26, 26, canvas.width - 52, canvas.height - 52);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#2f6f4f";
  ctx.font = `bold ${1.9 * scale}px ui-monospace, "SFMono-Regular", monospace`;
  ctx.fillText(`${OWNER_NAME}`, canvas.width / 2, canvas.height * 0.36);

  ctx.fillStyle = "#6b4a2a";
  ctx.font = `bold ${1.15 * scale}px system-ui, sans-serif`;
  ctx.fillText(SITE_NAME, canvas.width / 2, canvas.height * 0.63);

  ctx.fillStyle = "#9b8a6a";
  ctx.font = `${0.5 * scale}px ui-monospace, monospace`;
  ctx.fillText(
    "// 걸어서 갈 수 있는 이력서",
    canvas.width / 2,
    canvas.height * 0.8,
  );

  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.anisotropy = 4;
  return texture;
}

export function SeaBanner({ curvature }: { curvature: number }) {
  const [x, z] = SEA_BANNER;

  const texture = useMemo(makeBannerTexture, []);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uCurvature: { value: curvature } }),
    [curvature],
  );

  // uniforms 객체를 그대로 넘기므로 참조가 같다. 여기서 값만 올리면 셰이더가 본다.
  useFrame((_, delta) => {
    uniforms.uTime.value += delta;
  });

  return (
    /**
     * 회전을 주지 않는다. 평면의 기본 법선이 +Z 인데 카메라는 섬 남쪽에서 북쪽을 보므로
     * 그대로 두면 앞면이 카메라를 향한다. π 만큼 돌렸다가 뒷면이 보여 글자가 좌우로
     * 뒤집혔던 적이 있다 — DoubleSide 라 렌더는 되니 더 늦게 발견했다.
     */
    <group position={[x, 0, z]}>
      {/* 물에 잠긴 기둥 두 개 */}
      {[-WIDTH / 2, WIDTH / 2].map((offsetX) => (
        <group key={offsetX}>
          <mesh position={[offsetX, POLE_HEIGHT / 2 - 3, 0]}>
            <cylinderGeometry args={[0.3, 0.4, POLE_HEIGHT + 6, 8]} />
            <CurvedMaterial color="#7d5a3c" roughness={0.9} />
          </mesh>
          {/* 꼭대기 공 마감. 잘린 원기둥이 그대로 보이면 공사장 파이프다. */}
          <mesh position={[offsetX, POLE_HEIGHT + 0.05, 0]}>
            <sphereGeometry args={[0.42, 10, 8]} />
            <CurvedMaterial color="#6b4a30" roughness={0.85} />
          </mesh>
        </group>
      ))}

      {/* 천. 가로로 촘촘히 나눠야 파도처럼 접힌다 */}
      <mesh
        position={[0, POLE_HEIGHT - HEIGHT / 2 - 1, 0]}
        frustumCulled={false}
      >
        <planeGeometry args={[WIDTH, HEIGHT, 48, 12]} />
        <CustomShaderMaterial
          baseMaterial={MeshStandardMaterial}
          vertexShader={BANNER_VERTEX}
          uniforms={uniforms}
          map={texture}
          side={DoubleSide}
          roughness={0.85}
        />
      </mesh>
    </group>
  );
}
