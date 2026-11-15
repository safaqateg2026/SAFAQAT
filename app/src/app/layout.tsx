import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "صفقات | SAFAQAT",
  description: "صفقات - كل الجملة في مكان واحد. نسخة تجريبية.",
  applicationName: "صفقات",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "صفقات", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};
export const viewport: Viewport = { themeColor: "#31004f", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}
