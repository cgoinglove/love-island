"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { useInteractables } from "@/game/core/interactable";
import { ISLAND_BASE_RADIUS, shoreRadiusAt } from "@/game/core/island";
import { usePlayerController } from "@/game/core/playerControl";
import { getPeers } from "@/game/net/presence";

/**
 * 미니맵. Canvas 안에 있지만 3D 를 그리지 않는다 — useFrame 을 얻으려고 여기 있다.
 *
 * 섬이 반지름 26m 로 커지면서 "저 라벨이 어느 방향이지"가 실제 문제가 됐다.
 * 2D 캔버스에 직접 그리므로 리렌더가 0회다 — 초당 60번 도는 그림을 React 로 그리면
 * 그것만으로 프레임을 잡아먹는다. (기획서 §4.1)
 */

const SIZE = 132;
const PADDING = 8;

export function Minimap({
  canvasRef,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  const controllerRef = usePlayerController();
  const items = useInteractables();
  const lastDraw = useRef(0);

  useFrame(() => {
    const canvas = canvasRef.current;
    const pose = controllerRef.current?.pose();
    if (!canvas || !pose) return;

    // 초당 20번이면 충분하다. 미니맵은 조작 대상이 아니라 참조 대상이다.
    const now = performance.now();
    if (now - lastDraw.current < 50) return;
    lastDraw.current = now;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const half = SIZE / 2;
    const scale = (half - PADDING) / (ISLAND_BASE_RADIUS * 1.25);
    const toScreen = (x: number, z: number): [number, number] => [
      half + x * scale,
      half + z * scale,
    ];

    ctx.clearRect(0, 0, SIZE, SIZE);

    // 바다
    ctx.fillStyle = "rgba(12,22,34,0.72)";
    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.fill();

    // 섬 윤곽 — 실제 해안선 수식을 그대로 쓴다
    ctx.beginPath();
    for (let i = 0; i <= 72; i++) {
      const angle = (i / 72) * Math.PI * 2;
      const radius = shoreRadiusAt(angle);
      const [px, py] = toScreen(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
      );
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(94,174,66,0.22)";
    ctx.fill();
    ctx.strokeStyle = "rgba(126,214,140,0.55)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // 컨텐츠 위치
    for (const item of items) {
      const [px, py] = toScreen(item.position[0], item.position[1]);
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#fbbf24";
      ctx.fill();
    }

    // 다른 접속자
    for (const peer of getPeers().values()) {
      const snapshot = peer.buffer[peer.buffer.length - 1];
      if (!snapshot) continue;
      const [px, py] = toScreen(snapshot.x, snapshot.z);
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#38bdf8";
      ctx.fill();
    }

    // 나 — 방향까지 보여준다. 점만 찍으면 어디를 보는지 모른다
    const [mx, my] = toScreen(pose.x, pose.z);
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(-pose.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 4);
    ctx.lineTo(0, 1.5);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fillStyle = "#34d399";
    ctx.fill();
    ctx.restore();
  });

  return null;
}

/** 미니맵이 그려질 DOM 쪽. Canvas 밖에 산다. */
export function MinimapFrame({
  canvasRef,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  return (
    <div className="pointer-events-none fixed right-5 bottom-5 z-10 hidden sm:block">
      {/*
        둥근 나무 테. 사각 카드는 "지도 위젯"이고 둥근 테는 "손에 든 나침반"이다 —
        같은 캔버스라도 테두리 하나로 웹 UI 와 게임 UI 가 갈린다.
      */}
      <div className="relative rounded-full bg-[#7d5836] p-2 ring-[3px] ring-[#4a3428] shadow-[0_8px_0_-3px_rgba(74,52,40,0.4),0_16px_28px_-10px_rgba(0,0,0,0.5)]">
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          className="block rounded-full ring-2 ring-[#4a3428]/60"
          style={{ width: SIZE, height: SIZE }}
        />
        {/* 북쪽 표시. 나침반이라면 있어야 할 단 하나의 글자. */}
        <span className="-top-1 -translate-x-1/2 absolute left-1/2 flex size-6 items-center justify-center rounded-full bg-[#e8734a] font-bold text-[11px] text-[#fff6ef] ring-2 ring-[#4a3428]">
          N
        </span>
      </div>
    </div>
  );
}
