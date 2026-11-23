"use client";

import { useEffect, useRef, useState } from "react";
import { usePwaInstall, type InstallNotice } from "./usePwaInstall";
import "./SafaqatLanding.css";

const iconPaths = {
  phone: "M15 3h18a5 5 0 0 1 5 5v32a5 5 0 0 1-5 5H15a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5zM20 8h8M20 40h8M24 16v16m-6-6 6 6 6-6",
  download: "M24 4v27m-10-10 10 10 10-10M7 34v8h34v-8",
};

const roleArtwork = {
  shop: (
    <>
      <path fill="#f0bb71" d="M13 23h54v22H13z" />
      <path fill="#47bfe6" stroke="#432440" strokeWidth="2" d="M18 28h26v12H18z" />
      <path stroke="#ddf9ff" strokeWidth="2" d="m20 38 9-9m1 9 9-9" />
      <path fill="#713319" d="M51 27h11v18H51z" />
      <path fill="#ff611c" d="M15 7h50l9 15a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" />
      <path fill="#fff2cd" d="M24 9h8l-3 16H17zm12 0h8l2 16H34zm12 0h8l7 16H51z" />
      <path stroke="#ffec9d" strokeWidth="2" strokeLinecap="round" d="M16 8h48M12 45h56" />
    </>
  ),
  factory: (
    <>
      <path fill="#ffac24" d="M49 7h9v23h-9zM62 4h9v26h-9z" />
      <path stroke="#ffed96" strokeWidth="2" d="M49 11h9m4-3h9m-22 9h9m4-3h9" />
      <path fill="#e8dbe5" d="M7 21 25 9v12L42 9v18h33v18H7z" />
      <path fill="#ffa82d" d="M49 28h26v17H49z" />
      <path fill="#3b76a6" d="M12 25h12v8H12zm17 0h12v8H29zm25 6h7v6h-7zm11 0h6v6h-6z" />
      <path fill="#754c62" d="M15 37h18v8H15zm23 0h7v8h-7z" />
      <path stroke="#fff0cb" strokeWidth="2" strokeLinecap="round" d="M7 45h68" />
    </>
  ),
  home: (
    <>
      <path fill="#fdd691" d="M11 24 30 9l19 15v20H11z" />
      <path fill="none" stroke="#ff6725" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" d="M7 25 30 6l23 19" />
      <path fill="#6a301d" d="M25 29h11v15H25z" />
      <path fill="#55c8ee" stroke="#8f3923" strokeWidth="1.5" d="M15 28h7v8h-7zm24 0h7v8h-7z" />
      <path fill="#ff3e58" stroke="#ffcfbe" strokeWidth="2" d="M74 20c0 8-10 20-10 20S54 28 54 20a10 10 0 1 1 20 0z" />
      <circle fill="#fff6e8" cx="64" cy="20" r="4" />
      <path stroke="#86d34d" strokeWidth="3" strokeLinecap="round" d="M7 44h45" />
    </>
  ),
  delivery: (
    <>
      <path stroke="#f675ff" strokeWidth="2" strokeLinecap="round" d="M3 21h12M1 29h10M5 36h8" />
      <circle fill="#33213e" stroke="#e1d3e8" strokeWidth="2" cx="25" cy="39" r="6" />
      <circle fill="#33213e" stroke="#e1d3e8" strokeWidth="2" cx="64" cy="39" r="6" />
      <path fill="#ffc32b" d="M18 39c0-8 9-12 17-7h13l8-15h6l-5 13c11-3 15 2 15 9H56l-3-5-6 5z" />
      <path fill="#ffab2b" stroke="#ffe29a" strokeWidth="1.5" d="M19 18h17v13H19z" />
      <path fill="#292b62" d="m43 22 8 8-3 8h-6l3-8-9-5z" />
      <path fill="#ff8b32" stroke="#fff0ad" strokeWidth="1.5" strokeLinejoin="round" d="m39 13 6 1 6 7 7 1-1 3-9-1-5-4-4 8-6-2z" />
      <circle fill="#fdd6a3" cx="43" cy="9" r="5" />
      <path fill="#ffcd23" d="M37 9a6 6 0 0 1 12 0h3v2H37z" />
    </>
  ),
};

const roles = [
  { id: "merchant", title: "أنا تاجر", description: "محلات / تجار", icon: "shop" },
  { id: "supplier", title: "أنا مورد", description: "مصانع / شركات / موزع", icon: "factory" },
  { id: "courier", title: "مندوب توصيل", description: "طيار / سيارة", icon: "delivery" },
  { id: "consumer", title: "اتسوّق من بيتك", description: "أفراد / المستهلك", icon: "home" },
] as const;

function Icon({ name, className }: { name: keyof typeof iconPaths; className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}

const shareData = {
  title: "صفقات - SAFAQAT",
  text: "سوقك الذكي لكل طلباتك",
  url: "https://safaqat-59e.pages.dev/",
};

function copyWithSelection(text: string) {
  const focused = document.activeElement;
  const field = document.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.style.cssText = "position:fixed;top:0;left:0;opacity:0";
  document.body.append(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
    if (focused instanceof HTMLElement) focused.focus({ preventScroll: true });
  }
}

export default function SafaqatLanding() {
  const [dialog, setDialog] = useState<(InstallNotice & { shareUrl?: string }) | null>(null);
  const [shareFeedback, setShareFeedback] = useState("");
  const sharing = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const requestInstall = usePwaInstall();

  useEffect(() => {
    if (dialog && !dialogRef.current?.open) {
      dialogRef.current?.showModal();
    }
  }, [dialog]);

  async function install() {
    const notice = await requestInstall();
    if (notice) setDialog(notice);
  }

  async function shareApp() {
    if (sharing.current) return;
    sharing.current = true;
    setShareFeedback("");
    try {
      if (typeof navigator.share === "function") {
        try {
          await navigator.share(shareData);
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
        }
      }

      let copied = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(shareData.url);
          copied = true;
        }
      } catch {
        // Some preview origins or browsers only support copying a selection.
      }
      if (copied || copyWithSelection(shareData.url)) {
        setShareFeedback("تم نسخ رابط صفقات.");
      } else {
        setDialog({
          title: "مشاركة صفقات",
          description: "تعذّر نسخ الرابط تلقائيًا. انسخه من الحقل أدناه.",
          shareUrl: shareData.url,
        });
      }
    } finally {
      sharing.current = false;
    }
  }

  return (
    <main className="safaqat-landing" lang="ar" dir="rtl">
      <button type="button" className="safaqat-share" aria-label="مشاركة تطبيق صفقات" onClick={shareApp}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m8.7 10.6 6.6-3.7m-6.6 6.5 6.6 3.7" />
          <circle cx="6.5" cy="12" r="2.5" />
          <circle cx="17.5" cy="5.5" r="2.5" />
          <circle cx="17.5" cy="18.5" r="2.5" />
        </svg>
      </button>
      <p role="status" className="safaqat-share-status">{shareFeedback}</p>
      <div className="safaqat-content">
        <header className="safaqat-brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- Serve the original artwork on static hosting. */}
          <img src="/images/brand-original.png" width={1198} height={1193} alt="صفقات SAFAQAT — كل الجملة في مكان واحد" />
        </header>
        <div className="safaqat-cart">
          {/* eslint-disable-next-line @next/next/no-img-element -- Serve the original artwork on static hosting. */}
          <img src="/images/cart-original.png" width={1179} height={1018} alt="عربة التسوق الذهبية على منصة بنفسجية مضيئة" />
        </div>
        <div className="safaqat-actions">
          <section aria-labelledby="safaqat-role-heading">
            <h2 id="safaqat-role-heading" className="safaqat-role-heading">معاينة الأدوار</h2>
            <div className="safaqat-roles">
              {roles.map(role => (
                <button
                  key={role.id}
                  type="button"
                  className="safaqat-role"
                  data-role={role.id}
                  aria-haspopup="dialog"
                  onClick={() => setDialog({
                    title: role.title,
                    description: "هذه معاينة للدور. التسجيل قيد الإعداد.",
                  })}
                >
                  <svg className="safaqat-role-icon" viewBox="0 0 80 48" aria-hidden="true">
                    {roleArtwork[role.icon]}
                  </svg>
                  <strong>{role.title}</strong>
                  <small>{role.description}</small>
                </button>
              ))}
            </div>
          </section>
          <button type="button" className="safaqat-download" onClick={install}>
            <Icon name="download" className="safaqat-download-arrow" />
            <span className="safaqat-download-text">
              <strong>تحميل التطبيق</strong>
              <small>ثبّت صفقات على جهازك</small>
            </span>
            <Icon name="phone" className="safaqat-download-phone" />
          </button>
        </div>
      </div>
      <dialog
        ref={dialogRef}
        className="safaqat-dialog"
        aria-labelledby="safaqat-dialog-title"
        aria-describedby="safaqat-dialog-description"
        onClose={() => setDialog(null)}
        onClick={event => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="safaqat-dialog-content">
          <button type="button" className="safaqat-close" aria-label="إغلاق" onClick={() => dialogRef.current?.close()}>
            ×
          </button>
          <h2 id="safaqat-dialog-title">{dialog?.title}</h2>
          <p id="safaqat-dialog-description">{dialog?.description}</p>
          {dialog?.shareUrl && (
            <input className="safaqat-share-link" aria-label="رابط صفقات" dir="ltr" readOnly value={dialog.shareUrl} onFocus={event => event.currentTarget.select()} />
          )}
        </div>
      </dialog>
    </main>
  );
}
