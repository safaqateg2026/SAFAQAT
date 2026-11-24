import { digestSessionToken, findActiveSession } from "./sessions.mjs";

// Use only a private R2 binding. No URL or object key is returned to the
// browser. The route should return a generic 404 for every null result.
export async function readOwnArchiveDocument(database, privateBucket, {
  token, documentId, clock,
}) {
  if (!privateBucket || typeof documentId !== "string" || !documentId || documentId.length > 128) return null;
  const account = await findActiveSession(database, token, clock());
  if (!account || !/^[a-z0-9_-]{1,128}$/i.test(account.subscriberId)) return null;

  const document = await database.prepare(`
    SELECT object_key AS objectKey FROM subscriber_archive_document WHERE id = ?1 AND subscriber_id = ?2
  `).bind(documentId, account.subscriberId).first();
  if (!document || !/^[0-9a-f]{64}$/.test(document.objectKey)) return null;
  const object = await privateBucket.get(`${account.role}/${account.subscriberId}/${document.objectKey}`);
  if (!object?.body) return null;

  const now = clock();
  try {
    const access = await database.prepare(`
      INSERT INTO subscriber_audit_event (id, subscriber_id, actor_type, actor_id, event_type, occurred_at)
      SELECT ?1, account.id, 'subscriber', account.id, 'document_accessed', ?3
      FROM subscriber AS account JOIN subscriber_session AS session ON session.subscriber_id = account.id
      JOIN subscriber_archive_document AS document ON document.subscriber_id = account.id
      WHERE account.id = ?2 AND account.state = 'active' AND session.token_digest = ?4
        AND session.issued_at <= ?3 AND session.expires_at > ?3 AND session.revoked_at IS NULL
        AND document.id = ?5 AND document.object_key = ?6
      RETURNING id
    `).bind(crypto.randomUUID(), account.subscriberId, now, await digestSessionToken(token),
      documentId, document.objectKey).first();
    if (!access) {
      await object.body.cancel();
      return null;
    }
  } catch (error) {
    await object.body.cancel().catch(() => {});
    throw error;
  }

  return new Response(object.body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": "attachment",
      "Content-Type": "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
