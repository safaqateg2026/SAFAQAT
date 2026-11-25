import test from "node:test";
import assert from "node:assert/strict";
import { submitRegistration } from "../../shared/registrationClient.mjs";

const input = {
  role: "consumer",
  fullName: "Synthetic Test",
  phone: "+201000000001"
};

test("registration is disabled by default", async () => {
  let calls = 0;

  const result = await submitRegistration(input, {
    fetcher: async () => {
      calls++;
      throw new Error("Unexpected request");
    }
  });

  assert.equal(calls, 0);
  assert.equal(result.saved, false);
  assert.equal(result.activated, false);
  assert.equal(result.error, "registration_disabled");
});

test("registration uses the same-origin completion endpoint", async () => {
  const result = await submitRegistration(input, {
    enabled: true,
    fetcher: async (url, options) => {
      assert.equal(url, "/api/registration/complete");
      assert.equal(options.method, "POST");
      assert.equal(options.credentials, "same-origin");
      assert.equal(options.cache, "no-store");
      assert.equal(options.redirect, "error");
      assert.deepEqual(JSON.parse(options.body), input);

      return Response.json(
        { saved: true, activated: false },
        { status: 201 }
      );
    }
  });

  assert.deepEqual(result, {
    saved: true,
    activated: false
  });
});

for (const status of [400, 401, 409, 422, 429, 503]) {
  test(`registration safely handles HTTP ${status}`, async () => {
    const result = await submitRegistration(input, {
      enabled: true,
      fetcher: async () => Response.json(
        { error: "Synthetic error" },
        { status }
      )
    });

    assert.equal(result.saved, false);
    assert.equal(result.activated, false);
    assert.equal(typeof result.error, "string");
  });
}

test("unexpected success responses cannot activate an account", async () => {
  const result = await submitRegistration(input, {
    enabled: true,
    fetcher: async () => Response.json(
      { saved: true, activated: true },
      { status: 201 }
    )
  });

  assert.equal(result.saved, false);
  assert.equal(result.activated, false);
});

test("HTTP 200 alone cannot indicate successful registration", async () => {
  const result = await submitRegistration(input, {
    enabled: true,
    fetcher: async () => Response.json(
      { saved: true, activated: false },
      { status: 200 }
    )
  });

  assert.equal(result.saved, false);
});

test("network failure cannot indicate successful registration", async () => {
  const result = await submitRegistration(input, {
    enabled: true,
    fetcher: async () => {
      throw new Error("Synthetic network failure");
    }
  });

  assert.equal(result.saved, false);
  assert.equal(result.activated, false);
});
