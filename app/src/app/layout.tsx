import type { Metadata, Viewport } from "next";
import Image from "next/image";
import "./globals.css";
import styles from "./startup.module.css";

export const metadata: Metadata = {
  title: "صفقات | SAFAQAT",
  description: "صفقات - كل طلباتك في مكان واحد. نسخة تجريبية.",
  applicationName: "صفقات",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "صفقات", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/safaqat-luminous-v5-any-192.png", apple: "/icons/safaqat-luminous-v5-any-192.png" },
};
export const viewport: Viewport = { themeColor: "#31004f", width: "device-width", initialScale: 1, viewportFit: "cover" };
// A fresh document owns the splash. History restores and in-app document links skip it.
const startupEntryScript = `(() => {
  const [entry] = performance.getEntriesByType("navigation");
  const internal = entry?.type === "navigate" && document.referrer &&
    new URL(document.referrer).origin === location.origin;
  if (location.pathname !== "/" || entry?.type === "back_forward" || internal) {
    document.documentElement.setAttribute("data-safaqat-skip-startup", "");
  }
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: startupEntryScript }} />
      </head>
      <body>
        <div className={styles.startup}>
          <div className={styles.splash} aria-hidden="true">
            <div className={styles.mark} lang="ar" dir="rtl">
              <Image
                src="/images/safaqat-luminous-v4.webp"
                alt=""
                width={690}
                height={720}
                unoptimized
                preload
                decoding="sync"
              />
              <p className={styles.tagline}>سوقك الذكي لكل طلباتك</p>
            </div>
          </div>
          <div className={styles.landing}>
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
