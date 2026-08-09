"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import {
  CanvasTexture,
  DoubleSide,
  LinearFilter,
  MeshStandardMaterial,
  SRGBColorSpace,
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

/**
 * 천의 세로 길이(m).
 *
 * 7.4 였을 때 천 아래쪽이 화면에서 방명록 이름표와 겹쳐 "러브 아일랜드" 글자가
 * 가려졌다. 이름표는 게시판 꼭대기 바로 위라 더 내릴 데가 없고(내리면 포스트잇을
 * 가린다), 깃대를 더 올리면 북쪽 물가에서 천 윗단이 화면 밖으로 나간다.
 *
 * 남은 손잡이는 **천을 짧게** 하는 것뿐이었다. 위 끝은 깃대에 매여 그대로고
 * 아래 끝만 올라오므로, 북쪽에서의 잘림은 그대로 두면서 이름표 자리를 비운다.
 */
const HEIGHT = 5;

/**
 * 기둥 높이(m).
 *
 * 13 이었을 때 배너가 화면에서 방명록 게시판 바로 위에 딱 붙어, 게시판 이름표가
 * 천 위에 얹혀 글자를 덮었다. 4m 올리면 둘 사이에 한 뼘(약 2°)이 생긴다 —
 * 스폰에서 배너는 수평 아래 5~9°, 게시판은 11~17° 다.
 *
 * ⚠ 더 올리면 안 된다. 배너 쪽으로 걸어갈수록 곡률 낙차(거리²)가 거리보다 빨리
 *   줄어서 배너가 **화면에서 올라온다.** 프레임 맨 윗줄이 수평 아래 3° 라,
 *   지금 값이 섬 북쪽 물가까지 갔을 때 천 윗단이 겨우 걸치는 선이다.
 */
const POLE_HEIGHT = 17;

/**
 * 주인장 사진. `public/` 에 두면 여기 경로만 맞으면 된다.
 * 원본이 이미 원형으로 그려진 정사각 이미지라, 원으로 오려내면 배경 모서리가 지워진다.
 */
const PROFILE_SRC = "/cgoing-profile.png";

const SCALE = 64;
const CANVAS_W = WIDTH * SCALE;
const CANVAS_H = HEIGHT * SCALE;

/**
 * 왼쪽에 사진, 오른쪽에 글.
 *
 * 천이 가로로 길어(14 × 5) 세로로 세 줄만 쌓으면 글자가 납작해진다.
 * 사진을 왼쪽에 두면 그 공간이 세로로 살아나고, 무엇보다 이름만 적힌 천보다
 * **사람 얼굴이 붙은 천**이 이 섬의 주인이 있다는 걸 한눈에 말한다.
 */
const FACE_R = 100;
const FACE_CY = CANVAS_H / 2;
/** 사진과 글 사이. */
const GAP = 52;

/**
 * 천에 적히는 세 줄.
 *
 * 폭을 **재서** 가운데 놓기 때문에(paintBanner) 여기 문구를 바꿔도 여백이 안 무너진다.
 * 손으로 x 좌표를 박아뒀을 땐 이름이 조금만 길어져도 한쪽으로 쏠렸다.
 */
const LINES = [
  {
    text: OWNER_NAME,
    font: `bold ${1.35 * SCALE}px ui-monospace, "SFMono-Regular", monospace`,
    color: "#2f6f4f",
    y: 0.33,
  },
  {
    text: SITE_NAME,
    font: `bold ${0.8 * SCALE}px system-ui, sans-serif`,
    color: "#6b4a2a",
    y: 0.59,
  },
  {
    text: "// 걸어서 갈 수 있는 이력서",
    font: `${0.34 * SCALE}px ui-monospace, monospace`,
    color: "#9b8a6a",
    y: 0.79,
  },
] as const;

/**
 * 배너 한 장을 그린다.
 *
 * 사진은 나중에 도착하므로 **두 번 부른다** — 처음엔 사진 없이(자리만 비워두고),
 * 로드가 끝나면 사진과 함께. 레이아웃이 사진 유무와 무관하게 같아서 글자가 안 튄다.
 * 사진이 영영 안 오면(파일이 없으면) 빈 원판만 남는다 — 화면이 깨지진 않는다.
 */
function paintBanner(
  ctx: CanvasRenderingContext2D,
  avatar: HTMLImageElement | null,
): void {
  // 천 바탕. 위아래로 아주 옅은 그라데이션을 줘야 평면 스티커처럼 안 보인다.
  const backdrop = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  backdrop.addColorStop(0, "#f7f2e4");
  backdrop.addColorStop(1, "#e6dcc4");
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  /**
   * 테두리는 없다.
   *
   * 천 가장자리를 두른 주황 사각테와 사진을 감싼 주황 링이 있었는데, 둘 다
   * 안쪽 여백을 먹으면서 내용을 가장자리로 밀어붙였다. 천은 이미 나무 기둥 둘이
   * 잡고 있어서 어디까지가 천인지 선을 그어줄 필요가 없다.
   */

  /**
   * 사진과 글 덩어리를 **재서** 가운데 놓는다.
   *
   * x 좌표를 손으로 박아뒀을 땐 이름이 조금만 길어져도 한쪽으로 쏠렸고,
   * 여백을 늘리려면 세 군데를 같이 고쳐야 했다. 폭을 재면 여백이 저절로 대칭이 된다.
   */
  const textWidth = Math.max(
    ...LINES.map((line) => {
      ctx.font = line.font;
      return ctx.measureText(line.text).width;
    }),
  );
  const groupWidth = FACE_R * 2 + GAP + textWidth;
  const left = (CANVAS_W - groupWidth) / 2;
  const faceCx = left + FACE_R;
  const textX = left + FACE_R * 2 + GAP;

  // ── 사진 ──
  ctx.save();
  ctx.beginPath();
  ctx.arc(faceCx, FACE_CY, FACE_R, 0, Math.PI * 2);
  ctx.clip();
  // 사진이 아직 안 왔을 때 자리를 지키는 원판. 도착하면 그 위에 덮인다.
  ctx.fillStyle = "#eceef2";
  ctx.fillRect(faceCx - FACE_R, FACE_CY - FACE_R, FACE_R * 2, FACE_R * 2);
  if (avatar) {
    ctx.drawImage(
      avatar,
      faceCx - FACE_R,
      FACE_CY - FACE_R,
      FACE_R * 2,
      FACE_R * 2,
    );
  }
  ctx.restore();

  // ── 글 ──
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const line of LINES) {
    ctx.font = line.font;
    ctx.fillStyle = line.color;
    ctx.fillText(line.text, textX, CANVAS_H * line.y);
  }
}

function makeBannerTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;

  const texture = new CanvasTexture(canvas);
  /**
   * 캔버스에 그린 색은 sRGB 다. 안 알려주면 three 가 선형으로 읽어서 전체가
   * 허옇게 뜬다 — 글자만 있을 땐 넘어갔지만 사진이 들어오면 바로 티가 난다.
   */
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.anisotropy = 4;

  const ctx = canvas.getContext("2d");
  if (!ctx) return texture;

  paintBanner(ctx, null);

  const avatar = new Image();
  avatar.onload = () => {
    paintBanner(ctx, avatar);
    // 캔버스를 고쳐도 three 는 모른다. 이 한 줄이 GPU 로 다시 올린다.
    texture.needsUpdate = true;
  };
  avatar.src = PROFILE_SRC;

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
