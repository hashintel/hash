import { GraphApi } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolEntityTypes,
  blockProtocolLinkEntityTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { QueryProperties } from "@local/hash-isomorphic-utils/system-types/blockprotocol/query";
import {
  AssociatedWithAccountProperties,
  GoogleAccountProperties,
  GoogleSheetsIntegrationProperties,
  HasQueryProperties,
} from "@local/hash-isomorphic-utils/system-types/googlesheetsintegration";
import {
  AccountId,
  Entity,
  EntityId,
  EntityRootType,
  splitEntityId,
} from "@local/hash-subgraph";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";
import { Auth, google } from "googleapis";

import { getSecretEntitiesForIntegration, VaultClient } from "./vault";

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

export const getTokensForGoogleAccount = async ({
  googleAccountEntityId,
  graphApi,
  userAccountId,
  vaultClient,
}: {
  googleAccountEntityId: EntityId;
  graphApi: GraphApi;
  userAccountId: AccountId;
  vaultClient: VaultClient;
}): Promise<Auth.Credentials | null> => {
  const secretAndLinkPairs = await getSecretEntitiesForIntegration({
    authentication: { actorId: userAccountId },
    integrationEntityId: googleAccountEntityId,
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

type QueryLinkAndRightEntity = {
  linkEntity: Entity<HasQueryProperties>[];
  rightEntity: Entity<QueryProperties>[];
};

type GoogleAccountLinkAndRightEntity = {
  linkEntity: Entity<AssociatedWithAccountProperties>[];
  rightEntity: Entity<GoogleAccountProperties>[];
};

type GoogleSheetsIntegrationEntities = {
  integrationEntity?: Entity<GoogleSheetsIntegrationProperties>;
  hasQueryLinkEntity?: Entity<HasQueryProperties>;
  queryEntity?: Entity<QueryProperties>;
  associatedWithAccountLinkEntity?: Entity<AssociatedWithAccountProperties>;
  googleAccountEntity?: Entity<GoogleAccountProperties>;
};

export const getGoogleSheetsIntegrationEntities = async ({
  authentication,
  graphApi,
  integrationEntityId,
}: {
  authentication: { actorId: AccountId };
  graphApi: GraphApi;
  integrationEntityId: EntityId;
}): Promise<GoogleSheetsIntegrationEntities> => {
  const [ownedById, uuid] = splitEntityId(integrationEntityId);
  const existingIntegrationEntitySubgraph = await graphApi
    .getEntitiesByQuery(authentication.actorId, {
      query: {
        filter: {
          equal: [
            {
              path: ["uuid"],
              parameter: uuid,
            },
            {
              path: ["ownedById"],
              parameter: ownedById,
            },
          ],
        },
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          hasLeftEntity: { incoming: 1, outgoing: 0 },
          hasRightEntity: { outgoing: 1, incoming: 0 },
        },
        includeDrafts: false,
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    })
    .then(({ data }) =>
      mapGraphApiSubgraphToSubgraph<EntityRootType>(data.subgraph),
    );

  const integrationEntity = getRoots(existingIntegrationEntitySubgraph)[0] as
    | Entity<GoogleSheetsIntegrationProperties>
    | undefined;

  if (!integrationEntity) {
    return {};
  }

  const outgoingLinks = getOutgoingLinkAndTargetEntities<
    (QueryLinkAndRightEntity | GoogleAccountLinkAndRightEntity)[]
  >(existingIntegrationEntitySubgraph, integrationEntityId);

  const existingGoogleAccountLink = outgoingLinks.find(
    (
      linkAndRightEntity,
    ): linkAndRightEntity is GoogleAccountLinkAndRightEntity =>
      linkAndRightEntity.linkEntity[0]?.metadata.entityTypeId ===
        systemLinkEntityTypes.associatedWithAccount.linkEntityTypeId &&
      linkAndRightEntity.rightEntity[0]?.metadata.entityTypeId ===
        systemEntityTypes.googleAccount.entityTypeId,
  );

  const existingQueryLink = outgoingLinks.find(
    (linkAndRightEntity): linkAndRightEntity is QueryLinkAndRightEntity =>
      linkAndRightEntity.linkEntity[0]?.metadata.entityTypeId ===
        blockProtocolLinkEntityTypes.hasQuery.linkEntityTypeId &&
      linkAndRightEntity.rightEntity[0]?.metadata.entityTypeId ===
        blockProtocolEntityTypes.query.entityTypeId,
  );

  return {
    integrationEntity,
    hasQueryLinkEntity: existingQueryLink?.linkEntity[0],
    queryEntity: existingQueryLink?.rightEntity[0],
    associatedWithAccountLinkEntity: existingGoogleAccountLink?.linkEntity[0],
    googleAccountEntity: existingGoogleAccountLink?.rightEntity[0],
  };
};
