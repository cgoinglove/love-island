import { FURNITURE, isLandAt } from "@/game/core/island";
import { buildNavGrid, type NavGrid } from "@/game/core/nav/grid";
import { ISLAND_GRID, PLAYER_RADIUS } from "@/shared/constants";

/**
 * 섬은 상수다. 좌표가 전부 손으로 정해져 있어서 언제 계산해도 같은 결과가 나온다.
 * 그래서 모듈 수준에서 한 번만 굽고 모두가 같은 객체를 본다 —
 * 컴포넌트마다 useMemo 로 다시 굽거나 props 로 내려보낼 이유가 없다.
 */

export interface IslandData {
  readonly navGrid: NavGrid;
}

let cached: IslandData | null = null;

export function getIslandData(): IslandData {
  if (cached !== null) return cached;

  const navGrid = buildNavGrid(
    ISLAND_GRID,
    (x, z) => {
      if (!isLandAt(x, z)) return false;
      // 야자수 밑동은 몸으로 막는다.
      // 통과해버리면 그냥 그림이 되고, 부딪히는 맛이 사라진다.
      for (const item of FURNITURE) {
        if (
          item.blockRadius > 0 &&
          Math.hypot(x - item.x, z - item.z) < item.blockRadius
        ) {
          return false;
        }
      }
      return true;
    },
    PLAYER_RADIUS,
  );

  cached = { navGrid };
  return cached;
}
