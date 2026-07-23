import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const reels = sqliteTable("reels", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  messageId: text("message_id").notNull().unique(),
  senderId: text("sender_id").notNull(),
  sourceUrl: text("source_url").notNull(),
  storageKey: text("storage_key"),
  filename: text("filename"),
  contentType: text("content_type"),
  sizeBytes: integer("size_bytes"),
  status: text("status").notNull().default("queued"),
  error: text("error"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
});

export const authorizedSenders = sqliteTable("authorized_senders", {
  senderId: text("sender_id").primaryKey(),
  pairedAt: text("paired_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
