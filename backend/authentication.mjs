import { reserveAuthAttempt } from "./authRateLimit.mjs";
import { createVerificationChallenge, consumeVerifiedEvent, consumeVerifiedLogin, recoverVerifiedDevice } from "./verification.mjs";
import { requiredPolicies } from "./registration.mjs";

const encoder = new TextEncoder();

export function createAuthentication({ database, key, providers, policy, clock }) {
  function providerFor(channel) {
    if (channel !== "whatsapp" && channel !== "email") return null;
    return providers.get(channel) ?? null;
  }

  async function reserve(action, subject, now) {
    const context = encoder.encode(JSON.stringify(["auth-rate", action, subject]));
    const hash = new Uint8Array(await crypto.subtle.sign("HMAC", key, context));
    const subjectDigest = Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("");
    return reserveAuthAttempt(database, { ...policy.rateLimits[action], action, subjectDigest, now });
  }

  return {
    // Only the verified provider receives the raw challenge. The caller must
    // use trusted rate subjects, not caller-controlled IP headers or IDs.
    async requestChallenge({ purpose, channel, target, subscriberId, rateSubject }) {
      const provider = providerFor(channel);
      const now = clock();
      if (!provider || !(await reserve("challenge_issue", rateSubject, now))
        || !(await reserve("challenge_issue", [channel, target], now))) return false;
      const challenge = await createVerificationChallenge(database, key, {
        subscriberId, purpose, channel, target, now, expiresAt: now + policy.challengeSeconds,
      });
      if (!challenge) return false;
      await provider.deliver({ purpose, target, ...challenge });
      return true;
    },

    async acceptRecoveryEvents(payloads, { subscriberId, rateSubject, deviceLabel }) {
      const now = clock();
      if (!subscriberId || !Array.isArray(payloads) || payloads.length < 1 || payloads.length > 2
        || !(await reserve("account_recovery", rateSubject, now))
        || !(await reserve("account_recovery", ["subscriber", subscriberId], now))) return null;
      const events = [];
      for (const { channel, payload } of payloads) {
        const event = await providerFor(channel)?.authenticate(payload);
        if (!event || event.purpose !== "recovery") return null;
        events.push({ ...event, channel });
      }
      return recoverVerifiedDevice(database, key, events, {
        subscriberId, now, expiresAt: now + policy.sessionSeconds, deviceLabel,
      });
    },

    async acceptProviderEvent(channel, payload, { rateSubject, deviceLabel }) {
      const provider = providerFor(channel);
      const now = clock();
      if (!provider || !(await reserve("challenge_verify", rateSubject, now))) return null;
      const event = await provider.authenticate(payload);
      if (!event?.sender || !(await reserve("challenge_verify", [channel, event.sender], now))) return null;
      if (event.purpose === "login") {
        return consumeVerifiedLogin(database, key, { ...event, channel }, {
          subscriberId: event.subscriberId, now, expiresAt: now + policy.sessionSeconds, deviceLabel,
        });
      }
      if (event.purpose !== "registration") return null;
      return consumeVerifiedEvent(database, key, { ...event, channel }, now);
    },
  };
}

// The current legal versions are provided by the trusted policy catalog.
// Incomplete preregistrations never acquire active status until both the
// required contact checks and current acceptances are recorded.
export async function activateVerifiedConsumer(database, subscriberId, policyVersions, now) {
  if (!Number.isSafeInteger(now) || now < 0) throw new TypeError("invalid activation timestamp");
  const policies = requiredPolicies("consumer").map(policy => [policy, policyVersions.get(policy)]);
  if (policies.some(([, version]) => typeof version !== "string" || !version)) return false;
  const result = await database.prepare(`
    UPDATE subscriber SET state = 'active'
    WHERE id = ?1 AND role = 'consumer' AND state = 'incomplete' AND phone_verified_at <= ?2
      AND (email IS NULL OR email_verified_at <= ?2)
      AND NOT EXISTS (
        SELECT 1 FROM json_each(?3) AS expected
        WHERE NOT EXISTS (
          SELECT 1 FROM subscriber_policy_acceptance
          WHERE subscriber_id = ?1 AND policy = json_extract(expected.value, '$[0]')
            AND version = json_extract(expected.value, '$[1]') AND accepted_at <= ?2
        )
      )
    RETURNING id
  `).bind(subscriberId, now, JSON.stringify(policies)).first();
  return Boolean(result);
}
