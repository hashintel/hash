import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { Logger } from "@local/hash-backend-utils/logger";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type { GraphApi } from "@local/hash-graph-client";
import type { AccountId } from "@local/hash-graph-types/account";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import opentelemetry from "@opentelemetry/api";

let __graphApi: GraphApi | undefined;
export const getGraphApiClient = (): GraphApi => {
  if (!__graphApi) {
    __graphApi = createGraphClient(
      new Logger({ mode: "dev", serviceName: "hash-backend-performance" }),
      {
        host: getRequiredEnv("HASH_GRAPH_API_HOST"),
        port: parseInt(getRequiredEnv("HASH_GRAPH_API_PORT"), 10),
        // requestInterceptor: (request) => {
        //   opentelemetry.propagation.inject(
        //     opentelemetry.context.active(),
        //     request.headers,
        //   );
        //   return request;
        // },
      },
    );
  }

  return __graphApi;
};

let __systemAccountId: AccountId | undefined;
export const getSystemAccountId = async (): Promise<AccountId> => {
  if (!__systemAccountId) {
    __systemAccountId = await getGraphApiClient()
      .getEntityTypes(publicUserAccountId, {
        filter: {
          equal: [
            { path: ["versionedUrl"] },
            { parameter: systemEntityTypes.organization.entityTypeId },
          ],
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
      })
      .then(({ data: response }) => {
        const entityType = response.entityTypes[0];
        if (!entityType) {
          throw new Error(
            "Critical: No organization entity type found in the graph. Did you forgot to migrate the Node API?",
          );
        }
        return entityType.metadata.provenance.edition.createdById as AccountId;
      });
  }

  return __systemAccountId!;
};
