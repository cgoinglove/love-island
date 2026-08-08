import { BufferGeometry, Mesh } from "three";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from "three-mesh-bvh";

/**
 * three 의 기본 레이캐스트는 삼각형을 전부 순회한다.
 * 지형 메시가 7만 삼각형이라 탭 한 번에 7만 번 교차 판정을 돈다 — 모바일에서 눈에 띄게 버벅인다.
 * BVH 를 씌우면 로그 시간으로 떨어진다.
 *
 * 프로토타입 확장은 한 번만 해야 하므로 모듈 최상단에서 처리하고,
 * 이 모듈을 import 하는 것 자체가 "BVH 를 쓰겠다"는 선언이 된다.
 */
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;
