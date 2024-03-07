import { GraphApi } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  UserSecretProperties,
  UsesUserSecretProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import {
  AccountId,
  Entity,
  EntityId,
  EntityRootType,
  extractEntityUuidFromEntityId,
} from "@local/hash-subgraph";
import {
  getEntityRevision,
  getRoots,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";
import { Auth, google } from "googleapis";

import { VaultClient } from "./vault";

const googleOAuthClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const googleOAuthClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

export const createGoogleOAuth2Client = () => {
  if (!googleOAuthClientId || !googleOAuthClientSecret) {
    throw new Error(
      "GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set in the environment",
    );
  }

  return new google.auth.OAuth2(
    googleOAuthClientId,
    googleOAuthClientSecret,
    /**
     * This must be the literal string 'postmessage' because we are using the popup consent flow in the frontend.
     * If we switch to handling the consent flow via our own redirect URL,
     * the redirect URL must be passed here and registered in the Google Cloud Console for the API client.
     */
    "postmessage",
  );
};

export const getSecretEntitiesForGoogleAccount = async ({
  authentication,
  graphApi,
  googleAccountEntityId,
}: {
  authentication: { actorId: AccountId };
  graphApi: GraphApi;
  googleAccountEntityId: EntityId;
}): Promise<
  {
    usesUserSecretLink: Entity<UsesUserSecretProperties>;
    userSecret: Entity<UserSecretProperties>;
  }[]
> => {
  return await graphApi
    .getEntitiesByQuery(authentication.actorId, {
      query: {
        filter: {
          all: [
            generateVersionedUrlMatchingFilter(
              systemLinkEntityTypes.usesUserSecret.linkEntityTypeId,
              {
                ignoreParents: true,
              },
            ),
            {
              equal: [
                { path: ["leftEntity", "uuid"] },
                {
                  parameter: extractEntityUuidFromEntityId(
                    googleAccountEntityId,
                  ),
                },
              ],
            },
            {
              equal: [
                { path: ["rightEntity", "type", "versionedUrl"] },
                {
                  parameter: systemEntityTypes.userSecret.entityTypeId,
                },
              ],
            },
            { equal: [{ path: ["archived"] }, { parameter: false }] },
          ],
        },
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          hasRightEntity: { incoming: 0, outgoing: 1 },
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
      },
    })
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(
        data.subgraph,
      );

      const linkEntities = getRoots(subgraph);

      const linkAndSecretPairs: {
        usesUserSecretLink: Entity<UsesUserSecretProperties>;
        userSecret: Entity<UserSecretProperties>;
      }[] = [];

      for (const link of linkEntities) {
        if (
          link.metadata.entityTypeId !==
          systemLinkEntityTypes.usesUserSecret.linkEntityTypeId
        ) {
          throw new Error(
            `Unexpected entity type ${link.metadata.entityTypeId} in getSecretsForAccount subgraph`,
          );
        }

        if (!link.linkData) {
          throw new Error(
            `Link entity ${link.metadata.recordId.entityId} is missing link data`,
          );
        }

        const target = getEntityRevision(subgraph, link.linkData.rightEntityId);

        if (!target) {
          throw new Error(
            `Link entity ${link.metadata.recordId.entityId} references missing target entity ${link.linkData.rightEntityId}`,
          );
        }

        if (
          target.metadata.entityTypeId !==
          systemEntityTypes.userSecret.entityTypeId
        ) {
          throw new Error(
            `Unexpected entity type ${target.metadata.entityTypeId} in getSecretsForAccount subgraph`,
          );
        }

        linkAndSecretPairs.push({
          usesUserSecretLink: link,
          userSecret: target as Entity<UserSecretProperties>,
        });
      }

      return linkAndSecretPairs;
    });
};

export const getTokensForGoogleAccount = async ({
  authentication,
  graphApi,
  googleAccountEntityId,
  userAccountId,
  vaultClient,
}: {
  authentication: { actorId: AccountId };
  googleAccountEntityId: EntityId;
  graphApi: GraphApi;
  userAccountId: AccountId;
  vaultClient: VaultClient;
}): Promise<Auth.Credentials | null> => {
  const secretAndLinkPairs = await getSecretEntitiesForGoogleAccount({
    authentication,
    googleAccountEntityId,
    graphApi,
  });

  if (!secretAndLinkPairs[0]) {
    return null;
  }

  const { userSecret } = secretAndLinkPairs[0];

  const vaultPath =
    userSecret.properties[
      "https://hash.ai/@hash/types/property-type/vault-path/"
    ];

  try {
    const vaultResponse = await vaultClient.read<Auth.Credentials>({
      secretMountPath: "secret",
      path: vaultPath,
      userAccountId,
    });
    return vaultResponse.data;
  } catch (err) {
    return null;
  }
};
