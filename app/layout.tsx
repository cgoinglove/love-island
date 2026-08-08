import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_KR, JetBrains_Mono } from "next/font/google";
import { SITE_DESCRIPTION, SITE_NAME } from "@/shared/constants";
import "./globals.css";

/**
 * 개발자 감성의 절반은 활자다.
 * 모노스페이스를 UI 의 뼈대(라벨·수치·키캡)에 쓰고, 읽는 글은 한글 산세리프로 받는다.
 * 한글까지 모노로 깔면 방명록이 읽히지 않는다 — 모노는 라벨용이지 본문용이 아니다.
 */
const mono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

const sans = IBM_Plex_Sans_KR({
  variable: "--font-plex",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    type: "website",
  },
};

export const viewport: Viewport = {
  // 게임 화면에서 더블탭 확대가 되면 조작이 망가진다.
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // 노치 영역까지 캔버스를 채우고, 안전 영역은 CSS 에서 따로 피한다.
  viewportFit: "cover",
  themeColor: "#0b1016",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${mono.variable} ${sans.variable} h-full antialiased`}
    >
      {/* 모바일에서 캔버스를 스와이프할 때 페이지가 튕기지 않게 한다. */}
      <body className="h-full overflow-hidden overscroll-none bg-[#0b1016] font-sans">
        {children}
      </body>
    </html>
  );
}
