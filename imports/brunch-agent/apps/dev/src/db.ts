/**
 * The substrate's conversation storage — host-authored because Flue requires
 * it of the consuming app (spec §9.6, adjudication C1).
 *
 * Not to be confused with the capture store: that is the harness's storage
 * port, harness-defined and implemented in `@brunch/binding-flue`, and plugins are
 * blind to both. This file holds only the live transport copy of conversations.
 * The provenance record is the target-document's own session-log archive.
 *
 * Without this file conversations are process-memory and a restart loses them
 * (recorded Flue fact, spec §10). Restart durability of the full stack is an
 * open verification item (spec §14.5) that this file exists to make testable.
 */

import { sqlite } from '@flue/runtime/node';
import { conversationDbPath } from './db-path.ts';

export default sqlite(conversationDbPath());
