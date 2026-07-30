import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

async function migrationFiles() {
  const directory = new URL("../drizzle/", import.meta.url);
  const files = (await readdir(directory))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  return { directory, files };
}

function applyMigration(database, sql) {
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
}

test("0010 preserves existing Reels and Instagram insights while adding YouTube state", async () => {
  const { directory, files } = await migrationFiles();
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");

  for (const file of files.filter((name) => name < "0010_")) {
    applyMigration(database, await readFile(new URL(file, directory), "utf8"));
  }
  database.prepare(`INSERT INTO reels
    (message_id, sender_id, source_url, rights_confirmed, status, publication_mode,
      share_to_feed, publish_status)
    VALUES (?, ?, ?, 1, 'ready', 'approval', 1, 'published')`)
    .run("existing-reel", "test", "https://www.instagram.com/reel/existing/");
  const reelId = Number(database.prepare("SELECT id FROM reels WHERE message_id = ?").get("existing-reel").id);
  database.prepare(`INSERT INTO reel_insights
    (reel_id, views, reach, likes, comments, saved, shares, total_interactions,
      average_watch_time_ms, total_watch_time_ms)
    VALUES (?, 120, 80, 10, 2, 3, 4, 19, 4500, 90000)`).run(reelId);

  const migration = files.find((name) => name.startsWith("0010_"));
  assert.ok(migration, "migration 0010 must exist");
  applyMigration(database, await readFile(new URL(migration, directory), "utf8"));

  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM reels").get().total, 1);
  assert.equal(database.prepare("SELECT views FROM reel_insights WHERE reel_id = ?").get(reelId).views, 120);
  assert.equal(database.prepare("SELECT follows FROM reel_insights WHERE reel_id = ?").get(reelId).follows, 0);
  assert.deepEqual(
    database.prepare(`SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN ('youtube_auth', 'oauth_states', 'content_reviews',
        'youtube_publications', 'youtube_insights', 'youtube_insight_snapshots')
      ORDER BY name`).all().map((row) => row.name),
    [
      "content_reviews",
      "oauth_states",
      "youtube_auth",
      "youtube_insight_snapshots",
      "youtube_insights",
      "youtube_publications",
    ],
  );
  database.close();
});

test("the executor keeps uploads private and implements resume, probes and cleanup", async () => {
  const source = await readFile(new URL("../youtube-uploader/src/index.mjs", import.meta.url), "utf8");
  assert.match(source, /privacyStatus: "private"/);
  assert.match(source, /content-range/);
  assert.match(source, /response\.status === 308/);
  assert.match(source, /ffprobe/);
  assert.match(source, /ffmpeg/);
  assert.match(source, /await rm\(directory, \{ recursive: true, force: true \}\)/);
  assert.doesNotMatch(source, /refresh.?token/i);
});

test("public release is gated by explicit checks, audit, processing and moderation", async () => {
  const source = await readFile(new URL("../worker/youtube.ts", import.meta.url), "utf8");
  assert.match(source, /checksConfirmed !== true/);
  assert.match(source, /YOUTUBE_API_AUDITED/);
  assert.match(source, /uploadStatus !== "processed"/);
  assert.match(source, /moderation_status !== "safe"/);
  assert.match(source, /technical_eligible/);
  assert.match(source, /privacyStatus: "public"/);
});

test("zero-cost mode dispatches one GitHub job and requires manual review", async () => {
  const worker = await readFile(new URL("../worker/youtube.ts", import.meta.url), "utf8");
  const executor = await readFile(new URL("../youtube-uploader/src/index.mjs", import.meta.url), "utf8");
  const workflow = await readFile(
    new URL("../.github/workflows/youtube-uploader.yml", import.meta.url),
    "utf8",
  );

  assert.match(worker, /YOUTUBE_EXECUTOR_MODE/);
  assert.match(worker, /workflow_dispatch|actions\/workflows/);
  assert.match(worker, /moderation_status = 'manual_review'/);
  assert.match(worker, /manualReviewConfirmed !== true/);
  assert.match(executor, /RUN_ONCE/);
  assert.match(executor, /analysisMode === "openai"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\bschedule:/);
  assert.match(workflow, /privacy|Process one private Short/i);
});
