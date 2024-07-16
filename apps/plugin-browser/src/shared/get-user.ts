import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { Timestamp } from "@local/hash-graph-types/temporal-versioning";
import type { OwnedById } from "@local/hash-graph-types/web";
import type { FeatureFlag } from "@local/hash-isomorphic-utils/feature-flags";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { Image } from "@local/hash-isomorphic-utils/system-types/image";
import type {
  BrowserPluginSettingsProperties,
  BrowserPluginSettingsPropertiesWithMetadata,
  OrganizationProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import type { UserProperties } from "@local/hash-isomorphic-utils/system-types/user";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
  intervalForTimestamp,
} from "@local/hash-subgraph/stdlib";

import type { MeQuery, MeQueryVariables } from "../graphql/api-types.gen";
import { meQuery } from "../graphql/queries/user.queries";
import { createDefaultSettings } from "./create-default-settings";
import { createEntity } from "./create-entity";
import { queryGraphQlApi } from "./query-graphql-api";
import type { LocalStorage } from "./storage";
import { getFromLocalStorage, setInLocalStorage } from "./storage";

const getAvatarForEntity = (
  subgraph: Subgraph<EntityRootType>,
  entityId: EntityId,
): Entity<Image> | undefined => {
  const avatarLinkAndEntities = getOutgoingLinkAndTargetEntities(
    subgraph,
    entityId,
    intervalForTimestamp(new Date().toISOString() as Timestamp),
  ).filter(
    ({ linkEntity }) =>
      linkEntity[0]?.metadata.entityTypeId ===
      systemLinkEntityTypes.hasAvatar.linkEntityTypeId,
  );
  return avatarLinkAndEntities[0]?.rightEntity[0] as Entity<Image> | undefined;
};

/**
 * Ideally we would use {@link extractOwnedByIdFromEntityId} from @local/hash-subgraph here,
 * but importing it causes WASM-related functions to end up in the bundle,
 * even when imports in that package only come from `@blockprotocol/type-system/slim`,
 * which isn't supposed to have WASM.
 *
 * @todo figure out why that is and fix it, possibly in the @blockprotocol/type-system package
 *    or in the plugin-browser webpack config.
 */
export const getOwnedByIdFromEntityId = (entityId: EntityId) =>
  entityId.split("~")[0] as OwnedById;

export const getUser = (): Promise<LocalStorage["user"] | null> => {
  return queryGraphQlApi<MeQuery, MeQueryVariables>(meQuery)
    .then(async ({ data }) => {
      const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
        data.me.subgraph,
      );

      const user = getRoots(subgraph)[0];

      const simpleProperties = simplifyProperties(
        user.properties as UserProperties,
      );

      const { email, shortname, displayName } = simpleProperties;

      if (!shortname || !displayName) {
        // User has not completed signup
        return null;
      }

      const userAvatar = getAvatarForEntity(
        subgraph,
        user.metadata.recordId.entityId,
      );

      const orgLinksAndEntities = getOutgoingLinkAndTargetEntities(
        subgraph,
        user.metadata.recordId.entityId,
      ).filter(
        ({ linkEntity }) =>
          linkEntity[0]?.metadata.entityTypeId ===
          systemLinkEntityTypes.isMemberOf.linkEntityTypeId,
      );

      const userBrowserPreferences = getOutgoingLinkAndTargetEntities(
        subgraph,
        user.metadata.recordId.entityId,
      ).filter(
        ({ linkEntity, rightEntity }) =>
          linkEntity[0]?.metadata.entityTypeId ===
            systemLinkEntityTypes.has.linkEntityTypeId &&
          rightEntity[0].metadata.entityTypeId ===
            systemEntityTypes.browserPluginSettings.entityTypeId,
      )[0]?.rightEntity[0];

      let settingsEntityId: EntityId;

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- false positive
      if (userBrowserPreferences) {
        settingsEntityId = userBrowserPreferences.metadata.recordId.entityId;

        const {
          automaticInferenceConfiguration,
          manualInferenceConfiguration,
          draftNote,
          browserPluginTab,
        } = simplifyProperties(
          userBrowserPreferences.properties as BrowserPluginSettingsProperties,
        );

        await Promise.all([
          setInLocalStorage(
            "automaticInferenceConfig",
            automaticInferenceConfiguration as LocalStorage["automaticInferenceConfig"],
            true,
          ),
          setInLocalStorage(
            "manualInferenceConfig",
            manualInferenceConfiguration as LocalStorage["manualInferenceConfig"],
            true,
          ),
          setInLocalStorage(
            "popupTab",
            browserPluginTab as LocalStorage["popupTab"],
            true,
          ),
        ]);

        if (draftNote) {
          await setInLocalStorage("draftQuickNote", draftNote, true);
        }
      } else {
        /**
         * Create the user's browser settings entity
         */
        const userWebOwnedById = getOwnedByIdFromEntityId(
          user.metadata.recordId.entityId,
        );

        const defaultSettings = createDefaultSettings({
          userWebOwnedById,
        });

        const automaticInferenceConfig =
          (await getFromLocalStorage("automaticInferenceConfig")) ??
          defaultSettings.automaticInferenceConfig;

        const manualInferenceConfig =
          (await getFromLocalStorage("manualInferenceConfig")) ??
          defaultSettings.manualInferenceConfig;

        const popupTab =
          (await getFromLocalStorage("popupTab")) ?? defaultSettings.popupTab;

        const draftQuickNote = await getFromLocalStorage("draftQuickNote");

        const properties: BrowserPluginSettingsPropertiesWithMetadata = {
          value: {
            "https://hash.ai/@hash/types/property-type/automatic-inference-configuration/":
              {
                value: automaticInferenceConfig,
                metadata: {
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
                },
              },
            "https://hash.ai/@hash/types/property-type/manual-inference-configuration/":
              {
                value: manualInferenceConfig,
                metadata: {
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
                },
              },
            "https://hash.ai/@hash/types/property-type/browser-plugin-tab/": {
              value: popupTab,
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
              },
            },
            ...(draftQuickNote
              ? {
                  "https://hash.ai/@hash/types/property-type/draft-note/": {
                    value: draftQuickNote,
                    metadata: {
                      dataTypeId:
                        "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    },
                  },
                }
              : {}),
          },
        };

        const settingsEntityMetadata = await createEntity({
          entityTypeId: systemEntityTypes.browserPluginSettings.entityTypeId,
          properties,
        });

        settingsEntityId = settingsEntityMetadata.metadata.recordId.entityId;

        await createEntity({
          entityTypeId: systemLinkEntityTypes.has.linkEntityTypeId,
          properties: { value: {} },
          linkData: {
            leftEntityId: user.metadata.recordId.entityId,
            rightEntityId: settingsEntityId,
          },
        });
      }

      const orgs = orgLinksAndEntities.map(({ rightEntity }) => {
        const org = rightEntity[0];
        const orgAvatar = getAvatarForEntity(
          subgraph,
          org.metadata.recordId.entityId,
        );
        return {
          metadata: org.metadata,
          properties: simplifyProperties(
            org.properties as OrganizationProperties,
          ),
          avatar: orgAvatar,
          webOwnedById: getOwnedByIdFromEntityId(
            org.metadata.recordId.entityId,
          ),
        };
      });

      const enabledFeatureFlags =
        (simpleProperties.enabledFeatureFlags as FeatureFlag[] | undefined) ??
        [];

      return {
        metadata: user.metadata,
        avatar: userAvatar,
        orgs,
        properties: {
          email,
          displayName,
          shortname,
        },
        enabledFeatureFlags,
        settingsEntityId,
        webOwnedById: getOwnedByIdFromEntityId(user.metadata.recordId.entityId),
      } as LocalStorage["user"];
    })
    .catch(() => null);
};
