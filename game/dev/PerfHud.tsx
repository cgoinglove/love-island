"use client";

import { useFrame, useThree } from "@react-three/fiber";
import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import { PERF_BUDGET } from "@/shared/constants";

/**
 * 성능 예산 계기판 (기획서 §8.1).
 *
 * 이 HUD 자체가 §4.1 의 실전 예시다: 초당 4번 갱신되는 숫자를 useState 로 관리하면
 * 그 리렌더 때문에 측정 대상이 오염된다. 그래서 DOM 노드를 ref 로 잡고
 * textContent 를 직접 쓴다 — 리렌더 0회.
 *
 * 예산을 넘긴 항목엔 ! 가 붙는다. 경고는 무시하게 되지만 눈에 띄는 표시는 못 무시한다.
 */

const SAMPLE_INTERVAL = 0.25;

export function PerfProbe({
  target,
}: {
  target: RefObject<HTMLPreElement | null>;
}) {
  const gl = useThree((state) => state.gl);
  const elapsed = useRef(0);
  const frames = useRef(0);

  /**
   * 후처리를 켜면 EffectComposer 가 프레임마다 여러 번 render() 를 부르고,
   * three 는 그때마다 info 를 리셋한다. 그래서 계기판이 "드로우콜 1" 을 찍었다 —
   * 마지막 패스만 본 것이다. 자동 리셋을 끄고 우리가 직접 비운다.
   */
  useEffect(() => {
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);

  /** 직전 프레임의 실제 합계. 표시는 가끔 하지만 수집은 매 프레임 한다. */
  const snapshot = useRef({ calls: 0, triangles: 0 });

  useFrame((_, delta) => {
    /**
     * 이 콜백은 EffectComposer(우선순위 1)보다 먼저 돈다.
     * 그래서 지금 gl.info 에 들어 있는 건 **직전 프레임 전체**의 합계다.
     * 읽고 나서 비워야 다음 프레임 것과 안 섞인다 —
     * 안 비웠더니 15프레임어치가 합쳐져 드로우콜 2416 이 찍혔다.
     */
    snapshot.current.calls = gl.info.render.calls;
    snapshot.current.triangles = gl.info.render.triangles;
    gl.info.reset();

    frames.current += 1;
    elapsed.current += delta;
    if (elapsed.current < SAMPLE_INTERVAL) return;

    const fps = frames.current / elapsed.current;
    frames.current = 0;
    elapsed.current = 0;

    const node = target.current;
    if (!node) return;

    const { calls, triangles } = snapshot.current;
    const { memory } = gl.info;
    node.textContent = [
      row("fps", fps.toFixed(0), fps >= 30),
      row("draw", calls, calls <= PERF_BUDGET.drawCalls),
      row("tris", triangles, triangles <= PERF_BUDGET.triangles),
      // 룸을 오갈 때 이 두 줄이 계속 올라가면 dispose 를 빼먹은 것이다. (기획서 §4.5)
      row(
        "geo",
        memory.geometries,
        memory.geometries <= PERF_BUDGET.geometries,
      ),
      row("tex", memory.textures, memory.textures <= PERF_BUDGET.textures),
    ].join("\n");
  });

  return null;
}

function row(
  label: string,
  value: string | number,
  withinBudget: boolean,
): string {
  return `${withinBudget ? " " : "!"} ${label.padEnd(5)}${String(value).padStart(7)}`;
}

export function PerfPanel({ ref }: { ref: RefObject<HTMLPreElement | null> }) {
  return (
    <pre
      ref={ref}
      className="pointer-events-none fixed left-3 top-3 z-10 rounded-md bg-black/55 px-2.5 py-2 font-mono text-[11px] leading-4 text-lime-200 tabular-nums"
    />
  );
}
