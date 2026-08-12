import { elevationAt, shoreDistance } from "@/game/core/island";
import type { WaterModel } from "./simulation";

/**
 * 이 섬의 물.
 *
 * 시뮬레이션은 섬의 모양을 모른다(simulation.ts 의 WaterModel 참고).
 * 그 빈칸을 실제 지형으로 채우는 게 이 파일이고, 그래서 여기는 세 줄뿐이다.
 */

/**
 * 물가 안쪽으로 이만큼은 겹쳐 준다(m).
 *
 * ⚠ 이 겹침이 없으면 **밀쳐진 사람이 물가 바로 앞에서 멈춘다.** 네비 그리드는
 *   몸 두께만큼 안쪽으로 깎여 있어서(buildNavGrid 의 radius), 걸을 수 있는 땅은
 *   실제 물가보다 한 뼘 앞에서 끝난다. 그 한 뼘은 "걸을 수도 없고 물도 아닌"
 *   띠가 되어, 날아가던 사람이 거기 부딪혀 섰다.
 *   모래밭이라 어차피 아무것도 안 서 있는 자리다.
 */
const SHORE_OVERLAP = 1.2;

export const ISLAND_WATER: WaterModel = {
  groundHeight: elevationAt,
  /**
   * 물가 안쪽은 0 으로 본다.
   *
   * ⚠ 이 겹침이 없으면 **밀쳐진 사람이 물가 바로 앞에서 멈춘다.** 네비 그리드는
   *   몸 두께만큼 안쪽으로 깎여 있어서, 걸을 수 있는 땅은 실제 물가보다 한 뼘
   *   앞에서 끝난다. 그 한 뼘이 "걸을 수도 없고 물도 아닌" 띠가 되어, 날아가던
   *   사람이 거기 부딪혀 섰다. 모래밭이라 어차피 아무것도 안 서 있는 자리다.
   */
  offshore: (x, z) => Math.max(0, shoreDistance(x, z) + SHORE_OVERLAP),
};
