"use client";

import { useEffect, useRef } from "react";

type InstallChoice = { outcome: "accepted" | "dismissed" };
type InstallPrompt = Event & {
  prompt: () => Promise<InstallChoice | void>;
  userChoice: Promise<InstallChoice>;
};

export type InstallNotice = { title: string; description: string };

const installedNotice: InstallNotice = {
  title: "صفقات مثبّت",
  description: "صفقات مثبّت بالفعل. يمكنك فتحه من أيقونة التطبيق على جهازك.",
};

function hasStandaloneMode() {
  const appleNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || appleNavigator.standalone === true;
}

function installInstructions(): InstallNotice {
  const { userAgent, platform, maxTouchPoints } = navigator;
  const isMac = /Mac/i.test(platform || userAgent);
  const isIOS = /iPad|iPhone|iPod/i.test(userAgent) || (isMac && maxTouchPoints > 1);
  const isMacSafari = isMac && /Version\/[\d.]+.*Safari\//i.test(userAgent);
  let description = "ابحث في شريط العنوان أو قائمة المتصفح عن «تثبيت صفقات» أو «تثبيت هذا الموقع كتطبيق». إذا لم يظهر الخيار، جرّب متصفح Chrome أو Edge محدّثًا.";

  if (!window.isSecureContext) {
    description = "افتح الرابط الآمن للموقع عبر HTTPS في متصفح جهازك لاستخدام خيارات التثبيت.";
  } else if (isIOS) {
    description = "افتح الصفحة في Safari، ثم اضغط «مشاركة» واختر «إضافة إلى الشاشة الرئيسية». فعّل «فتح كتطبيق ويب» إذا ظهر، ثم اضغط «إضافة».";
  } else if (/Android/i.test(userAgent)) {
    description = "افتح الصفحة في Chrome، ثم افتح قائمة ⋮ واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية». إذا لم يظهر الخيار، يمكنك متابعة استخدام صفقات في المتصفح.";
  } else if (isMacSafari) {
    description = "في Safari على Mac، اختر «إضافة إلى Dock» من قائمة «ملف» أو زر «مشاركة»، ثم اضغط «إضافة». إذا لم يظهر الخيار، جرّب متصفح Chrome محدّثًا.";
  }

  return { title: "تثبيت صفقات", description };
}

export function usePwaInstall() {
  const pendingPrompt = useRef<InstallPrompt | null>(null);
  const prompting = useRef(false);
  const installedInSession = useRef(false);

  useEffect(() => {
    function capturePrompt(event: Event) {
      const prompt = event as InstallPrompt;
      if (typeof prompt.prompt !== "function") return;
      event.preventDefault();
      if (!installedInSession.current) pendingPrompt.current = prompt;
    }

    function markInstalled() {
      installedInSession.current = true;
      pendingPrompt.current = null;
    }

    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);

    if (process.env.NODE_ENV === "production" && window.isSecureContext && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(error => {
        console.error("Unable to register the SAFAQAT service worker", error);
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  async function requestInstall(): Promise<InstallNotice | null> {
    if (prompting.current) return null;
    if (installedInSession.current || hasStandaloneMode()) return installedNotice;

    const prompt = pendingPrompt.current;
    if (!prompt) return installInstructions();

    pendingPrompt.current = null;
    prompting.current = true;
    try {
      const choice = (await prompt.prompt()) ?? (await prompt.userChoice);
      if (installedInSession.current) return installedNotice;
      if (choice.outcome === "dismissed") {
        return {
          title: "لم يتم التثبيت",
          description: "أغلقت نافذة التثبيت. يمكنك المحاولة لاحقًا أو استخدام خيار التثبيت في قائمة المتصفح إذا كان متاحًا.",
        };
      }
      return null;
    } catch {
      return installedInSession.current ? installedNotice : installInstructions();
    } finally {
      prompting.current = false;
    }
  }

  return requestInstall;
}
