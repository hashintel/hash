import { EntityType } from "@blockprotocol/graph";
import { Simplified } from "@local/hash-isomorphic-utils/simplify-properties";
import { User } from "@local/hash-isomorphic-utils/system-types/shared";

/**
 * Storage area cleared when the browser is closed.
 *
 * Note: not available to content scripts without running browser.storage.session.setAccessLevel("TRUSTED_AND_UNTRUSTED_CONTEXTS");
 * @see https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/session
 */
export type SessionStorage = {
  entityTypes: EntityType[];
  user: Simplified<User> | null;
};
