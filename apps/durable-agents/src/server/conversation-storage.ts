/**
 * Where a conversation's Harness keeps its state: one storage per
 * conversation, which can say whether it still owns what it opened.
 */
import { createHash } from "node:crypto";

import { openPostgresStorage } from "../storage/postgres/postgres-storage";

import type { Storage } from "@earendil-works/pi-durable";
import type { Pool } from "pg";

/** A conversation's storage, and whether it still owns it: a later opener elsewhere takes ownership. */
export type OwnedStorage = Storage & {
  isOwner(): Promise<boolean>;
};

/** Open a conversation's storage, taking ownership of it. */
export type OpenConversationStorage = (
  conversationId: string,
) => Promise<OwnedStorage>;

/**
 * The Postgres schema of a conversation: a fixed prefix and a hash of its
 * id, so any id gives a plain lowercase identifier within Postgres's 63
 * characters, and one id always gives the same schema.
 */
export const conversationSchema = (conversationId: string): string =>
  `durable_chat_${createHash("sha256").update(conversationId).digest("hex").slice(0, 40)}`;

/** Each conversation in its own schema, every one opened on the process's shared `pool`. */
export const postgresConversationStorage =
  (pool: Pool): OpenConversationStorage =>
  (conversationId) =>
    openPostgresStorage({ pool, schema: conversationSchema(conversationId) });
