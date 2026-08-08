import {
  BufferAttribute,
  BufferGeometry,
  type Color,
  NormalBlending,
  ShaderMaterial,
} from "three";
import { curvatureUniforms } from "@/game/world/curvature";

/**
 * 감정표현 파티클 풀.
 *
 * 설계 하나만 기억하면 된다: **입자의 궤적은 CPU 가 아니라 셰이더가 계산한다.**
 *
 * 버스트마다 오브젝트를 만들고 매 프레임 위치를 갱신하면, 폭죽 한 번에 입자
 * 수백 개가 생기고 그게 곧바로 프레임 하락으로 나타난다. 대신 고정 크기 링버퍼를
 * 잡아두고, 스폰할 때 초기 조건(위치·속도·수명·색)만 한 번 써넣는다. 그 뒤로
 * CPU 는 아무것도 안 한다 — 셰이더가 uTime 하나로 모든 입자의 현재 위치를 푼다.
 *
 * 그래서 비용이 입자 수가 아니라 **버스트 횟수**에 비례한다.
 */

/** 셰이더가 푸는 운동방정식의 항. 종류마다 다른 건 이 두 값과 모양뿐이다. */
export interface ParticleSpec {
  ox: number;
  oy: number;
  oz: number;
  vx: number;
  vy: number;
  vz: number;
  /** 공기저항 계수. 클수록 빨리 느려진다. 0 이면 등속. */
  drag: number;
  /** 중력 가속도(m/s²). 하트는 양수를 줘서 계속 떠오르게 한다. */
  gravity: number;
  /** 초. */
  life: number;
  /** 지금부터 몇 초 뒤에 태어날지. 폭죽의 "터지는 순간"이 이걸로 만들어진다. */
  delay: number;
  /** 월드 단위 크기. */
  size: number;
  color: Color;
  /** 0 = 하트, 1 = 색종이, 2 = 불꽃 */
  shape: 0 | 1 | 2;
  seed: number;
  /**
   * 이 입자가 멈춰 설 바닥 높이(m).
   *
   * 중력을 제대로 넣자마자 색종이가 잔디를 뚫고 사라졌다 — 물리적으로는 맞지만
   * 화면에서는 그냥 없어지는 것으로 보인다. 실제 색종이는 바닥에 쌓였다가 치워진다.
   * 버스트가 일어난 자리의 지형 높이를 실어 보내면, 몇 미터 안에서는 그걸
   * 평평한 바닥으로 봐도 눈에 안 띈다.
   */
  floor: number;
}

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uCurvature;
  uniform float uViewportHeight;

  attribute vec3 aOrigin;
  attribute vec3 aVelocity;
  // x: 태어난 시각, y: 수명, z: 공기저항, w: 중력
  attribute vec4 aTiming;
  attribute vec3 aColor;
  // x: 크기, y: 모양, z: 씨앗, w: 바닥 높이
  attribute vec4 aStyle;

  varying vec3 vColor;
  varying float vShape;
  varying float vSeed;
  varying float vAge;
  varying float vFade;

  void main() {
    float age = uTime - aTiming.x;
    float life = aTiming.y;
    float t = age / life;

    vColor = aColor;
    vShape = aStyle.y;
    vSeed = aStyle.z;
    vAge = age;

    // 아직 안 태어났거나 이미 죽었으면 화면 밖으로 던지고 크기를 0 으로 만든다.
    // 죽은 입자를 버퍼에서 빼는 대신 이렇게 접는 게 훨씬 싸다.
    if (age < 0.0 || t > 1.0) {
      gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
      gl_PointSize = 0.0;
      vFade = 0.0;
      return;
    }

    /**
     * 선형 공기저항이 걸린 등가속 운동의 해석해.
     *
     *   v' = -k·v + g
     *   v(t) = (v₀ - g/k)·e^(-kt) + g/k
     *   x(t) = x₀ + (v₀ - g/k)·(1-e^(-kt))/k + (g/k)·t
     *
     * ⚠ 부호를 뒤집어 적었던 적이 있다. (v₀ + g/k)·decay - (g/k)·t 로 썼는데,
     *   저항이 0 에 가까울 때 이 식은 g 항이 통째로 상쇄되어 **중력이 사라진다.**
     *   실제로 색종이가 떨어지는 대신 떠올랐다. 자유낙하로 검산하면 바로 드러난다:
     *   v₀=0, g=-9.8, t=1 이면 -4.9m 여야 하는데 +4.9m 가 나왔다.
     *   reactionBursts.test.ts 가 이 극한을 검사한다.
     *
     * 오일러 적분을 매 프레임 돌리는 대신 닫힌 형태로 한 번에 푼다.
     * 프레임레이트와 무관하게 똑같은 궤적이 나온다는 게 진짜 이득이다 —
     * 60fps 와 30fps 에서 폭죽이 다른 높이까지 올라가면 안 된다.
     */
    float k = max(aTiming.z, 0.0001);
    vec3 terminal = vec3(0.0, aTiming.w / k, 0.0);
    float decay = (1.0 - exp(-k * age)) / k;
    vec3 pos = aOrigin + (aVelocity - terminal) * decay + terminal * age;

    // 바닥을 뚫지 않는다. 닿으면 그 자리에 남아 사라질 때까지 놓여 있다.
    pos.y = max(pos.y, aStyle.w);

    // 하트는 올라가면서 좌우로 흔들린다. 직선으로 떠오르면 풍선이지 마음이 아니다.
    if (aStyle.y < 0.5) {
      pos.x += sin(age * 2.1 + aStyle.z * 6.28) * 0.34 * min(age, 1.5);
      pos.z += cos(age * 1.7 + aStyle.z * 4.1) * 0.24 * min(age, 1.5);
    }

    // 세계와 같은 곡률을 먹인다. 이걸 빼면 멀리 있는 파티클만 공중에 뜬다.
    float d = distance(pos.xz, cameraPosition.xz);
    pos.y -= d * d * uCurvature;

    vec4 mv = viewMatrix * vec4(pos, 1.0);

    // 태어날 때 빠르게 나타나고, 마지막 35% 동안 사라진다.
    vFade = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.65, t);

    /**
     * 불꽃은 사그라들며 작아지고, 색종이·하트는 끝까지 제 크기를 지킨다.
     *
     * 0.35 까지 줄였더니 작은 입자를 많이 쓰는 순간 후반부가 통째로 사라졌다 —
     * 3px 짜리 점이 1px 이 되면 그건 그냥 없는 것이다. 입자를 잘게 쪼갠 뒤로는
     * 덜 줄여야 원이 끝까지 원으로 남는다.
     */
    float shrink = aStyle.y > 1.5 ? mix(1.0, 0.62, t) : 1.0;

    // 원근 보정. projectionMatrix[1][1] = 1/tan(fov/2) 라 이 식이 정확한 픽셀 크기다.
    gl_PointSize = aStyle.x * shrink * uViewportHeight
                 * projectionMatrix[1][1] * 0.5 / max(-mv.z, 0.001);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vShape;
  varying float vSeed;
  varying float vAge;
  varying float vFade;

  /**
   * 하트의 음함수: (x² + y² - 1)³ - x²y³ = 0
   * 안쪽이 음수라 부호만 보면 채울 수 있다. 텍스처를 굽지 않아도 되고
   * 어떤 거리에서 봐도 가장자리가 깨끗하다.
   */
  float heartField(vec2 p) {
    p *= 1.32;
    p.y -= 0.16;
    float a = dot(p, p) - 1.0;
    return a * a * a - p.x * p.x * p.y * p.y * p.y;
  }

  void main() {
    if (vFade <= 0.0) discard;

    vec2 p = gl_PointCoord * 2.0 - 1.0;
    p.y = -p.y;

    vec3 color = vColor;
    float alpha;

    if (vShape < 0.5) {
      // ── 하트 ──
      float f = heartField(p);
      alpha = smoothstep(0.05, -0.05, f);
      // 왼쪽 위에 하이라이트 한 점. 이게 있으면 납작한 도형이 아니라 사탕처럼 보인다.
      color = mix(color, vec3(1.0), smoothstep(0.42, 0.0, distance(p, vec2(-0.3, 0.34))) * 0.55);
    } else if (vShape < 1.5) {
      // ── 색종이 ──
      // 화면을 향한 사각형을 돌리고, 세로를 주기적으로 납작하게 눌러
      // 종잇조각이 공중에서 뒤집히는 것처럼 보이게 한다.
      float spin = vSeed * 6.28 + vAge * (2.6 + vSeed * 5.0);
      float c = cos(spin);
      float s = sin(spin);
      vec2 q = mat2(c, -s, s, c) * p;
      float flip = abs(cos(vAge * 4.4 + vSeed * 6.28));
      q.y /= max(flip, 0.14);
      alpha = step(abs(q.x), 0.55) * step(abs(q.y), 0.92);
      // 옆으로 누울수록 어두워진다 — 종이 뒷면이 그늘지는 셈.
      color *= mix(0.45, 1.0, flip);
    } else {
      /**
       * ── 불꽃 ──
       *
       * 처음엔 더하기 합성으로 그렸다. 밤하늘이면 그게 맞지만 이 섬은 대낮이라
       * 밝은 하늘 위에 색을 **더하면** 세 채널이 다 차서 전부 흰 점이 됐다.
       * 보통 합성으로 하늘을 덮어야 색이 색으로 보인다.
       * 대신 가운데를 희게 밝혀 "타는 불씨"라는 인상을 남긴다.
       */
      float d = length(p);
      float core = smoothstep(1.0, 0.0, d);
      alpha = pow(core, 1.6);
      /**
       * 흰 심지를 넣지 않는다.
       *
       * 밤하늘이면 가운데가 하얀 게 맞지만, 낮 하늘 위에서는 그 흰 점이 배경색과
       * 거의 같아져서 **가운데가 뚫린 고리**처럼 보였다. 배경이 밝을 땐
       * 색 하나로 꽉 찬 점이 오히려 더 밝게 읽힌다.
       */
    }

    if (alpha <= 0.002) discard;
    gl_FragColor = vec4(color, alpha * vFade);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * 고정 크기 링버퍼 한 벌.
 *
 * 가득 차면 가장 오래된 입자를 덮어쓴다. 스폰을 거절하는 것보다 이게 낫다 —
 * 여럿이 동시에 연타해도 "내 폭죽만 안 터지는" 일이 안 생기고,
 * 덮어쓰이는 건 어차피 거의 다 사라진 입자다.
 */
export class ReactionPool {
  readonly geometry: BufferGeometry;
  readonly material: ShaderMaterial;

  private readonly capacity: number;
  private cursor = 0;

  /**
   * 유니폼 객체를 직접 들고 있는다.
   * material.uniforms 는 인덱스 서명이라 매번 존재 여부를 단언해야 하는데,
   * 여기서 만든 걸 여기서 쓰는 마당에 그 단언은 소음이다.
   */
  private readonly uTime = { value: 0 };
  private readonly uViewportHeight = { value: 800 };

  private readonly origin: BufferAttribute;
  private readonly velocity: BufferAttribute;
  private readonly timing: BufferAttribute;
  private readonly color: BufferAttribute;
  private readonly style: BufferAttribute;

  constructor(capacity: number) {
    this.capacity = capacity;

    this.origin = new BufferAttribute(new Float32Array(capacity * 3), 3);
    this.velocity = new BufferAttribute(new Float32Array(capacity * 3), 3);
    this.timing = new BufferAttribute(new Float32Array(capacity * 4), 4);
    this.color = new BufferAttribute(new Float32Array(capacity * 3), 3);
    this.style = new BufferAttribute(new Float32Array(capacity * 4), 4);

    // 수명 0 = 태어나자마자 죽은 상태. 첫 프레임에 유령이 안 보이게 한다.
    this.geometry = new BufferGeometry();
    // position 이 없으면 three 가 드로우 범위를 못 정한다. 값은 안 쓰지만 있어야 한다.
    this.geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(capacity * 3), 3),
    );
    this.geometry.setAttribute("aOrigin", this.origin);
    this.geometry.setAttribute("aVelocity", this.velocity);
    this.geometry.setAttribute("aTiming", this.timing);
    this.geometry.setAttribute("aColor", this.color);
    this.geometry.setAttribute("aStyle", this.style);
    // 입자가 세계 곳곳에서 터지므로 절두체 컬링을 맡기면 통째로 사라진다.
    this.geometry.boundingSphere = null;

    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTime: this.uTime,
        uViewportHeight: this.uViewportHeight,
        // 세계와 같은 객체를 공유한다. 튜닝 패널에서 곡률을 바꾸면 파티클도 같이 휜다.
        uCurvature: curvatureUniforms.uCurvature,
      },
      transparent: true,
      // 깊이는 읽되 쓰지 않는다. 지형에는 가려지고 자기들끼리는 안 가린다.
      depthWrite: false,
      blending: NormalBlending,
    });
  }

  /** 지금 시각(초)을 기준으로 입자들을 풀에 써넣는다. */
  emit(specs: readonly ParticleSpec[], now: number): void {
    for (const spec of specs) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;

      this.origin.setXYZ(i, spec.ox, spec.oy, spec.oz);
      this.velocity.setXYZ(i, spec.vx, spec.vy, spec.vz);
      this.timing.setXYZW(
        i,
        now + spec.delay,
        spec.life,
        spec.drag,
        spec.gravity,
      );
      this.color.setXYZ(i, spec.color.r, spec.color.g, spec.color.b);
      this.style.setXYZW(i, spec.size, spec.shape, spec.seed, spec.floor);
    }

    this.origin.needsUpdate = true;
    this.velocity.needsUpdate = true;
    this.timing.needsUpdate = true;
    this.color.needsUpdate = true;
    this.style.needsUpdate = true;
  }

  setTime(seconds: number): void {
    this.uTime.value = seconds;
  }

  setViewportHeight(pixels: number): void {
    this.uViewportHeight.value = pixels;
  }

  /** 스폰 시각의 기준. 셰이더와 같은 시계를 써야 delay 가 맞는다. */
  get now(): number {
    return this.uTime.value;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
