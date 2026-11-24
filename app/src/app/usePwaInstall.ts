"use client";

import { useEffect, useRef } from "react";
import { landingMessages, type Language } from "./landingMessages";

type InstallChoice = { outcome: "accepted" | "dismissed" };
type InstallPrompt = Event & {
  prompt: () => Promise<InstallChoice | void>;
  userChoice: Promise<InstallChoice>;
};

export type InstallNotice = { title: string; description: string };

function hasStandaloneMode() {
  const appleNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || appleNavigator.standalone === true;
}

function installInstructions(messages: typeof landingMessages[Language]): InstallNotice {
  const { userAgent, platform, maxTouchPoints } = navigator;
  const isMac = /Mac/i.test(platform || userAgent);
  const isIOS = /iPad|iPhone|iPod/i.test(userAgent) || (isMac && maxTouchPoints > 1);
  const isMacSafari = isMac && /Version\/[\d.]+.*Safari\//i.test(userAgent);
  let description: string = messages.installDefault;
  if (!window.isSecureContext) description = messages.installSecure;
  else if (isIOS) description = messages.installIOS;
  else if (/Android/i.test(userAgent)) description = messages.installAndroid;
  else if (isMacSafari) description = messages.installMac;

  return { title: messages.installTitle, description };
}

export function usePwaInstall(language: Language) {
  const messages = landingMessages[language];
  const installedNotice = { title: messages.installed[0], description: messages.installed[1] };
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
    if (!prompt) return installInstructions(messages);

    pendingPrompt.current = null;
    prompting.current = true;
    try {
      const choice = (await prompt.prompt()) ?? (await prompt.userChoice);
      if (installedInSession.current) return installedNotice;
      if (choice.outcome === "dismissed") {
        return {
          title: messages.dismissed[0],
          description: messages.dismissed[1],
        };
      }
      return null;
    } catch {
      return installedInSession.current ? installedNotice : installInstructions(messages);
    } finally {
      prompting.current = false;
    }
  }

  return requestInstall;
}
