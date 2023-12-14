import type { VersionedUrl } from "@blockprotocol/graph";
import type {
  InferenceModelName,
  InferEntitiesReturn,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import type { Simplified } from "@local/hash-isomorphic-utils/simplify-properties";
import type {
  ImageProperties,
  OrganizationProperties,
  UserProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import {
  Entity,
  EntityTypeWithMetadata,
  OwnedById,
} from "@local/hash-subgraph";
import browser from "webextension-polyfill";

import { setDisabledBadge, setEnabledBadge } from "./badge";

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
  entityTypeIds: VersionedUrl[];
  finishedAt?: string;
  requestUuid: string;
  model: InferenceModelName;
  ownedById: OwnedById;
  sourceTitle: string;
  sourceUrl: string;
  trigger: "passive" | "user";
};

type UserAndLinkedData = Simplified<Entity<UserProperties>> & {
  avatar?: Entity<ImageProperties>;
  orgs: (Simplified<Entity<OrganizationProperties>> & {
    avatar?: Entity<ImageProperties>;
    webOwnedById: OwnedById;
  })[];
  webOwnedById: OwnedById;
};

/**
 * Storage area cleared persisted when the browser is closed.
 * Cleared if the extension is loaded with no user present.
 */
export type LocalStorage = {
  automaticInferenceConfig: {
    createAs: "draft" | "live";
    enabled: boolean;
    model: InferenceModelName;
    ownedById: OwnedById;
    rules: {
      restrictToDomains: string[];
      entityTypeId: VersionedUrl;
    }[];
  };
  manualInferenceConfig: {
    createAs: "draft" | "live";
    model: InferenceModelName;
    ownedById: OwnedById;
    targetEntityTypeIds: VersionedUrl[];
  };
  draftQuickNote: string;
  entityTypes: EntityTypeWithMetadata[];
  inferenceRequests: PageEntityInference[];
  user: UserAndLinkedData | null;
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

  if (key === "automaticInferenceConfig") {
    if ((value as LocalStorage["automaticInferenceConfig"]).enabled) {
      setEnabledBadge();
    } else {
      setDisabledBadge();
    }
  }
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
  await browser.storage.local.clear();
};
