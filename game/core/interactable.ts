"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Vec2XZ } from "@/shared/types";

/**
 * 상호작용 레지스트리 — 의존성 역전의 실전 예시. (기획서 §4.3)
 *
 * 코어는 feature 를 하나도 모른다. feature 가 자기를 여기 등록하면
 * 근접 판정 · HUD 프롬프트 · 탭하면 걸어가서 자동 실행이 전부 공짜로 따라온다.
 * 새 기능을 붙일 때 이 파일은 한 줄도 안 바뀐다.
 */

export interface Interactable {
  readonly id: string;
  /** 오브젝트가 놓인 자리. 근접 판정의 기준. */
  readonly position: Vec2XZ;
  /** 탭했을 때 실제로 걸어갈 지점. 오브젝트 안으로 파고들지 않게 살짝 앞. */
  readonly approachPoint: Vec2XZ;
  /** 이 거리 안에 들어오면 HUD 에 프롬프트가 뜬다. */
  readonly radius: number;
  readonly label: string;
  /**
   * 이름표가 뜰 높이(m). 오브젝트 꼭대기보다 조금 위여야 한다.
   *
   * 하나로 고정했더니 3.6m 짜리 게시판에서는 이름표가 판 한가운데를 가렸다 —
   * 무엇에 붙은 이름표인지 알리려다 정작 그 무엇을 가린 셈이다.
   */
  readonly labelHeight?: number | undefined;
  /**
   * 지금 등록돼 있어야 하는가. 기본은 참.
   *
   * 낚시처럼 **자기 자신이 모드로 들어가는** 오브젝트는, 그 모드에 있는 동안
   * 이름표가 화면에 남아 있으면 정작 봐야 할 것(찌)을 가린다.
   */
  readonly enabled?: boolean | undefined;
  readonly onInteract: () => void;
}

const registry = new Map<string, Interactable>();

/**
 * 등록 목록을 구독할 수 있게 한다.
 *
 * 이게 있어야 "등록된 모든 상호작용에 떠 있는 이름표를 붙이는" 컴포넌트를
 * 한 번만 쓰고 끝낼 수 있다 — feature 는 여전히 자기를 등록만 하고,
 * 새 feature 를 붙일 때 이름표 코드는 한 줄도 안 늘어난다.
 */
const listeners = new Set<() => void>();

/**
 * useSyncExternalStore 는 getSnapshot 이 매번 같은 참조를 돌려주길 요구한다.
 * 호출할 때마다 새 배열을 만들면 무한 렌더에 빠진다. 그래서 바뀔 때만 새로 만든다.
 */
let snapshot: Interactable[] = [];

function publish(): void {
  snapshot = [...registry.values()];
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 등록된 상호작용 전부. 목록이 바뀔 때만 리렌더된다. */
export function useInteractables(): Interactable[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    // 서버 렌더에는 아무것도 없다 (Canvas 자체가 클라이언트 전용이다).
    () => EMPTY,
  );
}

const EMPTY: Interactable[] = [];

/**
 * 컴포넌트가 살아있는 동안 자기를 등록해둔다.
 *
 * 의존성은 id 하나뿐이다. position 배열이나 onInteract 클로저는 렌더마다 새로 생기므로
 * 의존성에 넣으면 매 렌더 재등록이 돈다. 대신 getter 로 항상 최신 값을 읽는다.
 */
export function useInteractable(definition: Interactable): void {
  const latest = useRef(definition);
  useEffect(() => {
    latest.current = definition;
  });

  const { id, enabled = true } = definition;
  useEffect(() => {
    if (!enabled) return;
    const entry: Interactable = {
      id,
      get position() {
        return latest.current.position;
      },
      get approachPoint() {
        return latest.current.approachPoint;
      },
      get radius() {
        return latest.current.radius;
      },
      get label() {
        return latest.current.label;
      },
      /**
       * ⚠ getter 로 노출해야 한다. 값으로 복사하면 등록 시점의 값에 얼어붙는데,
       *   실제로 그래서 labelHeight 가 통째로 무시됐다 — 게시판 이름표가
       *   판 한가운데를 가리고 있었는데 원인이 여기였다.
       */
      get labelHeight() {
        return latest.current.labelHeight;
      },
      onInteract: () => latest.current.onInteract(),
    };
    registry.set(id, entry);
    publish();
    return () => {
      registry.delete(id);
      publish();
    };
  }, [id, enabled]);
}

export function getInteractable(id: string): Interactable | undefined {
  return registry.get(id);
}

/** 반경 안에 들어온 것 중 가장 가까운 하나. 없으면 null. */
export function findNearest(x: number, z: number): Interactable | null {
  let best: Interactable | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const entry of registry.values()) {
    const distance = Math.hypot(x - entry.position[0], z - entry.position[1]);
    if (distance > entry.radius || distance >= bestDistance) continue;
    best = entry;
    bestDistance = distance;
  }
  return best;
}
