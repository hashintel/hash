import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { ImageV2Properties } from "@local/hash-isomorphic-utils/system-types/image";
import {
  BrowserPluginSettingsProperties,
  OrganizationProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import { UserV4Properties } from "@local/hash-isomorphic-utils/system-types/user";
import {
  Entity,
  EntityId,
  EntityRootType,
  OwnedById,
  Subgraph,
  Timestamp,
} from "@local/hash-subgraph";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
  intervalForTimestamp,
} from "@local/hash-subgraph/stdlib";

import { MeQuery, MeQueryVariables } from "../graphql/api-types.gen";
import { meQuery } from "../graphql/queries/user.queries";
import { createDefaultSettings } from "./create-default-settings";
import { createEntity } from "./create-entity";
import { queryGraphQlApi } from "./query-graphql-api";
import {
  getFromLocalStorage,
  LocalStorage,
  setInLocalStorage,
} from "./storage";

const getAvatarForEntity = (
  subgraph: Subgraph<EntityRootType>,
  entityId: EntityId,
): Entity<ImageV2Properties> | undefined => {
  const avatarLinkAndEntities = getOutgoingLinkAndTargetEntities(
    subgraph,
    entityId,
    intervalForTimestamp(new Date().toISOString() as Timestamp),
  ).filter(
    ({ linkEntity }) =>
      linkEntity[0]?.metadata.entityTypeId ===
      systemLinkEntityTypes.hasAvatar.linkEntityTypeId,
  );
  return avatarLinkAndEntities[0]?.rightEntity[0] as unknown as
    | Entity<ImageV2Properties>
    | undefined;
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

      const { email, shortname, displayName } = simplifyProperties(
        user.properties as UserV4Properties,
      );

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

        const properties: BrowserPluginSettingsProperties = {
          "https://hash.ai/@hash/types/property-type/automatic-inference-configuration/":
            automaticInferenceConfig,
          "https://hash.ai/@hash/types/property-type/manual-inference-configuration/":
            manualInferenceConfig,
          "https://hash.ai/@hash/types/property-type/browser-plugin-tab/":
            popupTab,
          "https://hash.ai/@hash/types/property-type/draft-note/":
            draftQuickNote,
        };

        const settingsEntityMetadata = await createEntity({
          entityTypeId: systemEntityTypes.browserPluginSettings.entityTypeId,
          properties,
        });

        settingsEntityId = settingsEntityMetadata.metadata.recordId.entityId;

        await createEntity({
          entityTypeId: systemLinkEntityTypes.has.linkEntityTypeId,
          properties: {},
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
          ...org,
          avatar: orgAvatar,
          properties: simplifyProperties(
            org.properties as OrganizationProperties,
          ),
          webOwnedById: getOwnedByIdFromEntityId(
            org.metadata.recordId.entityId,
          ),
        };
      });

      return {
        ...user,
        avatar: userAvatar,
        orgs,
        properties: {
          email,
          displayName,
          shortname,
        },
        settingsEntityId,
        webOwnedById: getOwnedByIdFromEntityId(user.metadata.recordId.entityId),
      };
    })
    .catch(() => null);
};
