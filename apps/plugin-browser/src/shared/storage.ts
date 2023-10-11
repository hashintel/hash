import { EntityType } from "@blockprotocol/graph";
import { ProposedEntity } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { Simplified } from "@local/hash-isomorphic-utils/simplify-properties";
import { User } from "@local/hash-isomorphic-utils/system-types/shared";
import { EntityId } from "@local/hash-subgraph";
import browser from "webextension-polyfill";

type CreationStatus = "errored" | "pending" | "skipped" | EntityId;

export type CreationStatuses = Record<string, CreationStatus | undefined>;

export type CreationStatusRecord = {
  overallStatus: "not-started" | "pending" | "complete";
  entityStatuses: CreationStatuses;
};

type InferenceErrorStatus = {
  message: string;
  status: "error";
};

type InferenceCompleteStatus = {
  proposedEntities: ProposedEntity[];
  status: "success";
};

export type InferenceStatus =
  | {
      status: "not-started" | "pending";
    }
  | InferenceErrorStatus
  | InferenceCompleteStatus;

/**
 * Storage area cleared when the browser is closed.
 *
 * Note: not available to content scripts without running browser.storage.session.setAccessLevel("TRUSTED_AND_UNTRUSTED_CONTEXTS");
 * @see https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/session
 */
export type SessionStorage = {
  creationStatus: CreationStatusRecord;
  draftQuickNote: string;
  entitiesToCreate: ProposedEntity[];
  entityTypes: EntityType[];
  inferenceStatus: InferenceStatus;
  targetEntityTypes: EntityType[];
  user: Simplified<User> | null;
};

export const getFromSessionStorage = async <Key extends keyof SessionStorage>(
  key: Key,
): Promise<SessionStorage[Key] | undefined> => {
  return browser.storage.session
    .get(key)
    .then((result) => result[key] as SessionStorage[Key]);
};

/**
 * Set a value in session storage.
 */
export const setInSessionStorage = async (
  key: keyof SessionStorage,
  value: SessionStorage[keyof SessionStorage],
) => {
  await browser.storage.session.set({ [key]: value });
};
