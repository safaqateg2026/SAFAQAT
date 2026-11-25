export async function submitRegistration(
  input,
  {
    enabled = false,
    fetcher = globalThis.fetch,
    signal
  } = {}
) {
  if (enabled !== true) {
    return {
      saved: false,
      activated: false,
      error: "registration_disabled"
    };
  }

  try {
    const timeout = AbortSignal.timeout(15000);

    const response = await fetcher(
      "/api/registration/complete",
      {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(input),
        signal: signal
          ? AbortSignal.any([signal, timeout])
          : timeout
      }
    );

    if (response.status === 201) {
      const result = await response.json();

      if (
        result?.saved === true &&
        result?.activated === false
      ) {
        return {
          saved: true,
          activated: false
        };
      }
    }

    const errors = {
      400: "invalid_request",
      401: "verification_required",
      409: "registration_conflict",
      422: "validation_failed",
      429: "rate_limited",
      503: "registration_unavailable"
    };

    return {
      saved: false,
      activated: false,
      error: errors[response.status] ||
        "registration_unavailable"
    };
  } catch {
    return {
      saved: false,
      activated: false,
      error: "registration_unavailable"
    };
  }
}
