import { describe, expect, it } from "vitest";
import { BOT_TOPICS } from "@/game/core/bot/script";
import { pathDuration, poseAlongPath } from "@/game/core/bot/state";
import { LANDMARKS } from "@/game/core/island";
import { getIslandData } from "@/game/core/islandData";
import { findPath } from "@/game/core/nav/astar";
import { canStandAt, snapToWalkable } from "@/game/core/nav/grid";
import { FIXED_DT } from "@/shared/constants";
import type { Vec2XZ } from "@/shared/types";
import {
  createPathFollower,
  followPath,
  isFollowing,
  setPath,
} from "./pathFollow";
import { createPlayerState, DEFAULT_MOVE, stepPlayer } from "./simulation";

/**
 * 실제 섬을 대상으로 하는 회귀 테스트.
 *
 * game/core 가 아니라 game/player 에 있는 이유: 이 테스트는 코어(네비)와
 * 플레이어(시뮬레이션)를 **함께** 검증하므로 코어보다 위 레이어에 속한다.
 * 처음엔 core/nav 아래 뒀다가 경계 린트에 막혔다 — 규칙이 맞았다.
 *
 * 여기 있는 테스트가 잡으려는 버그는 실제로 한 번 났던 것이다:
 * A* 는 "땅이 있나"(점)를 보고 이동은 "몸이 들어가나"(원)를 봐서,
 * 경로는 멀쩡히 나오는데 캐릭터가 나무 사이에 끼어 영원히 도착하지 못했다.
 *
 * 유닛 테스트로는 안 잡혔다 — 손으로 그린 ASCII 맵에는 그런 틈이 없었으니까.
 * **경로를 실제로 걸어보는 것**만이 이걸 잡는다.
 */

const { navGrid } = getIslandData();

/**
 * 좌표를 LANDMARKS 에서 뽑는다.
 * 전에는 여기 좌표를 하드코딩했다가 컨텐츠를 옮기고 테스트만 안 고쳐서 깨졌다 —
 * 한 곳에서 파생시키면 그 종류의 어긋남이 안 생긴다.
 *
 * 랜드마크 중심에는 오브젝트가 서 있어 통행이 막혀 있을 수 있으므로,
 * 가장 가까운 설 수 있는 자리로 스냅해서 쓴다. 실제 approachPoint 가 하는 일과 같다.
 */
const SPOTS: ReadonlyArray<readonly [string, Vec2XZ]> = LANDMARKS.map(
  ([x, z, , label]) => {
    const snapped = snapToWalkable(navGrid, x, z);
    if (!snapped) throw new Error(`${label} 근처에 설 수 있는 자리가 없습니다`);
    return [label, snapped] as const;
  },
);

/** 경로를 따라 실제로 걸어본다. 도착하면 걸린 시간(초), 못 하면 null. */
function walkAlong(from: Vec2XZ, to: Vec2XZ): number | null {
  const state = createPlayerState(from[0], from[1]);
  const follower = createPathFollower();
  const path = findPath(navGrid, from, to);
  if (path.length === 0) return null;
  setPath(follower, path, "arrive");

  const MAX_STEPS = 60 * 90;
  let steps = 0;
  while (isFollowing(follower) && steps < MAX_STEPS) {
    const axis = followPath(follower, state.x, state.z, 0.4);
    stepPlayer(
      state,
      { axis, jump: false, sprint: false },
      FIXED_DT,
      DEFAULT_MOVE,
      navGrid,
    );
    steps++;
  }
  return follower.arrived ? steps / 60 : null;
}

describe("섬 네비게이션", () => {
  it("모든 랜드마크 근처에 설 수 있는 자리가 있다", () => {
    for (const [name, spot] of SPOTS) {
      expect(canStandAt(navGrid, spot[0], spot[1]), name).toBe(true);
    }
  });

  it("랜드마크 반경이 오브젝트를 놓을 만큼 넉넉하다", () => {
    // 반경이 좁으면 게시판이 나무에 파묻혀 라벨만 보이고 오브젝트는 안 보인다.
    for (const [, , radius, label] of LANDMARKS) {
      expect(radius, label).toBeGreaterThan(2.5);
    }
  });

  it("어떤 랜드마크에서 어떤 랜드마크로도 실제로 걸어갈 수 있다", () => {
    const failures: string[] = [];
    for (const [fromName, from] of SPOTS) {
      for (const [toName, to] of SPOTS) {
        if (fromName === toName) continue;
        if (walkAlong(from, to) === null)
          failures.push(`${fromName}→${toName}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("A* 가 돌려준 웨이포인트는 전부 설 수 있는 자리다", () => {
    // 이게 깨지면 캐릭터는 도달할 수 없는 점을 향해 벽에 몸을 비비게 된다.
    for (const [, from] of SPOTS) {
      for (const [, to] of SPOTS) {
        for (const [x, z] of findPath(navGrid, from, to)) {
          expect(canStandAt(navGrid, x, z)).toBe(true);
        }
      }
    }
  });

  it("스폰에서 모든 컨텐츠에 20초 안에 닿는다", () => {
    // 들어오자마자 보여야 하는 것들이다. 멀면 그 자체로 설계가 틀린 것이다.
    const spawn = SPOTS[0];
    expect(spawn).toBeDefined();
    for (const [name, spot] of SPOTS.slice(1)) {
      const seconds = walkAlong(spawn?.[1] as Vec2XZ, spot);
      expect(seconds, name).not.toBeNull();
      expect(seconds ?? 999, name).toBeLessThan(20);
    }
  });
});

describe("봇이 실제로 걸어간다", () => {
  it("안내 경로가 출발점부터 시작한다", () => {
    /**
     * findPath 는 **출발점을 빼고** 돌려준다 — 플레이어는 이미 거기 서 있으니까.
     * 그걸 그대로 봇의 경로로 쓰면, 막힘없는 직선 구간에서 경로가 [목적지] 한 점이 되고
     * poseAlongPath 가 "이미 도착"으로 읽어 봇이 곧장 찍힌다.
     * 실제로 그게 "순간이동"의 정체였다.
     */
    const grid = getIslandData().navGrid;
    const from: Vec2XZ = [4, 25];
    const to: Vec2XZ = [-11.8, 16.6];

    const waypoints = findPath(grid, from, to);
    expect(waypoints.length).toBeGreaterThan(0);

    const path: Vec2XZ[] = [from, ...waypoints];
    // 출발 직후엔 출발점 근처에 있어야 한다. 목적지에 있으면 순간이동한 것이다.
    const justStarted = poseAlongPath(path, 0.05);
    expect(
      Math.hypot(justStarted.x - from[0], justStarted.z - from[1]),
    ).toBeLessThan(1);
    expect(justStarted.moving).toBe(true);

    // 걷는 시간이 거리에 맞아야 한다. 13m 를 1초 만에 가면 그것도 순간이동이다.
    expect(pathDuration(path)).toBeGreaterThan(2);
  });

  it("봇이 안내하는 모든 자리까지 걸어갈 수 있다", () => {
    // 대본에 도달 못 하는 좌표를 적으면 봇이 제자리에서 말만 하고 만다.
    const grid = getIslandData().navGrid;
    for (const topic of BOT_TOPICS) {
      if (!topic.guideTo) continue;
      const waypoints = findPath(grid, BOT_HOME_FOR_TEST, topic.guideTo);
      expect(waypoints.length, topic.id).toBeGreaterThan(0);
    }
  });
});

/** GuideBot 의 BOT_HOME 과 같은 자리. 봇이 늘 여기서 출발한다. */
const BOT_HOME_FOR_TEST: Vec2XZ = [4, 25];
