/**
 * GLSL 조각 모음.
 *
 * ⚠ 여기 있는 shoreRadius / waveHeight 는 game/core/island.ts 의 TypeScript 함수를
 *   손으로 이식한 것이다. 한쪽만 고치면 물거품이 해안선에서 어긋난다.
 *   island.ts 의 하모닉 계수를 바꾸면 반드시 여기도 같이 바꿔야 한다.
 */

/**
 * 지평선 곡률. 동물의숲 룩의 핵심 세 가지(카메라 · 곡률 · 톤매핑) 중 하나.
 *
 * ⚠ 낙차는 반드시 **월드 공간**에서 계산하고 csm_PositionRaw 로 직접 투영한다.
 *
 * 처음엔 csm_Position(로컬)의 y 를 내렸다. 그러자
 *  ① 인스턴스 스케일만큼 낙차가 증폭됐고 (산이 바다 밑으로 사라짐)
 *  ② 회전된 메시는 로컬 y 가 월드 아래가 아니라서 **옆으로 밀렸다**
 *     — 바닥에 눕힌 쪽지·파라솔 지붕·선베드 등받이가 전부 떠 보였다
 *  ③ 그림자 수신 좌표(transformed)가 함께 밀려 그림자가 오브젝트에서 떨어졌다
 *
 * 월드에서 내리고 클립 공간을 직접 만들면 셋 다 사라진다. transformed 는 건드리지
 * 않으므로 그림자 캐스터/리시버가 같은(휘지 않은) 공간을 쓰게 되어 서로 맞는다.
 */
export const CURVATURE_VERTEX = /* glsl */ `
  uniform float uCurvature;

  vec4 curvedWorld(vec3 localPosition) {
    vec4 world = modelMatrix * vec4(localPosition, 1.0);
    #ifdef USE_INSTANCING
      world = modelMatrix * instanceMatrix * vec4(localPosition, 1.0);
    #endif

    float d = distance(world.xz, cameraPosition.xz);
    world.y -= d * d * uCurvature;
    return world;
  }
`;

/**
 * island.ts 의 shoreRadiusAt / shoreDistance 를 그대로 옮긴 것 — **하트 모양**이다.
 *
 * ⚠ 40.0 은 ISLAND_BASE_RADIUS, 나머지는 하트를 근사한 사인 급수 계수다.
 *   한쪽만 고치면 물거품이 실제 해안선에서 떨어진 곳에 생긴다.
 *   반지름만 안 고쳐서 9m 어긋났던 적이 있고, shoreSync.test.ts 가 그래서 있다.
 */
export const SHORE_GLSL = /* glsl */ `
  float shoreRadiusAt(float angle) {
    return 40.0 * (
      0.7747
      - 0.0268 * sin(angle)
      - 0.1665 * sin(3.0 * angle)
      + 0.0432 * sin(5.0 * angle)
      - 0.0325 * sin(7.0 * angle)
      + 0.0186 * sin(9.0 * angle)
    );
  }

  float shoreDistance(vec2 p) {
    return length(p) - shoreRadiusAt(atan(p.y, p.x));
  }
`;

/** 파도 높이. 사인 네 겹이면 반복 주기가 충분히 길어 눈에 안 띈다. */
export const WAVE_GLSL = /* glsl */ `
  float waveHeight(vec2 p, float t) {
    float h = 0.0;
    h += sin(p.x * 0.35 + t * 0.90) * 0.100;
    h += sin(p.y * 0.29 - t * 0.75) * 0.090;
    h += sin((p.x + p.y) * 0.19 + t * 1.25) * 0.070;
    h += sin((p.x - p.y) * 0.47 - t * 1.60) * 0.035;
    return h;
  }

  vec3 waveNormal(vec2 p, float t) {
    float e = 0.4;
    float left  = waveHeight(p - vec2(e, 0.0), t);
    float right = waveHeight(p + vec2(e, 0.0), t);
    float down  = waveHeight(p - vec2(0.0, e), t);
    float up    = waveHeight(p + vec2(0.0, e), t);
    return normalize(vec3(left - right, 2.0 * e, down - up));
  }
`;

export const OCEAN_VERTEX = /* glsl */ `
  ${CURVATURE_VERTEX}
  ${WAVE_GLSL}

  uniform float uTime;
  varying vec3 vWorld;

  void main() {
    // 물거품·수심 계산은 휘기 전 좌표로 한다. xz 는 어차피 안 변한다.
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;

    vec4 world = curvedWorld(position);
    world.y += waveHeight(vWorld.xz, uTime);
    csm_PositionRaw = projectionMatrix * viewMatrix * world;
  }
`;

export const OCEAN_FRAGMENT = /* glsl */ `
  ${SHORE_GLSL}
  ${WAVE_GLSL}

  uniform float uTime;
  uniform vec3 uShallowColor;
  uniform vec3 uDeepColor;
  uniform vec3 uFoamColor;
  uniform vec3 uSunDirection;
  varying vec3 vWorld;

  void main() {
    float toShore = shoreDistance(vWorld.xz);

    // 얕은 물은 청록, 깊은 물은 남색. 이 그라데이션 하나로 섬의 윤곽이 물 위에 드러난다.
    float depth = smoothstep(-1.0, 16.0, toShore);
    vec3 color = mix(uShallowColor, uDeepColor, depth);

    // 물거품은 해안선을 따라 생기되, 파도에 맞춰 밀려왔다 밀려간다.
    float swell = waveHeight(vWorld.xz * 1.6, uTime * 0.8) * 5.0;
    float foam = smoothstep(1.5, 0.05, abs(toShore + 0.6 + swell));
    color = mix(color, uFoamColor, foam * 0.9);

    // 얕은 곳은 투명해서 모래톱이 비쳐 보인다.
    float alpha = mix(0.62, 0.97, depth);
    alpha = max(alpha, foam * 0.95);

    csm_DiffuseColor = vec4(color, alpha);

    // 프래그먼트에서 노멀을 덮어쓸 땐 csm_Normal 이 아니라 csm_FragNormal 이고,
    // 기본값이 normalize(vNormal) 이라 **뷰 공간**을 기대한다.
    // waveNormal 은 +Y 가 위인 월드 공간이므로 viewMatrix 로 옮겨준다.
    vec3 worldNormal = waveNormal(vWorld.xz, uTime);
    csm_FragNormal = normalize((viewMatrix * vec4(worldNormal, 0.0)).xyz);

    /**
     * 태양이 물 위에 남기는 반짝이는 길.
     *
     * 후처리 블룸으로 만들려다 화면 전체가 씻겨서 접었다.
     * 물결 노멀과 태양 방향의 각도로 직접 계산하면 **물에만** 걸린다 —
     * 필요한 곳에만 효과를 주는 게 화면 전체에 효과를 거는 것보다 거의 언제나 낫다.
     */
    vec2 toSun = normalize(uSunDirection.xz);
    vec2 toFragment = normalize(vWorld.xz + vec2(0.001));
    float aligned = max(0.0, dot(toSun, toFragment));
    float band = pow(aligned, 42.0);
    float sparkle = pow(max(0.0, worldNormal.x * toSun.x + worldNormal.z * toSun.y + 0.4), 6.0);
    csm_Emissive = vec3(1.0, 0.93, 0.78) * band * sparkle * 0.85 * (1.0 - foam);

    csm_Roughness = mix(0.08, 0.35, foam);
  }
`;

export const CURVED_VERTEX = /* glsl */ `
  ${CURVATURE_VERTEX}

  void main() {
    csm_PositionRaw = projectionMatrix * viewMatrix * curvedWorld(position);
  }
`;

/**
 * 발밑 접촉 그림자.
 *
 * 텍스처를 굽지 않고 셰이더에서 바로 그린다. 처음엔 캔버스에 방사형 그라데이션을
 * 그려 CanvasTexture 로 넘겼는데, 그러면 텍스처 한 장이 늘고 SSR 에서 document 를
 * 건드리게 되며, 무엇보다 **맵이 셰이더까지 닿지 않으면 새하얀 원반**이 된다.
 * 실제로 그렇게 나왔다. 원의 uv 하나로 풀 수 있는 걸 텍스처로 우회할 이유가 없다.
 */
/**
 * 뱃등이 쏘는 빛줄기.
 *
 * ── 왜 셰이더가 필요한가 ──
 * 처음엔 원뿔 껍데기에 **정점 알파**로 그라데이션을 구웠다. 길이 방향으로는
 * 옅어졌지만 옆으로는 그럴 수가 없었다 — 껍데기의 정점은 전부 원뿔의 **테두리**에
 * 있어서, 가운데를 밝게 할 자리가 애초에 없다. 결과는 흰 삼각형 한 장이었다.
 * 종이를 오려 붙인 것처럼 보였고, 실제로 "이게 뭐냐" 는 말을 들었다.
 *
 * ── 어떻게 부피처럼 보이나 ──
 * 껍데기의 **법선이 카메라를 정면으로 보는 지점이 빔의 한가운데**이고,
 * 실루엣 가장자리에서는 법선이 시선과 직각이 된다. 그래서 `dot(법선, 시선)` 하나로
 * 가운데는 밝고 가장자리는 사라지는 분포가 나온다 — 안쪽 벽과 바깥쪽 벽이
 * 더해지면서(양면 · 더하기 합성) 진짜 빛기둥처럼 속이 찬다.
 *
 * 이건 부피 렌더링이 아니라 **껍데기 하나로 부피를 흉내내는** 오래된 방법이고,
 * 이 정도 거리(40m)에서는 구분이 안 된다.
 */
export const BEAM_VERTEX = /* glsl */ `
  ${CURVATURE_VERTEX}

  uniform float uBeamLength;

  varying vec3 vBeamNormal;
  varying vec3 vBeamEye;
  varying float vBeamAlong;

  void main() {
    // 원뿔은 꼭짓점이 원점이고 -Z 로 뻗는다. 0 = 등, 1 = 끝.
    vBeamAlong = clamp(-position.z / uBeamLength, 0.0, 1.0);

    vec4 world = curvedWorld(position);
    // 배가 돌고 기울므로 월드 공간으로 옮겨야 시선과 같은 좌표계가 된다.
    vBeamNormal = normalize(mat3(modelMatrix) * normal);
    vBeamEye = cameraPosition - world.xyz;

    csm_PositionRaw = projectionMatrix * viewMatrix * world;
  }
`;

export const BEAM_FRAGMENT = /* glsl */ `
  uniform vec3 uBeamColor;
  uniform float uBeamStrength;

  varying vec3 vBeamNormal;
  varying vec3 vBeamEye;
  varying float vBeamAlong;

  void main() {
    // 카메라를 마주 볼수록 빔의 한가운데다. 실루엣에서는 0 이 되어 경계가 녹는다.
    float facing = abs(dot(normalize(vBeamNormal), normalize(vBeamEye)));
    float core = pow(facing, 2.2);

    /**
     * 길이 방향 감쇠. 뿌리에서 진하고 끝에서 사라진다.
     * 꼭짓점 바로 앞은 오히려 살짝 눌러야 한다 — 등 자체의 발광과 겹쳐서
     * 그 한 점만 하얗게 타버린다.
     */
    float fade = pow(1.0 - vBeamAlong, 0.8) * smoothstep(0.0, 0.09, vBeamAlong);

    csm_DiffuseColor = vec4(uBeamColor, core * fade * uBeamStrength);
  }
`;

/**
 * 빛이 물에 닿아 생기는 웅덩이.
 *
 * 원판의 uv 로 가운데에서 바깥으로 부드럽게 죽인다 — 접촉 그림자와 같은 수법이고
 * 같은 이유다. 경계가 뚜렷하면 빛이 아니라 물 위에 붙인 스티커로 보인다.
 * 원판을 진행 방향으로 늘려도 uv 는 그대로라, 늘어난 만큼 타원으로 번진다.
 */
export const LIGHT_POOL_VERTEX = /* glsl */ `
  ${CURVATURE_VERTEX}

  varying vec2 vPoolUv;

  void main() {
    vPoolUv = uv;
    csm_PositionRaw = projectionMatrix * viewMatrix * curvedWorld(position);
  }
`;

export const LIGHT_POOL_FRAGMENT = /* glsl */ `
  uniform vec3 uPoolColor;
  uniform float uPoolStrength;

  varying vec2 vPoolUv;

  void main() {
    float d = length(vPoolUv - 0.5) * 2.0;
    float a = pow(max(0.0, 1.0 - d), 2.4) * uPoolStrength;
    csm_DiffuseColor = vec4(uPoolColor, a);
  }
`;

export const CONTACT_SHADOW_VERTEX = /* glsl */ `
  ${CURVATURE_VERTEX}

  varying vec2 vBlobUv;

  void main() {
    vBlobUv = uv;
    csm_PositionRaw = projectionMatrix * viewMatrix * curvedWorld(position);
  }
`;

export const CONTACT_SHADOW_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  varying vec2 vBlobUv;

  void main() {
    // circleGeometry 의 uv 는 중심이 (0.5, 0.5) 다.
    float d = length(vBlobUv - 0.5) * 2.0;
    // 가운데만 진하고 가장자리로 갈수록 빠르게 사라진다.
    // 경계가 뚜렷하면 바닥에 붙인 스티커로 보인다.
    float a = pow(max(0.0, 1.0 - d), 2.2) * uStrength;
    csm_DiffuseColor = vec4(0.0, 0.0, 0.0, a);
  }
`;

/**
 * 펄럭이는 천.
 *
 * 왼쪽(고정된 쪽)은 거의 안 움직이고 오른쪽으로 갈수록 크게 흔들린다 —
 * 진폭을 x 에 비례시키는 한 줄이 "매달린 천"과 "출렁이는 판"을 가른다.
 */
export const BANNER_VERTEX = /* glsl */ `
  ${CURVATURE_VERTEX}

  uniform float uTime;

  void main() {
    vec4 world = curvedWorld(position);

    // uv.x 0 = 왼쪽 기둥. 거기서 멀수록 크게 흔들린다.
    // 배너는 회전 없이 세워두므로(법선 +Z = 카메라 방향) 월드 z 로 민다.
    float grip = uv.x;
    float wave =
      sin(uv.x * 7.0 - uTime * 2.6) * 0.42 +
      sin(uv.x * 13.0 + uv.y * 3.0 - uTime * 3.7) * 0.16;

    world.z += wave * grip;
    // 펄럭이면 천이 아주 살짝 짧아 보인다. 아래로 조금 당긴다.
    world.y -= abs(wave) * grip * 0.12;

    csm_PositionRaw = projectionMatrix * viewMatrix * world;
  }
`;
