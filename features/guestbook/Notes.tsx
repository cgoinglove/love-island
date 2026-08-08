"use client";

import { useLayoutEffect, useRef } from "react";
import { Color, type InstancedMesh, Object3D } from "three";
import { elevationAt } from "@/game/core/island";
import { useHudStore } from "@/game/hud/store";
import { CurvedMaterial } from "@/game/world/curvature";
import { ROOM_ISLAND } from "@/shared/constants";
import { useGuestbookFeed } from "./api";
import { GUESTBOOK_PANEL_ID } from "./constants";

/**
 * 방문자들이 남기고 간 쪽지. 섬 바닥에 흩어져 있다.
 *
 * "혼자 와도 사람 냄새가 나야 한다"는 컨셉의 절반이 이것이다 —
 * 아무도 접속해 있지 않아도 누군가 다녀간 흔적이 눈에 보인다. (기획서 §1)
 *
 * 쪽지가 수십 장이면 개별 메시로는 드로우콜도 그만큼이다. InstancedMesh 로 1개로 만든다.
 */
const PAPER_COLORS = ["#fff6d8", "#ffe6ea", "#e4f2ff", "#eaffe8", "#fdeaff"];

export function Notes() {
  const meshRef = useRef<InstancedMesh>(null);
  const { entries } = useGuestbookFeed(ROOM_ISLAND);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || entries.length === 0) return;

    const dummy = new Object3D();
    const color = new Color();

    entries.forEach((entry, index) => {
      dummy.position.set(
        entry.posX,
        elevationAt(entry.posX, entry.posZ) + 0.012,
        entry.posZ,
      );
      // id 문자열을 의사난수로 쓴다. 같은 쪽지는 언제 봐도 같은 각도로 놓여 있다.
      const seed = hashString(entry.id);
      dummy.rotation.set(-Math.PI / 2, 0, (seed % 360) * (Math.PI / 180));
      dummy.scale.setScalar(0.92 + (seed % 17) / 100);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);

      color.set(PAPER_COLORS[seed % PAPER_COLORS.length] ?? "#fff6d8");
      mesh.setColorAt(index, color);
    });

    mesh.count = entries.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      // key 로 재마운트시켜 인스턴스 버퍼 크기를 다시 잡는다.
      // three 의 InstancedMesh 는 생성 후 최대 개수를 늘릴 수 없다.
      key={entries.length}
      args={[undefined, undefined, entries.length]}
      receiveShadow
      frustumCulled={false}
      onPointerDown={(event) => {
        event.stopPropagation();
        useHudStore.getState().openPanel(GUESTBOOK_PANEL_ID);
      }}
    >
      <planeGeometry args={[0.34, 0.26]} />
      <CurvedMaterial roughness={0.9} />
    </instancedMesh>
  );
}

/** 문자열 → 안정적인 양수. 결정적인 배치를 위해서만 쓴다. */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}
