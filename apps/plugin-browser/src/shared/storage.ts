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
 * Storage area cleared persisted when the browser is closed.
 * Cleared if the extension is loaded with no user present.
 */
export type LocalStorage = {
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

export const getFromLocalStorage = async <Key extends keyof LocalStorage>(
  key: Key,
): Promise<LocalStorage[Key] | undefined> => {
  return browser.storage.local
    .get(key)
    .then((result) => result[key] as LocalStorage[Key]);
};

/**
 * Set a value in local storage.
 */
export const setInLocalStorage = async (
  key: keyof LocalStorage,
  value: LocalStorage[keyof LocalStorage],
) => {
  await browser.storage.local.set({ [key]: value });
};

type ReplaceFromLocalStorageValue<Key extends keyof LocalStorage> = (
  currentValue: LocalStorage[Key] | undefined,
) => LocalStorage[Key];

/**
 * Returns a function that can be called with a function to set a new value in local storage from the old value.
 * i.e. it returns a function that can be used like the callback form of React's setState
 * @example
 * const setFromCurrentValue = getSetFromLocalStorageValue("inferenceStatus");
 * setFromCurrentValue((currentValue) => { // return the new value });
 */
export const getSetFromLocalStorageValue = <Key extends keyof LocalStorage>(
  key: Key,
): ((replaceFunction: ReplaceFromLocalStorageValue<Key>) => Promise<void>) => {
  return async (replaceFunction) => {
    const currentValue = await getFromLocalStorage(key);
    const newValue = replaceFunction(currentValue);
    await setInLocalStorage(key, newValue);
  };
};

export const clearLocalStorage = async () => {
  console.log("Clearing");
  await browser.storage.local.clear();
};
