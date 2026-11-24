"use client";

import { useEffect } from "react";

const rootEntry = "safaqatRootBack";

export function useStandaloneRootBack(closeDialog: () => void) {
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    if (!/Android/i.test(navigator.userAgent) || !standalone.matches) return;
    if (window.location.pathname !== "/" || window.location.hash) return;

    const rootUrl = window.location.href;
    let previous = history.state?.[rootEntry];

    function arm(event: MouseEvent) {
      if (!event.isTrusted) return;
      document.removeEventListener("click", arm, true);

      // A fresh app root has no earlier page to protect. Keep router state intact.
      if (!standalone.matches || location.href !== rootUrl || history.length !== 1) return;
      const state = history.state;
      if (state?.[rootEntry]) return;

      try {
        history.replaceState({ ...state, [rootEntry]: "base" }, "");
        history.pushState({ ...state, [rootEntry]: "guard" }, "");
        previous = "guard";
      } catch {
        // The browser may disallow history writes. Back stays native in that case.
      }
    }

    function onPopState(event: PopStateEvent) {
      const next = event.state?.[rootEntry];
      const returnedToBase = previous === "guard" && next === "base";
      previous = next;
      if (!standalone.matches || location.href !== rootUrl || !returnedToBase) return;

      closeDialog();
      // Reuse the forward entry without pruning history or growing the stack.
      history.forward();
    }

    document.addEventListener("click", arm, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", arm, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [closeDialog]);
}
