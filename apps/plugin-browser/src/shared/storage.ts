import type { EntityTypeRootType, Subgraph } from "@blockprotocol/graph";
import type {
  Entity,
  EntityId,
  EntityMetadata,
  EntityTypeWithMetadata,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import type { Subtype } from "@local/advanced-types/subtype";
import type {
  ExternalInputWebsocketRequestMessage,
  InferenceModelName,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import type { FeatureFlag } from "@local/hash-isomorphic-utils/feature-flags";
import type { AutomaticInferenceSettings } from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-types";
import type {
  PersistedEntityMetadata,
  WebPage,
} from "@local/hash-isomorphic-utils/flows/types";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  SimpleProperties,
  Simplified,
} from "@local/hash-isomorphic-utils/simplify-properties";
import type { ImageFile } from "@local/hash-isomorphic-utils/system-types/imagefile";
import type {
  BrowserPluginSettings,
  Organization,
  UserProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import debounce from "lodash.debounce";
import browser from "webextension-polyfill";

import type { FlowRun } from "../graphql/api-types.gen";
import { setDisabledBadge, setEnabledBadge } from "./badge";
import { updateEntity } from "./storage/update-entity";

type SimplifiedUser = {
  metadata: EntityMetadata;
  properties: Required<
    Pick<
      SimpleProperties<UserProperties>,
      "email" | "displayName" | "shortname"
    >
  >;
  enabledFeatureFlags: FeatureFlag[];
};

type UserAndLinkedData = SimplifiedUser & {
  avatar?: ImageFile;
  orgs: (Simplified<Entity<Organization>> & {
    avatar?: ImageFile;
    webWebId: WebId;
  })[];
  settingsEntityId: EntityId;
  webWebId: WebId;
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
    automaticInferenceConfig: AutomaticInferenceSettings;
    draftQuickNote: string;
    manualInferenceConfig: {
      createAs: "draft" | "live";
      model: InferenceModelName;
      webId: WebId;
      targetEntityTypeIds: VersionedUrl[];
    };
    popupTab: "one-off" | "automated" | "history";
  }
>;

export type ExternalInputRequestById = {
  [requestUuid: string]: {
    message: ExternalInputWebsocketRequestMessage;
    receivedAt: string;
  } | null;
};

export type MinimalFlowRun = Pick<
  FlowRun,
  | "flowDefinitionId"
  | "flowRunId"
  | "webId"
  | "closedAt"
  | "executedAt"
  | "status"
  | "inputs"
  | "inputRequests"
> & { persistedEntities: PersistedEntityMetadata[]; webPage: WebPage };

/**
 * One of the flow runs we expose in the History tab, which are one of:
 * 1. Flows triggered by the browser, whether automatic or maunal, or
 * 2. Flows which have requested the content of a web page from the browser
 */
export type FlowFromBrowserOrWithPageRequest = MinimalFlowRun & {
  requestedPageUrl?: string;
};

/**
 * LocalStorage area cleared persisted when the browser is closed.
 * Cleared if the extension is loaded with no user present.
 */
export type LocalStorage = PersistedUserSettings & {
  apiOrigin?: string;
  flowRuns: FlowFromBrowserOrWithPageRequest[];
  entityTypesSubgraph: Subgraph<EntityTypeRootType> | null;
  entityTypes: EntityTypeWithMetadata[];
  externalInputRequests?: ExternalInputRequestById;
  localPendingFlowRuns?: MinimalFlowRun[];
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

  await updateEntity<BrowserPluginSettings>({
    entityId: settingsEntityId,
    entityTypeIds: [systemEntityTypes.browserPluginSettings.entityTypeId],
    updatedProperties: {
      value: {
        "https://hash.ai/@h/types/property-type/automatic-inference-configuration/":
          {
            value: currentAutomaticConfig,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
            },
          },
        "https://hash.ai/@h/types/property-type/manual-inference-configuration/":
          {
            value: currentManualConfig,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
            },
          },
        "https://hash.ai/@h/types/property-type/browser-plugin-tab/": {
          value: currentPopupTab,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          },
        },
        ...(currentDraftNote
          ? {
              "https://hash.ai/@h/types/property-type/draft-note/": {
                value: currentDraftNote,
                metadata: {
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                },
              },
            }
          : {}),
      },
    },
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
