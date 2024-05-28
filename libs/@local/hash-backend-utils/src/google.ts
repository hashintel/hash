import { getSecretEntitiesForIntegration } from "@local/hash-backend-utils/user-secret";
import type { GraphApi } from "@local/hash-graph-client";
import type { AccountId } from "@local/hash-graph-types/account";
import type { Entity, EntityId } from "@local/hash-graph-types/entity";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { googleEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { AccountProperties as GoogleAccountProperties } from "@local/hash-isomorphic-utils/system-types/google/account";
import type { EntityRootType } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import type { Auth } from "googleapis";
import { google } from "googleapis";

import type { VaultClient } from "./vault";

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

/**
 * Get a Google Account entity by the account id in Google
 */
export const getGoogleAccountById = async ({
  graphApiClient,
  googleAccountId,
  userAccountId,
}: {
  userAccountId: AccountId;
  googleAccountId: string;
  graphApiClient: GraphApi;
}): Promise<Entity<GoogleAccountProperties> | undefined> => {
  const entities = await graphApiClient
    .getEntitySubgraph(userAccountId, {
      filter: {
        all: [
          {
            equal: [{ path: ["ownedById"] }, { parameter: userAccountId }],
          },
          { equal: [{ path: ["archived"] }, { parameter: false }] },
          generateVersionedUrlMatchingFilter(
            googleEntityTypes.account.entityTypeId,
            { ignoreParents: true },
          ),
          {
            equal: [
              {
                path: [
                  "properties",
                  "https://hash.ai/@google/types/property-type/account-id/",
                ],
              },
              { parameter: googleAccountId },
            ],
          },
        ],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
    })
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(
        data.subgraph,
        userAccountId,
      );

      return getRoots(subgraph);
    });

  if (entities.length > 1) {
    throw new Error(
      `More than one Google Account with id ${googleAccountId} found for user ${userAccountId}`,
    );
  }

  const entity = entities[0];

  return entity as Entity<GoogleAccountProperties> | undefined;
};

export const getTokensForGoogleAccount = async ({
  googleAccountEntityId,
  graphApiClient,
  userAccountId,
  vaultClient,
}: {
  googleAccountEntityId: EntityId;
  graphApiClient: GraphApi;
  userAccountId: AccountId;
  vaultClient: VaultClient;
}): Promise<Auth.Credentials | null> => {
  const secretAndLinkPairs = await getSecretEntitiesForIntegration({
    authentication: { actorId: userAccountId },
    integrationEntityId: googleAccountEntityId,
    graphApiClient,
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
