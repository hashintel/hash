import type { ActorEntityUuid } from "@blockprotocol/type-system";
import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { Logger } from "@local/hash-backend-utils/logger";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type { GraphApi } from "@local/hash-graph-client";
import { getEntityTypeById } from "@local/hash-graph-sdk/entity-type";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import opentelemetry from "@opentelemetry/api";

let __graphApi: GraphApi | undefined;
export const getGraphApiClient = (): GraphApi => {
  __graphApi ??= createGraphClient(
    new Logger({
      environment: "development",
      serviceName: "hash-backend-load",
    }),
    {
      host: getRequiredEnv("HASH_GRAPH_HTTP_HOST"),
      port: Number.parseInt(getRequiredEnv("HASH_GRAPH_HTTP_PORT"), 10),
      requestInterceptor: (request) => {
        opentelemetry.propagation.inject(
          opentelemetry.context.active(),
          request,
        );
        return request;
      },
    },
  );

  return __graphApi;
};

let __systemAccountId: ActorEntityUuid | undefined;
export const getSystemAccountId = async (): Promise<ActorEntityUuid> => {
  __systemAccountId ??= await getEntityTypeById(
    getGraphApiClient(),
    { actorId: publicUserAccountId },
    {
      entityTypeId: systemEntityTypes.organization.entityTypeId,
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  ).then((entityType) => {
    if (!entityType) {
      throw new Error(
        "Critical: No organization entity type found in the graph. Did you forgot to migrate the Node API?",
      );
    }
    return entityType.metadata.provenance.edition.createdById;
  });

  return __systemAccountId!;
};
