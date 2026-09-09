// One expiring lease shared by cron and manual publication requests.
export const CREATE_PUBLICATION_LOCK = `CREATE TABLE IF NOT EXISTS instagram_publication_lock (
  id INTEGER PRIMARY KEY NOT NULL,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
)`;

export async function withPublicationLock<T>(db: D1Database, operation: () => Promise<T>) {
  const token = crypto.randomUUID();
  const claimed = await db.prepare(`INSERT INTO instagram_publication_lock (id, token, expires_at)
    VALUES (1, ?, unixepoch() + 600)
    ON CONFLICT(id) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at
    WHERE instagram_publication_lock.expires_at <= unixepoch()`)
    .bind(token).run();
  if (!claimed.meta.changes) return { busy: true } as const;
  try {
    return await operation();
  } finally {
    await db.prepare("DELETE FROM instagram_publication_lock WHERE id = 1 AND token = ?")
      .bind(token).run();
  }
}
