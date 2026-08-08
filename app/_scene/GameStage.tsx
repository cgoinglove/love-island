"use client";

import dynamic from "next/dynamic";
import { OWNER_NAME, SITE_NAME } from "@/shared/constants";

/**
 * WebGL 은 서버에서 렌더할 수 없다. ssr: false 로 잘라내지 않으면
 * three 와 leva 가 서버 번들에 끌려 들어가고, document 를 만지는 순간 빌드가 깨진다.
 */
const IslandScene = dynamic(
  () => import("./IslandScene").then((m) => m.IslandScene),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 grid place-items-center bg-[#0b1016]">
        <div className="text-center font-mono">
          <p className="text-[12px] text-emerald-400">
            <span className="text-slate-600">$ </span>ssh {OWNER_NAME}@island
          </p>
          <p className="mt-2 text-[11px] text-slate-500">
            {SITE_NAME} 로 접속하는 중<span className="animate-pulse">_</span>
          </p>
        </div>
      </div>
    ),
  },
);

export function GameStage() {
  return <IslandScene />;
}
