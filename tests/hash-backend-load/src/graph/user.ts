import type { GetEntitiesRequest } from "@local/hash-graph-client/api";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type { Entity } from "@local/hash-graph-sdk/entity";
import {
  blockProtocolPropertyTypes,
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { mapGraphApiEntityToEntity } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { User } from "@local/hash-isomorphic-utils/system-types/shared";
import type { AccountEntityId } from "@local/hash-subgraph";
import { extractAccountId } from "@local/hash-subgraph";

import { getGraphApiClient, getSystemAccountId } from "./api";

export const getUser = async (params: {
  authentication: AuthenticationContext;
  filter: GetEntitiesRequest["filter"];
  includeDrafts?: boolean;
}): Promise<Entity<User> | undefined> => {
  const systemAccountId = await getSystemAccountId();
  const [userEntity, ...unexpectedEntities] = await getGraphApiClient()
    .getEntities(systemAccountId, {
      filter: {
        all: [
          {
            equal: [
              { path: ["type", "versionedUrl"] },
              { parameter: systemEntityTypes.user.entityTypeId },
            ],
          },
          params.filter,
        ],
      },
      temporalAxes: {
        pinned: {
          axis: "transactionTime",
          timestamp: null,
        },

        variable: {
          axis: "decisionTime",
          interval: {
            start: null,
            end: null,
          },
        },
      },
      includeDrafts: params.includeDrafts ?? false,
    })
    .then(({ data: { entities } }) =>
      entities.map((entity) => mapGraphApiEntityToEntity<User>(entity, null)),
    );

  if (unexpectedEntities.length > 0) {
    throw new Error(`Critical: More than one user entity found in the graph.`);
  }

  return userEntity;
};

export const getUserByKratosIdentityId = async (params: {
  authentication: AuthenticationContext;
  kratosIdentityId: string;
  includeDrafts?: boolean;
}): Promise<Entity<User> | undefined> =>
  getUser({
    authentication: params.authentication,
    filter: {
      equal: [
        {
          path: [
            "properties",
            systemPropertyTypes.kratosIdentityId.propertyTypeBaseUrl,
          ],
        },
        { parameter: params.kratosIdentityId },
      ],
    },
    includeDrafts: params.includeDrafts,
  });

export const completeUserRegistration = async (params: {
  kratosIdentityId: string;
  shortname: string;
  displayName: string;
}): Promise<Entity<User>> => {
  const authentication = { actorId: await getSystemAccountId() };
  const user = await getUserByKratosIdentityId({
    authentication,
    kratosIdentityId: params.kratosIdentityId,
  });
  if (!user) {
    throw new Error(
      `No user with Kratos ID "${params.kratosIdentityId}" found.`,
    );
  }

  const systemAccountId = await getSystemAccountId();
  const graphApi = getGraphApiClient();
  const accountId = extractAccountId(
    user.metadata.recordId.entityId as AccountEntityId,
  );

  await graphApi.modifyWebAuthorizationRelationships(systemAccountId, [
    {
      operation: "delete",
      resource: accountId,
      relationAndSubject: {
        relation: "owner",
        subject: {
          kind: "account",
          subjectId: systemAccountId,
        },
      },
    },
    {
      operation: "create",
      resource: accountId,
      relationAndSubject: {
        relation: "owner",
        subject: {
          kind: "account",
          subjectId: accountId,
        },
      },
    },
  ]);

  return user.patch(getGraphApiClient(), authentication, {
    propertyPatches: [
      {
        op: "add",
        path: [systemPropertyTypes.shortname.propertyTypeBaseUrl],
        property: {
          value: params.shortname,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          },
        },
      },
      {
        op: "add",
        path: [blockProtocolPropertyTypes.displayName.propertyTypeBaseUrl],
        property: {
          value: params.displayName,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          },
        },
      },
    ],
    provenance: {
      actorType: "machine",
      origin: {
        type: "api",
      },
    },
  });
};
