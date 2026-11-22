"use client";

import { useEffect, useRef, useState } from "react";

type Panel = "buyer" | "supplier" | "attendance" | "install";
type InstallPrompt = Event & { prompt: () => Promise<void> };

const details = {
  buyer: ["حساب مشتري", "واجهة المشتري قيد التجهيز. الطلبات والدفع غير متاحين في هذا الإصدار."],
  supplier: ["حساب مورد", "واجهة المورد قيد التجهيز. التسجيل والتحقق والبيع غير متاحين في هذا الإصدار."],
  attendance: ["منظومة البصمة", "عرض تعريفي لميزة قيد التجهيز. لا تُجمع بيانات البصمة في هذا الإصدار."],
  install: ["تثبيت صفقات", "على Android: افتح صفقات في Chrome واختر تثبيت التطبيق من القائمة. على iPhone أو iPad: افتح صفقات في Safari، ثم مشاركة، ثم إضافة إلى الشاشة الرئيسية، ثم إضافة."],
};

export default function Home() {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(console.error);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (panel && !dialog.current?.open) dialog.current?.showModal();
  }, [panel]);

  async function install() {
    if (installPrompt) {
      try {
        await installPrompt.prompt();
        return;
      } catch {
        setPanel("install");
      } finally {
        setInstallPrompt(null);
      }
    } else {
      setPanel("install");
    }
  }

  return (
    <main className="safaqat-app">
      <div className="welcome">
        <h1 className="sr-only">صفقات — كل الجملة في مكان واحد</h1>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/approved-home-reference.png" width={1024} height={1536} alt="" className="welcome-art" fetchPriority="high" />
        <button className="hotspot start" onClick={() => setPanel("buyer")}><span className="sr-only">ابدأ الآن</span></button>
        <button className="hotspot buyer" onClick={() => setPanel("buyer")}><span className="sr-only">مشتري - صاحب محل أو تاجر</span></button>
        <button className="hotspot supplier" onClick={() => setPanel("supplier")}><span className="sr-only">مورد - جملة أو مصنع أو موزع</span></button>
        <button className="hotspot attendance" onClick={() => setPanel("attendance")}><span className="sr-only">اعرف تفاصيل منظومة البصمة</span></button>
        <button className="hotspot install" onClick={install}><span className="sr-only">تثبيت صفقات مجانًا</span></button>
        <dialog ref={dialog} className="modal" aria-labelledby="panel-title" onClose={() => setPanel(null)}>
          {panel && <>
            <h2 id="panel-title">{details[panel][0]}</h2>
            <p>{details[panel][1]}</p>
            <form method="dialog"><button className="modal-action">العودة للواجهة</button></form>
          </>}
        </dialog>
      </div>
    </main>
  );
}
