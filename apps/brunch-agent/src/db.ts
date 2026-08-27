/**
 * The substrate's conversation storage — host-authored because Flue requires
 * it of the consuming app.
 *
 * Without this file conversations are process-memory and a restart loses them.
 */

import { sqlite } from "@flue/runtime/node";

import { conversationDbPath } from "./db-path.ts";

export default sqlite(conversationDbPath());
