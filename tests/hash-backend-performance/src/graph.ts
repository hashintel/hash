import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { Logger } from "@local/hash-backend-utils/logger";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type { GraphApi } from "@local/hash-graph-client";
import type { GetEntitiesRequest } from "@local/hash-graph-client/api";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type { Entity } from "@local/hash-graph-sdk/entity";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { mapGraphApiEntityToEntity } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { User } from "@local/hash-isomorphic-utils/system-types/shared";

const GRAPH_API_HOST = "127.0.0.1";
const GRAPH_API_PORT = 4000;

let graphApi: GraphApi | undefined;
const getGraphApiClient = () => {
  if (!graphApi) {
    graphApi = createGraphClient(
      new Logger({ mode: "dev", serviceName: "hash-backend-performance" }),
      {
        host: GRAPH_API_HOST,
        port: GRAPH_API_PORT,
      },
    );
  }

  return graphApi;
};

export const getUser = async (params: {
  authentication: AuthenticationContext;
  filter: GetEntitiesRequest["filter"];
  includeDrafts?: boolean;
}): Promise<Entity<User> | undefined> => {
  const [userEntity, ...unexpectedEntities] = await getGraphApiClient()
    .getEntities(publicUserAccountId, {
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
