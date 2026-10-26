// Operator-only temporary control. Never part of application authorization or a browser request.
export async function withReadLease(db, authIds, work) {
  const links = (
    await db.query(
      "SELECT auth_user_id FROM synapse.auth_identity_links WHERE revoked_at IS NULL",
    )
  ).rows;
  if (
    links.length !== 2 ||
    links.some((l) => !authIds.includes(l.auth_user_id))
  )
    throw Error(
      "Controlled preview requires exactly the two approved mappings.",
    );
  const initial = (
    await db.query(
      "SELECT read_enabled,read_until::text FROM synapse.phase1_access_config WHERE singleton",
    )
  ).rows[0];
  if (initial.read_enabled)
    throw Error(
      "An already active preview is never overridden by a test runner.",
    );
  const lease = (
    await db.query(
      "UPDATE synapse.phase1_access_config SET read_enabled=true,read_until=now()+interval '10 minutes' WHERE singleton AND NOT read_enabled RETURNING read_until::text",
    )
  ).rows[0];
  if (!lease) throw Error("Preview gate changed concurrently.");
  try {
    return await work();
  } finally {
    const restored = await db.query(
      "UPDATE synapse.phase1_access_config SET read_enabled=$1,read_until=$2 WHERE singleton AND read_until=$3",
      [initial.read_enabled, initial.read_until, lease.read_until],
    );
    if (restored.rowCount !== 1)
      throw Error(
        "Preview lease changed concurrently; manual operator review required.",
      );
  }
}
