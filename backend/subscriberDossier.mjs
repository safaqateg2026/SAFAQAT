/**
 * Unified administrative subscriber dossier.
 * The actor must originate from trusted server-side MFA authentication.
 * Never construct the actor from browser-supplied values.
 */

const validId = value =>
  typeof value === "string" &&
  /^[A-Za-z0-9_-]{1,128}$/.test(value);

export async function readSubscriberDossier(
  database,
  actor,
  subscriberId,
  { now }
) {
  if (!validId(subscriberId)) {
    throw new TypeError("invalid subscriber ID");
  }

  if (
    !actor?.administratorId ||
    actor.mfaVerified !== true ||
    !Number.isSafeInteger(now) ||
    now < 0
  ) {
    throw new Error("administrator access denied");
  }

  const eventId = crypto.randomUUID();

  const audit = database.prepare(`
    INSERT INTO administrator_access_event
      (id, administrator_id, subscriber_id, action, occurred_at)
    SELECT ?1, permission.administrator_id, account.id,
      'subscriber_search', ?4
    FROM administrator_permission AS permission
    JOIN subscriber AS account ON account.id = ?3
    WHERE permission.administrator_id = ?2
      AND permission.permission = 'subscriber_search'
      AND EXISTS (
        SELECT 1 FROM administrator_permission
        WHERE administrator_id = ?2
          AND permission = 'identity_search'
      )
    RETURNING id
  `).bind(eventId, actor.administratorId, subscriberId, now);

  const guard = `
    EXISTS (
      SELECT 1 FROM administrator_access_event
      WHERE id = ?2 AND subscriber_id = ?1
    )
  `;

  const query = sql =>
    database.prepare(sql).bind(subscriberId, eventId);

  const [
    access,
    accounts,
    businesses,
    vehicles,
    policies,
    reviews,
    sessions,
    totals
  ] = await database.batch([
    audit,

    query(`
      SELECT id AS subscriberId, role, state,
        full_name AS fullName, birth_date AS birthDate,
        phone, email,
        phone_verified_at AS phoneVerifiedAt,
        email_verified_at AS emailVerifiedAt,
        governorate_code AS governorateCode,
        district_code AS districtCode,
        address, latitude, longitude, language,
        created_at AS createdAt
      FROM subscriber
      WHERE id = ?1 AND ${guard}
    `),

    query(`
      SELECT name, activity_code AS activityCode,
        premises_address AS premisesAddress
      FROM subscriber_business
      WHERE subscriber_id = ?1 AND ${guard}
    `),

    query(`
      SELECT vehicle_type AS vehicleType,
        plate_letters AS plateLetters,
        plate_digits AS plateDigits
      FROM subscriber_delivery
      WHERE subscriber_id = ?1 AND ${guard}
    `),

    query(`
      SELECT policy, version, accepted_at AS acceptedAt
      FROM subscriber_policy_acceptance
      WHERE subscriber_id = ?1 AND ${guard}
      ORDER BY accepted_at DESC, policy, version
      LIMIT 50
    `),

    query(`
      SELECT decision, reason, reviewed_at AS reviewedAt
      FROM subscriber_verification_review
      WHERE subscriber_id = ?1 AND ${guard}
      ORDER BY reviewed_at DESC
      LIMIT 1
    `),

    query(`
      SELECT device_label AS deviceLabel,
        issued_at AS issuedAt,
        last_seen_at AS lastSeenAt,
        expires_at AS expiresAt,
        revoked_at AS revokedAt
      FROM subscriber_session
      WHERE subscriber_id = ?1 AND ${guard}
    `),

    query(`
      WITH entries AS (
        SELECT 'purchase' AS kind, total_minor
        FROM completed_order_total WHERE buyer_id = ?1
        UNION ALL
        SELECT 'sale', total_minor
        FROM completed_order_total WHERE seller_id = ?1
      )
      SELECT kind, count(*) AS orderCount,
        CAST(sum(total_minor) AS TEXT) AS totalMinor
      FROM entries
      WHERE ${guard}
      GROUP BY kind
      ORDER BY kind
    `)
  ]);

  if (!access.results.length) {
    throw new Error("administrator access denied");
  }

  const account = accounts.results[0];
  if (!account) return null;

  const dossier = {
    account,
    contacts: {
      phoneVerified: account.phoneVerifiedAt !== null,
      emailVerified: account.emailVerifiedAt !== null
    },
    policies: policies.results,
    latestReview: reviews.results[0] ?? null,
    session: sessions.results[0] ?? null,
    completedOrderTotals: totals.results
  };

  if (account.role === "supplier" ||
      account.role === "retailer") {
    dossier.business = businesses.results[0] ?? null;
  }

  if (account.role === "courier") {
    dossier.vehicle = vehicles.results[0] ?? null;
  }

  return dossier;
}
