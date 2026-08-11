import { resolveLocale } from "@/shared/i18n";
import { GameStage } from "./_scene/GameStage";

/**
 * 라우트는 최대한 얇게. 씬을 하나 마운트하는 것 말고는 아무것도 하지 않는다. (기획서 §3)
 *
 * 언어는 `?lang=en` 으로 받는다. `/en` 도 같은 씬을 다른 언어로 띄운다(app/en/page.tsx) —
 * 링크로 공유하기엔 경로가 낫고, 그 자리에서 바꿔보기엔 쿼리가 낫다.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const { lang } = await searchParams;
  return <GameStage locale={resolveLocale(lang)} />;
}
