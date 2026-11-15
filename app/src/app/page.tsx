"use client";

import { useEffect, useState } from "react";

type Selection = "buyer" | "supplier" | "attendance" | null;

export default function Home() {
  const [showSplash, setShowSplash] = useState(true);
  const [selection, setSelection] = useState<Selection>(null);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 2000);
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onInstall);
    };
  }, []);

  async function install() {
    if (installPrompt && "prompt" in installPrompt) {
      const promptEvent = installPrompt as Event & { prompt: () => Promise<void> };
      await promptEvent.prompt();
      setInstallPrompt(null);
    } else {
      setSelection(null);
      window.alert("للتثبيت: افتح رابط HTTPS من Chrome ثم اختر تثبيت التطبيق من القائمة. على iPhone استخدم Safari ثم مشاركة > إضافة إلى الشاشة الرئيسية. التثبيت غير متاح من رابط الشبكة المحلي الحالي.");
    }
  }

  return (
    <main className="safaqat-app" lang="ar" dir="rtl">
      {showSplash ? (
        <div className="splash" aria-label="جاري فتح صفقات">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo.jpg" alt="شعار صفقات" className="splash-logo" />
        </div>
      ) : (
        <div className="welcome" aria-label="الواجهة الترحيبية لصفقات">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/welcome.jpg" alt="صفقات: كل الجملة في مكان واحد، اختر مشتري أو مورد" className="welcome-art" />
          <button className="hotspot start" aria-label="ابدأ الآن" onClick={() => setSelection("buyer")} />
          <button className="hotspot buyer" aria-label="مشتري - صاحب محل أو تاجر" onClick={() => setSelection("buyer")} />
          <button className="hotspot supplier" aria-label="مورد - جملة أو مصنع أو موزع" onClick={() => setSelection("supplier")} />
          <button className="hotspot attendance" aria-label="تفاصيل منظومة البصمة" onClick={() => setSelection("attendance")} />
          <button className="hotspot install" aria-label="تحميل تطبيق صفقات" onClick={install} />
          {selection && (
            <div className="modal-backdrop" onClick={() => setSelection(null)}>
              <section className="modal" role="dialog" aria-modal="true" aria-label="الاختيار" onClick={(event) => event.stopPropagation()}>
                <button className="close" onClick={() => setSelection(null)} aria-label="إغلاق">×</button>
                <h2>{selection === "buyer" ? "حساب مشتري" : selection === "supplier" ? "حساب مورد" : "منظومة البصمة"}</h2>
                <p>{selection === "buyer" ? "واجهة المشتري قيد البناء. لا توجد طلبات حقيقية في هذه النسخة." : selection === "supplier" ? "واجهة المورد قيد البناء. التسجيل والتحقق والبيع غير مفعّلين بعد." : "هذا القسم إعلان تعريفي فقط، والتفاصيل قيد التجهيز."}</p>
                <button className="modal-action" onClick={() => setSelection(null)}>العودة للواجهة</button>
              </section>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
