"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import { setCameraShot } from "@/game/camera/cinematic";
import { useInteractable } from "@/game/core/interactable";
import { elevationAt } from "@/game/core/island";
import { usePlayerController } from "@/game/core/playerControl";
import { useHudStore } from "@/game/hud/store";
import { getMyPlayerId } from "@/game/net/presence";
import { serverNow } from "@/game/net/serverClock";
import { CurvedBasicMaterial, CurvedMaterial } from "@/game/world/curvature";
import { t } from "@/shared/strings";
import {
  BALLOON_APPROACH,
  BALLOON_PAD,
  BALLOON_PANEL_ID,
  BASKET_FLOOR,
  RIDE_CAMERA_BACK,
  RIDE_CAMERA_SIDE,
  RIDE_CAMERA_UP,
  RIDE_FOV,
  RIDE_GLIDE,
  RIDE_LOOK_AHEAD,
  RIDE_LOOK_DOWN,
} from "./constants";
import { flightAt } from "./flight";
import { buildBalloon, buildBurner, buildPad } from "./geometry";
import { callBalloon, useBalloonSchedule, useScheduleStore } from "./schedule";
import { useRideStore } from "./session";

/**
 * 열기구.
 *
 * ── 이 기능이 재미있는 이유는 카메라다 ──
 * 이 섬의 카메라는 방위가 고정이고 늘 캐릭터 뒤에 붙어 있다. 그래서 사람들은
 * 섬을 **옆에서만** 본다 — 하트 모양이라는 것도, 어디에 뭐가 있는지도 지도(미니맵)
 * 로만 안다. 타고 올라가면 그 규칙이 잠깐 깨지고 섬이 통째로 보인다.
 *
 * ── 같이 타는 데 드는 통신은 0 이다 ──
 * 기구의 자리는 시계에서 나오고(flight.ts), 탄 사람의 자리는 **원래 보내던 좌표
 * 패킷**에 그대로 실려 나간다. 태우는 동안 컨트롤러가 좌표를 밀어 넣기 때문에
 * (playerControl 의 carry), 남의 화면에서는 그냥 "저 사람이 하늘에 있다" 가 된다.
 * 탈것 전용 프로토콜이 한 줄도 없다.
 */

/**
 * 바구니 안에서 설 자리 넷. 여럿이 타면 겹치지 않게 나눠 선다.
 *
 * 자리를 주고받지 않는다 — playerId 로 정하므로 **각자 계산해도 같은 답**이
 * 나오고, 그래서 내 화면과 남의 화면에서 같은 귀퉁이에 선다.
 */
const SEATS: readonly (readonly [number, number])[] = [
  [-0.62, -0.62],
  [0.62, -0.62],
  [-0.62, 0.62],
  [0.62, 0.62],
];

function seatFor(playerId: string): readonly [number, number] {
  let hash = 0;
  for (let i = 0; i < playerId.length; i += 1) {
    hash = (hash * 31 + playerId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % SEATS.length;
  return SEATS[index] ?? [0, 0];
}

export function Balloon() {
  const controllerRef = usePlayerController();
  const riding = useRideStore((state) => state.riding);
  const board = useRideStore((state) => state.board);
  const leave = useRideStore((state) => state.leave);

  const geometry = useMemo(buildBalloon, []);
  const burnerGeometry = useMemo(buildBurner, []);
  const padGeometry = useMemo(buildPad, []);
  const groupRef = useRef<Group>(null);
  const burnerRef = useRef<Group>(null);
  const seat = useMemo(() => seatFor(getMyPlayerId()), []);

  const padGround = useMemo(
    () => elevationAt(BALLOON_PAD[0], BALLOON_PAD[1]),
    [],
  );

  /** 지금 탈 수 있는가. 탈 때 한 번 보므로 매 프레임 갱신하고 ref 로 둔다. */
  const boardableRef = useRef(true);
  /**
   * 탄 뒤로 한 번이라도 떠올랐나.
   *
   * ⚠ 이게 없으면 **타자마자 내린다.** 타는 건 땅에 있을 때뿐이고, 내리는 조건도
   *   "땅에 있을 때" 라서, 태운 바로 다음 프레임에 착륙 판정이 걸린다.
   *   실제로 그래서 아무리 눌러도 안 타지는 것처럼 보였다 —
   *   탄 적이 없는 게 아니라 같은 프레임에 내려버린 것이었다.
   */
  const flewRef = useRef(false);

  // 출발 시각을 방과 주고받는다. 받아 적기 · 되풀이 알림 · 끝난 편 지우기.
  useBalloonSchedule(riding);
  const departAt = useScheduleStore((state) => state.departAt);

  useInteractable({
    id: BALLOON_PANEL_ID,
    position: BALLOON_PAD,
    approachPoint: BALLOON_APPROACH,
    radius: 3,
    label: t().balloon.label,
    labelHeight: 3.2,
    /**
     * 이름표는 근처에서만. 기구는 12m 짜리라 섬 어디서든 **눈에 보이는** 물건이고,
     * 그 위에 이름표까지 늘 떠 있으면 걸어다니는 내내 화면 한쪽을 차지한다.
     * 보이는 것과 안내하는 것은 다른 일이다.
     */
    labelRange: 14,
    enabled: !riding,
    onInteract: () => {
      // 뜨는 중에 올라타면 바닥을 뚫고 따라 올라간다.
      if (!boardableRef.current) return;
      // 아직 예정된 편이 없으면 지금 부른다. 있으면 그 편에 얹혀 탄다.
      callBalloon();
      board();
    },
  });

  // 타고 있는 동안엔 걸어다니는 UI 를 접는다. 발밑 이름표까지 다 뜨면 볼 게 없다.
  const setImmersive = useHudStore((state) => state.setImmersive);
  useEffect(() => {
    setImmersive(riding);
    return () => setImmersive(false);
  }, [riding, setImmersive]);

  // 내리면 카메라를 돌려주고 태우기를 멈춘다.
  useEffect(() => {
    if (riding) return;
    flewRef.current = false;
    setCameraShot(null);
    controllerRef.current?.carry(null);
  }, [riding, controllerRef]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;

    const flight = flightAt(
      serverNow() / 1000,
      departAt === null ? null : departAt / 1000,
      BALLOON_PAD,
    );
    boardableRef.current = flight.boardable;

    const ground = elevationAt(flight.x, flight.z);
    const worldY = ground + BASKET_FLOOR + flight.altitude;
    group.position.set(flight.x, worldY, flight.z);
    // 진행 방향으로 아주 조금 기운다. 완전히 수직이면 매달아 놓은 풍선이다.
    group.rotation.z = Math.sin(serverNow() / 4000) * 0.03;

    // 버너는 밤낮 없이 몇 초에 한 번 확 타오른다. 뜨는 동안엔 더 자주.
    const burner = burnerRef.current;
    if (burner) {
      const beat = Math.sin(serverNow() / 700);
      const firing = flight.phase === "rising" ? beat > -0.4 : beat > 0.75;
      burner.visible = firing;
    }

    if (!riding) return;

    /**
     * 타고 있는 동안 캐릭터는 바구니가 정한 자리에 있다.
     * y 는 **지면 기준**으로 넘긴다 — 렌더링이 지형 높이를 다시 더한다.
     */
    const rideX = flight.x + seat[0];
    const rideZ = flight.z + seat[1];
    controllerRef.current?.carry({
      x: rideX,
      z: rideZ,
      y: worldY - elevationAt(rideX, rideZ),
      // 다 같이 바깥(북쪽)을 본다. 서로 마주 보고 서 있으면 구경이 안 된다.
      yaw: 0,
    });

    /**
     * 카메라를 기구 뒤 위쪽으로 보낸다.
     *
     * 바라보는 지점을 기구보다 **북쪽 아래**로 잡는 게 요점이다. 기구를 화면
     * 한가운데 두면 하늘을 나는 게 아니라 풍선을 구경하는 화면이 되고,
     * 조금 앞을 내려다보면 그 아래로 섬이 통째로 들어온다.
     */
    setCameraShot({
      px: flight.x + RIDE_CAMERA_SIDE,
      py: worldY + RIDE_CAMERA_UP,
      pz: flight.z + RIDE_CAMERA_BACK,
      tx: flight.x,
      ty: Math.max(0, worldY - RIDE_LOOK_DOWN),
      tz: flight.z - RIDE_LOOK_AHEAD,
      fov: RIDE_FOV,
      glide: RIDE_GLIDE,
      /**
       * 좁은 화면에서는 기구에서 더 물러난다.
       *
       * ⚠ 이게 없으면 **세로 폰에서 기구가 화면을 통째로 먹는다.** fov 는 세로
       *   화각이라 가로가 좁아지는데, 이 컷의 요점은 아래에 펼쳐진 섬이다.
       *   의자 컷과 같은 곡선을 쓴다(game/camera/framing).
       */
      anchor: [flight.x, worldY, flight.z],
    });

    // 착지하면 자동으로 내린다. 내려주지 않으면 다음 편에 그대로 다시 뜬다.
    if (flight.phase !== "boarding" && flight.phase !== "waiting") {
      flewRef.current = true;
    } else if (flewRef.current) {
      flewRef.current = false;
      leave();
      controllerRef.current?.place(
        BALLOON_APPROACH[0],
        BALLOON_APPROACH[1],
        Math.PI,
      );
    }
  });

  return (
    <>
      {/* 계류장 — 널을 깐 자리에 계선주와 모래주머니. */}
      <mesh
        geometry={padGeometry}
        position={[BALLOON_PAD[0], padGround, BALLOON_PAD[1]]}
        rotation={[0, 0.3, 0]}
        castShadow
        receiveShadow
        onPointerDown={(event) => {
          event.stopPropagation();
          controllerRef.current?.moveTo(
            BALLOON_APPROACH[0],
            BALLOON_APPROACH[1],
            BALLOON_PANEL_ID,
          );
        }}
      >
        <CurvedMaterial vertexColors roughness={0.85} />
      </mesh>

      <group ref={groupRef}>
        <mesh
          geometry={geometry}
          castShadow
          onPointerDown={(event) => {
            event.stopPropagation();
            controllerRef.current?.moveTo(
              BALLOON_APPROACH[0],
              BALLOON_APPROACH[1],
              BALLOON_PANEL_ID,
            );
          }}
        >
          <CurvedMaterial vertexColors roughness={0.85} />
        </mesh>

        {/* 버너 불꽃. 스스로 빛나는 재질이라 밤에도 낮에도 같은 색으로 보인다. */}
        <group ref={burnerRef} visible={false}>
          <mesh geometry={burnerGeometry}>
            <CurvedBasicMaterial vertexColors transparent opacity={0.85} />
          </mesh>
        </group>
      </group>
    </>
  );
}
