export type PhoneVerificationStart = {
  whatsappUrl: string;
  expiresAt: number;
  verified: false;
};

async function request(
  action: "start" | "status" | "cancel",
  phone: string,
  signal?: AbortSignal
): Promise<unknown> {
  if (!/^\+201[0-9]{9}$/.test(phone)) {
    throw new Error("invalid_phone");
  }

  const response = await fetch(`/api/registration/${action}`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ phone }),
    signal
  });

  if (!response.ok) {
    throw new Error(
      response.status === 401 ? "verification_expired" :
      response.status === 429 ? "rate_limited" :
      "verification_unavailable"
    );
  }

  return response.json();
}

export async function startPhoneVerification(
  phone: string,
  signal?: AbortSignal
): Promise<PhoneVerificationStart> {
  const result = await request("start", phone, signal);

  if (!result || typeof result !== "object") {
    throw new Error("invalid_response");
  }

  const data = result as Partial<PhoneVerificationStart>;

  if (
    typeof data.whatsappUrl !== "string" ||
    typeof data.expiresAt !== "number" ||
    !Number.isSafeInteger(data.expiresAt) ||
    data.verified !== false
  ) {
    throw new Error("invalid_response");
  }

  const url = new URL(data.whatsappUrl);

  if (
    url.origin !== "https://wa.me" ||
    url.username ||
    url.password ||
    !/^\/201[0-9]{9}$/.test(url.pathname) ||
    !url.searchParams.get("text")
  ) {
    throw new Error("invalid_whatsapp_url");
  }

  return {
    whatsappUrl: url.href,
    expiresAt: data.expiresAt,
    verified: false
  };
}

export async function readPhoneVerification(
  phone: string,
  signal?: AbortSignal
): Promise<boolean> {
  const result = await request("status", phone, signal);

  return !!result &&
    typeof result === "object" &&
    "verified" in result &&
    result.verified === true;
}

export async function cancelPhoneVerification(
  phone: string
): Promise<void> {
  await request("cancel", phone);
}
