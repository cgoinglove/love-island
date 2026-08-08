"use client";

import { Canvas } from "@react-three/fiber";
import { Leva } from "leva";
import { type ReactNode, Suspense, useRef } from "react";
import { type Group, NeutralToneMapping } from "three";
import { FollowCamera } from "@/game/camera/FollowCamera";
import {
  type PlayerController,
  PlayerControllerContext,
} from "@/game/core/playerControl";
import { PerfPanel, PerfProbe } from "@/game/dev/PerfHud";
import { useTuning } from "@/game/dev/useTuning";
import { ExploreWatcher } from "@/game/hud/ExploreWatcher";
import { InteractableLabels } from "@/game/hud/InteractableLabels";
import { InteractionWatcher } from "@/game/hud/InteractionWatcher";
import { Minimap, MinimapFrame } from "@/game/hud/Minimap";
import { usePresence } from "@/game/net/usePresence";
import { LocalPlayer } from "@/game/player/LocalPlayer";
import { RemotePlayers } from "@/game/player/RemotePlayers";
import { Celestial } from "@/game/world/Celestial";
import { setCurvature } from "@/game/world/curvature";
import { GuideBot } from "@/game/world/GuideBot";
import { Lighting } from "@/game/world/Lighting";
import { Ocean } from "@/game/world/Ocean";
import { Palms } from "@/game/world/Palms";
import { Reactions } from "@/game/world/Reactions";
import { SeaBanner } from "@/game/world/SeaBanner";
import { Seafloor } from "@/game/world/Seafloor";
import { Sky } from "@/game/world/Sky";
import { Terrain } from "@/game/world/Terrain";

const IS_DEV = process.env.NODE_ENV !== "production";

/** 하늘색. 안개와 배경이 같은 색이라 수평선이 자연스럽게 녹는다. */
const SKY = "#9ec9e2";

export interface GameCanvasProps {
  /** Canvas 안에 들어갈 3D 컨텐츠. feature 의 오브젝트들이 여기로 온다. */
  children?: ReactNode;
  /** 캔버스 위에 얹힐 2D 레이어. HUD 와 feature 패널. */
  overlay?: ReactNode;
}

/**
 * 섬의 껍데기.
 *
 * 이 컴포넌트는 feature 를 하나도 모른다 — children 으로 받을 뿐이다.
 * game/ 이 features/ 를 import 하면 린트가 막는다. 합성은 app/ 에서 한다. (기획서 §2.2)
 */
export function GameCanvas({ children, overlay }: GameCanvasProps) {
  const playerRef = useRef<Group>(null);
  const controllerRef = useRef<PlayerController | null>(null);
  const perfRef = useRef<HTMLPreElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const tuning = useTuning();

  // 내 위치를 올리고 남들 위치를 받아오는 루프. Canvas 밖에서 돈다.
  usePresence(controllerRef);

  // 곡률은 씬 전체가 공유하는 값이라 유니폼 객체 하나에 밀어 넣는다.
  // 오브젝트마다 prop 으로 내려보내면 하나라도 빠뜨리는 순간 그것만 공중에 뜬다.
  setCurvature(tuning.curvature);

  const walkTo = (x: number, z: number) => controllerRef.current?.moveTo(x, z);

  return (
    <div className="fixed inset-0 touch-none" style={{ background: SKY }}>
      <Canvas
        // "percentage"(PCFShadowMap). R3F 의 기본값인 PCFSoft 는 three 0.185 에서 deprecated 다.
        shadows="percentage"
        // 모바일 dpr 은 3까지 올라간다 = 픽셀 9배. 1.5 에서 자른다. (기획서 §8.2)
        dpr={[1, 1.5]}
        camera={{ position: [0, 12, 34], near: 0.5, far: 1600 }}
        gl={{
          antialias: true,
          // ACES 는 채도를 깎아 파스텔이 죽는다. 동물의숲 룩엔 Neutral 이 맞다. (기획서 §9)
          toneMapping: NeutralToneMapping,
        }}
      >
        <color attach="background" args={[SKY]} />
        {/* 곡률이 먼 바다를 지평선 아래로 접고, 안개가 그 경계를 지운다. */}
        {/* 안개는 바다 끝만 지운다. 너무 가까이 걸면 하늘 그라데이션까지 씻어버린다. */}
        <fog attach="fog" args={[SKY, 280, 760]} />

        <Suspense fallback={null}>
          <PlayerControllerContext.Provider value={controllerRef}>
            <Sky />
            <Celestial />
            <Lighting />
            <Ocean curvature={tuning.curvature} />
            <SeaBanner curvature={tuning.curvature} />
            <Terrain curvature={tuning.curvature} onTapGround={walkTo} />
            <Seafloor />
            <Palms />

            <LocalPlayer
              groupRef={playerRef}
              controllerRef={controllerRef}
              config={tuning.move}
            />
            <RemotePlayers />
            <GuideBot playerRef={playerRef} />
            <ExploreWatcher playerRef={playerRef} />
            <Reactions />
            <FollowCamera targetRef={playerRef} {...tuning.camera} />

            <InteractionWatcher />
            <Minimap canvasRef={minimapRef} />
            {children}
            {/*
              children 뒤에 온다. feature 들이 먼저 자기를 등록해야
              이름표가 그 목록을 읽을 수 있다.
            */}
            <InteractableLabels />
          </PlayerControllerContext.Provider>
          <PerfProbe target={perfRef} />
        </Suspense>
      </Canvas>

      {/*
        Provider 를 두 번 쓴다. R3F 의 Canvas 는 별도 리액트 루트라서
        바깥 트리의 컨텍스트가 자동으로 넘어간다는 보장이 없다.
        같은 ref 객체를 양쪽에 꽂아두면 브릿지 유무와 무관하게 동작한다.
      */}
      <PlayerControllerContext.Provider value={controllerRef}>
        {overlay}
        <MinimapFrame canvasRef={minimapRef} />
      </PlayerControllerContext.Provider>

      {IS_DEV && <PerfPanel ref={perfRef} />}
      <Leva collapsed hidden={!IS_DEV} titleBar={{ title: "튜닝" }} />
    </div>
  );
}
