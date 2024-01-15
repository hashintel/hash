import type { VersionedUrl } from "@blockprotocol/graph";
import { Subtype } from "@local/advanced-types/subtype";
import type {
  InferenceModelName,
  InferEntitiesReturn,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  SimpleProperties,
  Simplified,
} from "@local/hash-isomorphic-utils/simplify-properties";
import type {
  BrowserPluginSettingsProperties,
  ImageProperties,
  OrganizationProperties,
  UserProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import {
  Entity,
  EntityId,
  EntityTypeRootType,
  EntityTypeWithMetadata,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph";
import debounce from "lodash.debounce";
import browser from "webextension-polyfill";

import { setDisabledBadge, setEnabledBadge } from "./badge";
import { updateEntity } from "./storage/update-entity";

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

type SimplifiedUser = Entity & {
  properties: Required<
    Pick<
      SimpleProperties<UserProperties>,
      "email" | "preferredName" | "shortname"
    >
  >;
};

type UserAndLinkedData = SimplifiedUser & {
  avatar?: Entity<ImageProperties>;
  orgs: (Simplified<Entity<OrganizationProperties>> & {
    avatar?: Entity<ImageProperties>;
    webOwnedById: OwnedById;
  })[];
  settingsEntityId: EntityId;
  webOwnedById: OwnedById;
};

const persistedUserSettingKeys = [
  "automaticInferenceConfig",
  "draftQuickNote",
  "manualInferenceConfig",
  "popupTab",
] as const;

type PersistedUserSettingsKey = (typeof persistedUserSettingKeys)[number];

export type PersistedUserSettings = Subtype<
  Record<PersistedUserSettingsKey, unknown>,
  {
    automaticInferenceConfig: {
      createAs: "draft" | "live";
      displayGroupedBy: "type" | "location";
      enabled: boolean;
      model: InferenceModelName;
      ownedById: OwnedById;
      rules: {
        restrictToDomains: string[];
        entityTypeId: VersionedUrl;
      }[];
    };
    draftQuickNote: string;
    manualInferenceConfig: {
      createAs: "draft" | "live";
      model: InferenceModelName;
      ownedById: OwnedById;
      targetEntityTypeIds: VersionedUrl[];
    };
    popupTab: "one-off" | "automated" | "log";
  }
>;

/**
 * LocalStorage area cleared persisted when the browser is closed.
 * Cleared if the extension is loaded with no user present.
 */
export type LocalStorage = PersistedUserSettings & {
  entityTypesSubgraph: Subgraph<EntityTypeRootType> | null;
  entityTypes: EntityTypeWithMetadata[];
  inferenceRequests: PageEntityInference[];
  user: UserAndLinkedData | null;
};

const isDbPersistedSetting = (
  key: keyof LocalStorage,
): key is PersistedUserSettingsKey =>
  persistedUserSettingKeys.includes(key as PersistedUserSettingsKey);

export const getFromLocalStorage = async <Key extends keyof LocalStorage>(
  key: Key,
): Promise<LocalStorage[Key] | undefined> => {
  return browser.storage.local
    .get(key)
    .then((result) => result[key] as LocalStorage[Key]);
};

// Avoid spamming the db with updates if the user is editing settings quickly or writing a quick note
const debouncedEntityUpdate = debounce(async () => {
  const user = await getFromLocalStorage("user");
  const settingsEntityId = user?.settingsEntityId;
  if (!settingsEntityId) {
    throw new Error("User somehow has no browser plugin settings entity");
  }

  const currentAutomaticConfig = await getFromLocalStorage(
    "automaticInferenceConfig",
  );
  const currentManualConfig = await getFromLocalStorage(
    "manualInferenceConfig",
  );
  const currentPopupTab = await getFromLocalStorage("popupTab");
  const currentDraftNote = await getFromLocalStorage("draftQuickNote");
  if (!currentAutomaticConfig) {
    throw new Error(
      "User has no automatic inference config set in local storage",
    );
  }
  if (!currentManualConfig) {
    throw new Error("User has no manual inference config set in local storage");
  }
  if (!currentPopupTab) {
    throw new Error("User has no popup tab set in local storage");
  }

  const updatedProperties: BrowserPluginSettingsProperties = {
    "https://hash.ai/@hash/types/property-type/automatic-inference-configuration/":
      currentAutomaticConfig,
    "https://hash.ai/@hash/types/property-type/manual-inference-configuration/":
      currentManualConfig,
    "https://hash.ai/@hash/types/property-type/browser-plugin-tab/":
      currentPopupTab,
    "https://hash.ai/@hash/types/property-type/draft-note/": currentDraftNote,
  };

  await updateEntity({
    entityId: settingsEntityId,
    entityTypeId: systemEntityTypes.browserPluginSettings.entityTypeId,
    updatedProperties,
  });
}, 1_000);

/**
 * Set a value in local storage. Also syncs some values to the database.
 */
export const setInLocalStorage = async <Key extends keyof LocalStorage>(
  key: Key,
  value: LocalStorage[Key],
  skipDbPersist = false,
) => {
  await browser.storage.local.set({ [key]: value });

  if (key === "automaticInferenceConfig") {
    if ((value as LocalStorage["automaticInferenceConfig"]).enabled) {
      setEnabledBadge();
    } else {
      setDisabledBadge();
    }
  }

  /**
   * Persist local storage state to the database where we want to preserve state across devices/browsers/log-outs
   */
  if (!skipDbPersist && isDbPersistedSetting(key)) {
    await debouncedEntityUpdate();
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
