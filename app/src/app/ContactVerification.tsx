"use client";
import { useEffect, useRef, useState } from "react";
import {
  startPhoneVerification,
  readPhoneVerification,
  cancelPhoneVerification
} from "./phoneVerificationClient";
import type { Language } from "./landingMessages";
import { registrationMessages } from "./registrationMessages";
import ContextHelp from "./ContextHelp";

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" className="google-mark"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.25 5.48-4.72 7.18l7.66 5.94c4.47-4.13 7.1-10.2 7.1-17.59z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.2A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.86l-7.66-5.94c-2.13 1.43-4.85 2.27-8.24 2.27-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>;
}

export function PhoneVerification({ language }: { language: Language }) {
  const copy = registrationMessages[language];
  const ar = language === "ar";

  const enabled =
    process.env.NEXT_PUBLIC_PHONE_VERIFICATION_ENABLED === "true";

  const [phone, setPhone] = useState("");
  const [phase, setPhase] = useState<
    "idle" | "starting" | "waiting" | "verified" | "error"
  >("idle");
  const [link, setLink] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const operation = useRef<AbortController | null>(null);

  const fullPhone = `+20${phone}`;
  const validPhone = /^1[0-9]{9}$/.test(phone);

  useEffect(() => {
    return () => operation.current?.abort();
  }, []);

  useEffect(() => {
    if (phase !== "waiting") return;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;

    async function check() {
      if (controller.signal.aborted) return;

      if (Date.now() >= expiresAt * 1000) {
        setPhase("error");
        setLink("");
        return;
      }

      try {
        const verified = await readPhoneVerification(
          fullPhone,
          controller.signal
        );

        if (controller.signal.aborted) return;

        if (verified) {
          setPhase("verified");
          setLink("");
          return;
        }
      } catch (error) {
        if (controller.signal.aborted) return;

        if (error instanceof Error &&
            error.message === "verification_expired") {
          setPhase("error");
          setLink("");
          return;
        }
      }

      if (!controller.signal.aborted) {
        timer = setTimeout(check, 5000);
      }
    }

    timer = setTimeout(check, 5000);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [phase, fullPhone, expiresAt]);

  async function begin() {
    if (!enabled || !validPhone ||
        phase === "starting" || phase === "waiting" ||
        phase === "verified") return;

    operation.current?.abort();

    const controller = new AbortController();
    operation.current = controller;

    setPhase("starting");
    setLink("");

    try {
      const result = await startPhoneVerification(
        fullPhone,
        controller.signal
      );

      if (controller.signal.aborted) return;

      setExpiresAt(result.expiresAt);
      setLink(result.whatsappUrl);
      setPhase("waiting");
    } catch {
      if (!controller.signal.aborted) setPhase("error");
    }
  }

  async function cancel() {
    operation.current?.abort();
    setPhase("starting");
    setLink("");

    try {
      await cancelPhoneVerification(fullPhone);
      setPhase("idle");
    } catch {
      setPhase("error");
    }
  }

  const status = !enabled ? copy.phoneVerificationUnavailable :
    phase === "starting" ? (ar ? "جارٍ الاتصال بالخادم…" : "Connecting…") :
    phase === "waiting" ? (ar ? "أرسل الرسالة عبر واتساب وانتظر التأكيد." : "Send the WhatsApp message and wait for confirmation.") :
    phase === "verified" ? (ar ? "تم توثيق رقم الهاتف" : "Phone verified") :
    phase === "error" ? (ar ? "تعذر إكمال التحقق. حاول مرة أخرى." : "Verification could not complete. Try again.") :
    (ar ? "أدخل رقم الهاتف للتحقق عبر واتساب." : "Enter your phone number to verify through WhatsApp.");

  return <section className="registration-contact-section" aria-label={copy.phoneVerification}>
    <div className="registration-phone-row" dir="ltr">
      <span className="registration-country-code">+20</span>
      <input type="tel" value={phone} required pattern="1[0-9]{9}" maxLength={10}
        autoComplete="tel-national" aria-label={copy.phone}
        disabled={phase === "starting" || phase === "waiting" || phase === "verified"}
        onChange={event => {
          operation.current?.abort();
          setPhone(event.target.value
            .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
            .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776))
            .replace(/[^0-9]/g, "").slice(0, 10));
          setPhase("idle");
          setLink("");
        }} />
      <button type="button"
        disabled={!enabled || !validPhone || phase === "starting" || phase === "waiting" || phase === "verified"}
        onClick={() => void begin()}>
        {phase === "verified" ? <span style={{ color: "#22c55e" }}>✓</span> : copy.verifyPhone}
      </button>
      <ContextHelp label={copy.help} text={copy.phoneVerificationHelp} />
    </div>
    <input type="hidden" name="phone" value={phone ? fullPhone : ""} />
    <p className="registration-integration-status" role="status">{status}</p>
    {enabled && phase === "waiting" && link &&
      <a href={link} target="_blank" rel="noopener noreferrer">
        {ar ? "فتح واتساب وإرسال رسالة التحقق" : "Open WhatsApp and send verification message"}
      </a>}
    {enabled && (phase === "waiting" || phase === "verified") &&
      <button type="button" onClick={() => void cancel()}>
        {ar ? "تغيير رقم الهاتف" : "Change phone number"}
      </button>}
  </section>;
}

export function GmailVerification({ language, optional = false }: { language: Language; optional?: boolean }) {
  const copy = registrationMessages[language];
  return <section className="registration-contact-section" aria-label={copy.gmailVerification}>
    <div className="registration-gmail-row">
      <button type="button" className="registration-google-button" disabled aria-describedby="gmail-unavailable"><GoogleMark /><span className="plate-visually-hidden">Google</span></button>
      <input name="email" type="email" autoComplete="email" maxLength={254} data-email-optional={optional} dir="ltr" placeholder={copy.email}
        aria-label={optional ? copy.optionalEmail : copy.email} />
      <button type="button" disabled>{copy.verifyEmail}</button>
      <ContextHelp label={copy.help} text={copy.emailVerificationHelp} />
    </div>
    <p id="gmail-unavailable" className="registration-integration-status" role="note">{copy.emailVerificationUnavailable}</p>
  </section>;
}
