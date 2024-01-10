import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import {
  ImageProperties,
  OrganizationProperties,
  UserProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
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
import { queryGraphQlApi } from "./query-graphql-api";
import { LocalStorage } from "./storage";

const getAvatarForEntity = (
  subgraph: Subgraph<EntityRootType>,
  entityId: EntityId,
): Entity<ImageProperties> | undefined => {
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
    | Entity<ImageProperties>
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
    .then(({ data }) => {
      const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
        data.me.subgraph,
      );

      const user = getRoots(subgraph)[0];

      const { email, shortname, preferredName } = simplifyProperties(
        user.properties as UserProperties,
      );

      if (!shortname || !preferredName) {
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
        ({ linkEntity }) =>
          linkEntity[0]?.metadata.entityTypeId ===
          systemLinkEntityTypes.hasPreferences.linkEntityTypeId,
      );

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
          preferredName,
          shortname,
        },
        webOwnedById: getOwnedByIdFromEntityId(user.metadata.recordId.entityId),
      };
    })
    .catch(() => null);
};
