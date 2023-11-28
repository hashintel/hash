import { EntityType } from "@blockprotocol/graph";
import { Simplified } from "@local/hash-isomorphic-utils/simplify-properties";
import { User } from "@local/hash-isomorphic-utils/system-types/shared";
import { InferEntitiesReturn } from "@local/hash-isomorphic-utils/temporal-types";
import browser from "webextension-polyfill";

type InferenceErrorStatus = {
  errorMessage: string;
  status: "error";
};

type InferenceCompleteStatus = {
  data: InferEntitiesReturn;
  status: "complete";
};

export type InferenceStatus =
  | {
      status: "not-started" | "pending";
    }
  | InferenceErrorStatus
  | InferenceCompleteStatus;

export type PageEntityInference = InferenceStatus & {
  createdAt: string;
  entityTypes: EntityType[];
  localRequestUuid: string;
  sourceTitle: string;
  sourceUrl: string;
  trigger: "passive" | "user";
};

/**
 * Storage area cleared when the browser is closed.
 *
 * Note: not available to content scripts without running browser.storage.session.setAccessLevel("TRUSTED_AND_UNTRUSTED_CONTEXTS");
 * @see https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/session
 */
export type SessionStorage = {
  passiveInference: {
    conditions: ({ domain: string } | { urlRegExp: string })[];
    enabled: boolean;
  };
  draftQuickNote: string;
  entityTypes: EntityType[];
  inferenceRequests: PageEntityInference[];
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

type ReplaceFromSessionStorageValue<Key extends keyof SessionStorage> = (
  currentValue: SessionStorage[Key] | undefined,
) => SessionStorage[Key];

/**
 * Returns a function that can be called with a function to set a new value in session storage from the old value.
 * i.e. it returns a function that can be used like the callback form of React's setState
 * @example
 * const setFromCurrentValue = getSetFromSessionStorageValue("inferenceStatus");
 * setFromCurrentValue((currentValue) => { // return the new value });
 */
export const getSetFromSessionStorageValue = <Key extends keyof SessionStorage>(
  key: Key,
): ((
  replaceFunction: ReplaceFromSessionStorageValue<Key>,
) => Promise<void>) => {
  return async (replaceFunction) => {
    const currentValue = await getFromSessionStorage(key);
    const newValue = replaceFunction(currentValue);
    await setInSessionStorage(key, newValue);
  };
};
