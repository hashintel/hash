import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
  intervalForTimestamp,
} from "@blockprotocol/graph/stdlib";
import { currentTimestamp } from "@blockprotocol/type-system";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import { meQuery } from "../graphql/queries/user.queries";
import { createDefaultSettings } from "./create-default-settings";
import { createEntity } from "./create-entity";
import { queryGraphQlApi } from "./query-graphql-api";
import { getFromLocalStorage, setInLocalStorage } from "./storage";

import type { MeQuery, MeQueryVariables } from "../graphql/api-types.gen";
import type { LocalStorage } from "./storage";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type { Entity, EntityId, WebId } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { FeatureFlag } from "@local/hash-isomorphic-utils/feature-flags";
import type { ImageFile } from "@local/hash-isomorphic-utils/system-types/imagefile";
import type {
  BrowserPluginSettingsProperties,
  BrowserPluginSettingsPropertiesWithMetadata,
  OrganizationProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import type { UserProperties } from "@local/hash-isomorphic-utils/system-types/user";

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
  return avatarLinkAndEntities[0]?.rightEntity?.[0] as
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

      const orgMemberships = getOutgoingLinkAndTargetEntities(
        subgraph,
        user.metadata.recordId.entityId,
      ).flatMap(({ linkEntity, rightEntity }) => {
        const membershipLinkEntity = linkEntity[0];

        return membershipLinkEntity?.metadata.entityTypeIds.includes(
          systemLinkEntityTypes.isMemberOf.linkEntityTypeId,
        )
          ? [{ membershipLinkEntity, rightEntity }]
          : [];
      });

      const [userBrowserPreferences] = getOutgoingLinkAndTargetEntities(
        subgraph,
        user.metadata.recordId.entityId,
      ).flatMap(({ linkEntity, rightEntity }) => {
        const hasLinkEntity = linkEntity[0];

        if (
          !hasLinkEntity?.metadata.entityTypeIds.includes(
            systemLinkEntityTypes.has.linkEntityTypeId,
          )
        ) {
          return [];
        }

        if (rightEntity === undefined) {
          /**
           * The query pairs each incoming has-left-entity hop with an
           * outgoing has-right-entity hop, so every link in the subgraph must
           * have its has-right-entity edge resolved. An unresolved edge means
           * the subgraph is internally inconsistent – falling through to the
           * create branch here could create a duplicate settings entity and
           * link.
           */
          throw new Error(
            `Invariant violation: has link ${hasLinkEntity.metadata.recordId.entityId} on user ${user.metadata.recordId.entityId} has an unresolved right-entity edge in the subgraph`,
          );
        }

        const settingsEntity = rightEntity[0];

        if (!settingsEntity) {
          /**
           * The edge resolved but no revision of the target entity is visible
           * in the queried interval, e.g. because the settings entity has
           * been archived. The link no longer points at usable settings, so
           * fall through to the create branch to create a replacement.
           */
          return [];
        }

        return settingsEntity.metadata.entityTypeIds.includes(
          systemEntityTypes.browserPluginSettings.entityTypeId,
        )
          ? [settingsEntity]
          : [];
      });

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

      const orgs = orgMemberships.map(
        ({ membershipLinkEntity, rightEntity }) => {
          const org = rightEntity?.[0];
          if (!org) {
            /**
             * Org entities are public – if the membership link is in the
             * subgraph, its right (org) entity must be too. A missing org
             * entity means the subgraph is internally inconsistent.
             */
            throw new Error(
              `Invariant violation: membership link ${membershipLinkEntity.metadata.recordId.entityId} is missing its right (org) entity in the subgraph`,
            );
          }
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
        },
      );

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
    .catch((error) => {
      /**
       * Failures here include invariant violations thrown while walking the
       * subgraph, failures to recreate missing settings entities, and network
       * errors. Callers treat a null return as "signed out", so log the error
       * to keep the failure observable.
       */
      // eslint-disable-next-line no-console -- TODO: consider using logger
      console.error("Error fetching and processing user:", error);
      return null;
    });
};
