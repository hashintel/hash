import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
  intervalForTimestamp,
} from "@blockprotocol/graph/stdlib";
import type { Entity, EntityId, WebId } from "@blockprotocol/type-system";
import { currentTimestamp } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { FeatureFlag } from "@local/hash-isomorphic-utils/feature-flags";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { ImageFile } from "@local/hash-isomorphic-utils/system-types/imagefile";
import type {
  BrowserPluginSettingsProperties,
  BrowserPluginSettingsPropertiesWithMetadata,
  OrganizationProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import type { UserProperties } from "@local/hash-isomorphic-utils/system-types/user";

import type { MeQuery, MeQueryVariables } from "../graphql/api-types.gen";
import { meQuery } from "../graphql/queries/user.queries";
import { createDefaultSettings } from "./create-default-settings";
import { createEntity } from "./create-entity";
import { queryGraphQlApi } from "./query-graphql-api";
import type { LocalStorage } from "./storage";
import { getFromLocalStorage, setInLocalStorage } from "./storage";

const getAvatarForEntity = (
  subgraph: Subgraph<EntityRootType<HashEntity>>,
  entityId: EntityId,
): Entity<ImageFile> | undefined => {
  const avatarLinkAndEntities = getOutgoingLinkAndTargetEntities(
    subgraph,
    entityId,
    intervalForTimestamp(currentTimestamp()),
  ).filter(({ linkEntity }) =>
    linkEntity[0]?.metadata.entityTypeIds.includes(
      systemLinkEntityTypes.hasAvatar.linkEntityTypeId,
    ),
  );
  return avatarLinkAndEntities[0]?.rightEntity[0] as
    | Entity<ImageFile>
    | undefined;
};

/**
 * Ideally we would use {@link extractWebIdFromEntityId} from @blockprotocol/type-system/slim here,
 * but importing it causes WASM-related functions to end up in the bundle,
 * even when imports from that path (/slim) aren't supposed to include the WASM
 *
 * @todo figure out why that is and fix it, possibly in the @blockprotocol/type-system package
 *    or in the plugin-browser webpack config.
 */
export const getWebIdFromEntityId = (entityId: EntityId) =>
  entityId.split("~")[0] as WebId;

export const getUser = (): Promise<LocalStorage["user"] | null> => {
  return queryGraphQlApi<MeQuery, MeQueryVariables>(meQuery)
    .then(async ({ data }) => {
      const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<
        EntityRootType<HashEntity>
      >(data.me.subgraph);

      const user = getRoots(subgraph)[0]!;

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
      ).filter(({ linkEntity }) =>
        linkEntity[0]?.metadata.entityTypeIds.includes(
          systemLinkEntityTypes.isMemberOf.linkEntityTypeId,
        ),
      );

      const userBrowserPreferences = getOutgoingLinkAndTargetEntities(
        subgraph,
        user.metadata.recordId.entityId,
      ).filter(
        ({ linkEntity, rightEntity }) =>
          linkEntity[0]?.metadata.entityTypeIds.includes(
            systemLinkEntityTypes.has.linkEntityTypeId,
          ) &&
          rightEntity[0]?.metadata.entityTypeIds.includes(
            systemEntityTypes.browserPluginSettings.entityTypeId,
          ),
      )[0]?.rightEntity[0];

      let settingsEntityId: EntityId;

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
        const userWebWebId = getWebIdFromEntityId(
          user.metadata.recordId.entityId,
        );

        const defaultSettings = createDefaultSettings({
          userWebWebId,
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
            "https://hash.ai/@h/types/property-type/automatic-inference-configuration/":
              {
                value: automaticInferenceConfig,
                metadata: {
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
                },
              },
            "https://hash.ai/@h/types/property-type/manual-inference-configuration/":
              {
                value: manualInferenceConfig,
                metadata: {
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
                },
              },
            "https://hash.ai/@h/types/property-type/browser-plugin-tab/": {
              value: popupTab,
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
              },
            },
            ...(draftQuickNote
              ? {
                  "https://hash.ai/@h/types/property-type/draft-note/": {
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
          entityTypeIds: [systemEntityTypes.browserPluginSettings.entityTypeId],
          properties,
        });

        settingsEntityId = settingsEntityMetadata.metadata.recordId.entityId;

        await createEntity({
          entityTypeIds: [systemLinkEntityTypes.has.linkEntityTypeId],
          properties: { value: {} },
          linkData: {
            leftEntityId: user.metadata.recordId.entityId,
            rightEntityId: settingsEntityId,
          },
        });
      }

      const orgs = orgLinksAndEntities.map(({ rightEntity }) => {
        const org = rightEntity[0]!;
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
          webWebId: getWebIdFromEntityId(org.metadata.recordId.entityId),
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
        webWebId: getWebIdFromEntityId(user.metadata.recordId.entityId),
      } as LocalStorage["user"];
    })
    .catch(() => null);
};
