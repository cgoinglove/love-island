import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 곡률을 안 타는 머티리얼이 씬에 들어오는 걸 막는다.
 *
 * ── 왜 테스트까지 만드는가 ──
 * 이 버그는 **세 번** 났고, 세 번 다 사용자 눈에 "오브젝트가 공중에 떠 있다"로 보였다.
 *
 * 지형은 카메라에서 멀어질수록 d²·k 만큼 내려간다(동물의숲 룩의 핵심). 그런데
 * 그건 셰이더가 하는 일이라, 평범한 meshStandardMaterial 을 쓴 오브젝트는 안 내려간다.
 * 기본 카메라 거리 24m 에서 낙차가 0.75m — 캐릭터 반 키만큼 뜬다.
 *
 * 문제는 이게 **코드를 봐서는 안 보인다**는 점이다. `<meshStandardMaterial color="red" />`
 * 는 어느 모로 보나 정상이고, 리뷰에서 걸리지 않는다. 규칙을 README 에 적어뒀지만
 * 그걸 쓴 사람이 그대로 어겼다. 사람의 주의력에 맡길 수 없는 종류의 규칙이라
 * 기계가 지키게 한다.
 */

const ROOTS = ["game", "features"];

/** three 의 기본 머티리얼들. 이걸 그대로 쓰면 곡률을 안 탄다. */
const FORBIDDEN = [
  "meshStandardMaterial",
  "meshBasicMaterial",
  "meshPhysicalMaterial",
  "meshLambertMaterial",
  "meshPhongMaterial",
  "meshToonMaterial",
];

/**
 * 예외. 여기 추가할 땐 **왜 안 휘어도 되는지** 반드시 적는다.
 * 대개는 예외가 필요 없다 — CurvedMaterial / CurvedBasicMaterial 중 하나면 된다.
 */
const ALLOWED = new Map<string, string>([
  [
    "game/world/curvature.tsx",
    "곡률 머티리얼 자체를 정의하는 곳. baseMaterial 로 이름이 등장한다.",
  ],
  [
    "game/world/Celestial.tsx",
    "해·달·별똥별은 560m 밖의 배경이다. 지형이 아니라 하늘이라 휘면 안 된다 — " +
      "곡률을 태우면 별똥별 꼬리가 지평선 쪽으로 꺾인다.",
  ],
]);

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, found);
    } else if (name.endsWith(".tsx") && !name.endsWith(".test.tsx")) {
      found.push(path);
    }
  }
  return found;
}

describe("모든 입체는 곡률을 탄다", () => {
  it("game/ 과 features/ 에 기본 머티리얼을 직접 쓴 곳이 없다", () => {
    const offenders: string[] = [];

    for (const root of ROOTS) {
      for (const path of sourceFiles(root)) {
        if (ALLOWED.has(path)) continue;
        const source = readFileSync(path, "utf8");
        for (const material of FORBIDDEN) {
          // JSX 로 쓴 것만 잡는다. 주석에서 이름을 언급하는 건 괜찮다.
          if (source.includes(`<${material}`)) {
            offenders.push(`${path} → <${material}`);
          }
        }
      }
    }

    expect(
      offenders,
      [
        "",
        "곡률을 안 타는 머티리얼을 찾았습니다.",
        "지형은 카메라에서 멀어질수록 내려가는데 이것들은 제자리에 남아 공중에 뜹니다.",
        "",
        "  빛을 받는 것  → @/game/world/curvature 의 CurvedMaterial",
        "  빛을 안 받는 것 → 같은 곳의 CurvedBasicMaterial",
        "",
        "정말 예외라면 이 파일의 ALLOWED 에 이유와 함께 등록하세요.",
        "",
      ].join("\n"),
    ).toEqual([]);
  });

  it("감시 대상 파일을 실제로 읽고 있다", () => {
    // 경로를 잘못 적어 0개를 훑으면서 통과하는 게 이 테스트의 유일한 실패 방식이다.
    const files = ROOTS.flatMap((root) => sourceFiles(root));
    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain(join("game", "player", "CharacterModel.tsx"));
  });
});

describe("지오메트리 병합", () => {
  it("인덱스 유무가 섞여 있어도 합쳐진다", async () => {
    /**
     * three 의 기본 도형은 제각각이다 — Sphere 는 인덱스가 있고 Icosahedron 은 없다.
     * 섞어 넘기면 mergeGeometries 가 실패하는데, 콘솔에만 조용히 찍히고
     * 그 오브젝트가 통째로 안 그려진다. 로봇 머리에 다면체를 넣었다가 그렇게 됐다.
     */
    const { IcosahedronGeometry, SphereGeometry, BoxGeometry } = await import(
      "three"
    );
    const { mergeColored } = await import("./meshKit");

    const merged = mergeColored([
      { geometry: new SphereGeometry(1, 8, 6), color: "#ff0000" },
      { geometry: new IcosahedronGeometry(1, 0), color: "#00ff00" },
      { geometry: new BoxGeometry(1, 1, 1), color: "#0000ff" },
    ]);

    expect(merged.attributes.position?.count).toBeGreaterThan(0);
    expect(merged.attributes.color?.count).toBe(
      merged.attributes.position?.count,
    );
  });
});
