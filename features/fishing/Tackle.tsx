"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  BufferGeometry,
  CatmullRomCurve3,
  type Group,
  Line,
  LineBasicMaterial,
  type Mesh,
  Vector3,
} from "three";
import { elevationAt } from "@/game/core/island";
import { usePlayerController } from "@/game/core/playerControl";
import { serverNow } from "@/game/net/serverClock";
import {
  CurvedBasicMaterial,
  CurvedMaterial,
  curvatureUniforms,
} from "@/game/world/curvature";
import { FISHING_APPROACH, FISHING_POSITION } from "./constants";
import { CAST_DISTANCE, CAST_SECONDS, useFishingStore } from "./session";

/**
 * 낚싯대 · 낚싯줄 · 찌.
 *
 * 팝업 안의 파란 네모 대신 **실제로 물에 던진다.** 찌가 포물선을 그리며 날아가고,
 * 물 위에서 까딱이다가, 입질하면 쑥 잠긴다. 게임의 상태가 화면의 물건으로 보여야
 * 그게 게임이다 — 글자로만 알리면 그건 설명서다.
 *
 * 위치 계산은 전부 여기서 매 프레임 한다. 상태 전환(대기→입질)만 store 에 있고,
 * 좌표는 리액트를 통과하지 않는다.
 */

/** 낚시터에서 물 쪽을 바라보는 방향. 접근점 → 낚시터 벡터가 그대로 정면이다. */
const AIM = (() => {
  const dx = FISHING_POSITION[0] - FISHING_APPROACH[0];
  const dz = FISHING_POSITION[1] - FISHING_APPROACH[1];
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length, z: dz / length };
})();

/** 낚싯대 끝. 캐릭터 손 높이쯤에서 줄이 나간다. */
const ROD_TIP = new Vector3(
  FISHING_POSITION[0] + AIM.x * 0.5,
  elevationAt(FISHING_POSITION[0], FISHING_POSITION[1]) + 1.55,
  FISHING_POSITION[1] + AIM.z * 0.5,
);

/** 찌가 떨어지는 자리. 물 위다. */
const LANDING = new Vector3(
  FISHING_POSITION[0] + AIM.x * CAST_DISTANCE,
  0,
  FISHING_POSITION[1] + AIM.z * CAST_DISTANCE,
);

const LINE_SEGMENTS = 14;

/** 이보다 멀어지면 낚시가 저절로 끝난다. 상호작용 반경(2.4)보다 넉넉하게. */
const LEAVE_DISTANCE = 5;

export function Tackle() {
  // 내 위치는 컨트롤러가 이미 매 프레임 들고 있다. 새 공유 상태를 만들 이유가 없다.
  const controllerRef = usePlayerController();
  const stage = useFishingStore((state) => state.stage);
  const stageUntil = useFishingStore((state) => state.stageUntil);
  const leave = useFishingStore((state) => state.leave);

  const bobberRef = useRef<Group>(null);
  const rodRef = useRef<Mesh>(null);

  const lineGeometry = useMemo(() => new BufferGeometry(), []);
  const lineObject = useMemo(
    () =>
      new Line(
        lineGeometry,
        new LineBasicMaterial({
          color: 0xf4f0e6,
          transparent: true,
          opacity: 0.75,
        }),
      ),
    [lineGeometry],
  );
  const scratch = useMemo(
    () => ({
      points: Array.from({ length: LINE_SEGMENTS + 1 }, () => new Vector3()),
      bobber: new Vector3(),
    }),
    [],
  );

  const active = stage !== "away";

  useFrame((state) => {
    const bobber = bobberRef.current;
    if (!bobber || !active) return;

    /**
     * 자리를 벗어나면 낚시가 끝난다.
     *
     * 안 그러면 걸어가면서도 낚싯대가 허공에 남고, 그 자리에 찌만 둥둥 뜬다.
     * 조작(그만 버튼)에만 맡기면 사람들은 그냥 걸어가 버린다 — 걸어가는 게
     * "그만두겠다" 는 뜻이니, 그걸 그대로 받아주는 게 맞다.
     */
    const player = controllerRef.current?.pose();
    if (player) {
      const away = Math.hypot(
        player.x - FISHING_POSITION[0],
        player.z - FISHING_POSITION[1],
      );
      if (away > LEAVE_DISTANCE) {
        leave();
        return;
      }
    }

    const now = serverNow();
    const t = now / 1000;

    /**
     * 찌의 위치.
     *
     * 던지는 동안은 손끝에서 착지점까지 포물선을 그린다. 직선으로 가면
     * "날아간다" 가 아니라 "미끄러진다" 로 보인다.
     */
    const target = scratch.bobber;
    if (stage === "casting") {
      const progress = Math.min(
        1,
        Math.max(0, 1 - (stageUntil - now) / 1000 / CAST_SECONDS),
      );
      target.lerpVectors(ROD_TIP, LANDING, progress);
      // 던진 힘. 가운데서 가장 높이 뜬다.
      target.y += Math.sin(progress * Math.PI) * 2.4;
    } else {
      target.copy(LANDING);
      if (stage === "bite") {
        // 입질. 쑥 잠겼다 올라온다.
        target.y = -0.35 + Math.sin(t * 26) * 0.14;
      } else {
        // 파도에 까딱인다. 멈춰 있으면 물 위가 아니라 유리 위다.
        target.y = 0.06 + Math.sin(t * 2.1) * 0.07;
      }
    }
    bobber.position.copy(target);

    // 낚싯대는 던질 때 앞으로 휘었다 돌아온다.
    const rod = rodRef.current;
    if (rod) {
      const swing =
        stage === "casting"
          ? Math.sin(
              Math.min(
                1,
                Math.max(0, 1 - (stageUntil - now) / 1000 / CAST_SECONDS),
              ) * Math.PI,
            ) * 0.5
          : stage === "bite"
            ? Math.sin(t * 22) * 0.06
            : 0;
      rod.rotation.x = -0.62 - swing;
    }

    /**
     * 줄은 늘어진다. 손끝과 찌를 곧은 선으로 이으면 실이 아니라 막대다.
     * 중간점을 아래로 내린 곡선을 잘게 쪼개 그린다.
     */
    const sag = stage === "casting" ? 0.15 : 0.45;
    const mid = new Vector3()
      .addVectors(ROD_TIP, target)
      .multiplyScalar(0.5)
      .setY(Math.min(ROD_TIP.y, target.y) - sag);
    const curve = new CatmullRomCurve3([ROD_TIP, mid, target]);
    /**
     * ⚠ 줄에도 **손으로** 곡률을 먹인다.
     *
     * 낚싯대와 찌는 CurvedMaterial 이라 셰이더가 알아서 내려주는데, 줄만 그냥
     * LineBasicMaterial 이라 안 휘었다. 30m 거리에서 낙차가 1.2m 라, 줄만 허공에
     * 붕 뜬 채로 그려졌다 — 세계 전체가 지키는 규칙에 선 하나가 빠진 셈이었다.
     * 점을 여기서 만들고 있으니 여기서 같은 식을 적용하는 게 가장 간단하다.
     */
    const camera = state.camera.position;
    const curvature = curvatureUniforms.uCurvature.value;
    for (let i = 0; i <= LINE_SEGMENTS; i += 1) {
      const point = curve.getPoint(
        i / LINE_SEGMENTS,
        scratch.points[i] as Vector3,
      );
      const d = Math.hypot(point.x - camera.x, point.z - camera.z);
      point.y -= d * d * curvature;
    }
    lineGeometry.setFromPoints(scratch.points);
  });

  if (!active) return null;

  return (
    <group>
      {/* 낚싯대. 자리에 섰을 때만 손에 들린다. */}
      <mesh
        ref={rodRef}
        position={[
          FISHING_POSITION[0],
          elevationAt(FISHING_POSITION[0], FISHING_POSITION[1]) + 0.95,
          FISHING_POSITION[1],
        ]}
        rotation={[-0.62, Math.atan2(AIM.x, -AIM.z), 0]}
        castShadow
      >
        <cylinderGeometry args={[0.018, 0.008, 2.1, 6]} />
        <CurvedMaterial color="#4a3428" roughness={0.6} />
      </mesh>

      {/*
        낚싯줄.
        JSX 의 <line> 은 R3F 에서 SVG 요소와 이름이 겹쳐 타입이 어긋난다.
        객체를 직접 만들어 붙이는 게 우회가 아니라 정공법이다.
      */}
      <primitive object={lineObject} />

      {/* 찌 */}
      <group ref={bobberRef}>
        <mesh castShadow>
          <sphereGeometry args={[0.22, 12, 10]} />
          <CurvedMaterial color="#ff4d4d" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.19, 0]}>
          <sphereGeometry args={[0.2, 12, 10]} />
          <CurvedMaterial color="#fdf6e8" roughness={0.5} />
        </mesh>
        {/* 물에 닿은 자리에 퍼지는 파문. 찌가 물 위에 있다는 유일한 단서다. */}
        <mesh position={[0, -0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 0.62, 20]} />
          <CurvedBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.35}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
}
