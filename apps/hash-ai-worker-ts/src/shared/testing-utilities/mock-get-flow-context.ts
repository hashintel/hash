import { Entity } from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";
import type { EntityUuid } from "@local/hash-graph-types/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import { mapFlowRunToEntityProperties } from "@local/hash-isomorphic-utils/flows/mappings";
import type { RunFlowWorkflowParams } from "@local/hash-isomorphic-utils/flows/temporal-types";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import type { Context } from "@temporalio/activity";
// eslint-disable-next-line import/no-extraneous-dependencies
import { vi } from "vitest";

import { graphApiClient } from "../../activities/shared/graph-api-client.js";
import { getAliceUserAccountId } from "./get-alice-user-account-id.js";

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[P] extends ReadonlyArray<infer U>
      ? ReadonlyArray<DeepPartial<U>>
      : T[P] extends object
        ? DeepPartial<T[P]>
        : T[P];
};

const createDummyFlow = async (params: { actorId: AccountId }) => {
  const { actorId } = params;

  const dummyFlowRunProperties = mapFlowRunToEntityProperties({
    name: "dummy-name",
    flowRunId: generateUuid() as EntityUuid,
    trigger: {
      triggerDefinitionId: "userTrigger",
    },
    flowDefinitionId: generateUuid() as EntityUuid,
    steps: [],
  });

  const dummyFlowEntity = await Entity.create(
    graphApiClient,
    { actorId },
    {
      ownedById: actorId as OwnedById,
      entityTypeId: systemEntityTypes.flowRun.entityTypeId,
      properties: dummyFlowRunProperties,
      provenance: {
        actorType: "machine",
        origin: {
          type: "flow",
        },
      },
      draft: false,
      relationships: createDefaultAuthorizationRelationships({ actorId }),
    },
  );

  return { dummyFlowEntity };
};

const aliceUserAccountId = await getAliceUserAccountId();

vi.mock("@temporalio/activity", async (importOriginal) => {
  const original =
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    await importOriginal<typeof import("@temporalio/activity")>();

  const { dummyFlowEntity } = await createDummyFlow({
    actorId: aliceUserAccountId,
  });

  return {
    ...original,
    Context: {
      ...original.Context,
      current: () =>
        ({
          cancellationSignal: new AbortController().signal,
          info: {
            workflowExecution: {
              workflowId: extractEntityUuidFromEntityId(
                dummyFlowEntity.metadata.recordId.entityId,
              ),
            },
            activityId: "test-activity-id",
          },
        }) satisfies DeepPartial<Context>,
    },
  };
});

vi.mock("@local/hash-backend-utils/temporal", async (importOriginal) => {
  const original =
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    await importOriginal<typeof import("@local/hash-backend-utils/temporal")>();

  return {
    ...original,
    // eslint-disable-next-line @typescript-eslint/require-await
    createTemporalClient: async () => ({
      workflow: {
        getHandle: () => ({
          query: (params: { name: string }) => {
            const { name } = params;

            if (name === "getExternalInputResponse") {
              const response = {
                requestId: "test-request-id",
                type: "human-input",
                data: {
                  answers: [],
                },
              };

              return response;
            }
          },
          signal: async () => {},
          // eslint-disable-next-line @typescript-eslint/require-await
          fetchHistory: async () => {
            const mockedFlorWorkflowParams: RunFlowWorkflowParams = {
              dataSources: {
                files: { fileEntityIds: [] },
                internetAccess: {
                  enabled: false,
                  browserPlugin: {
                    enabled: false,
                    domains: [],
                  },
                },
              },
              flowDefinition: {} as FlowDefinition,
              flowTrigger: {
                triggerDefinitionId: "userTrigger",
              },
              webId: aliceUserAccountId as OwnedById,
              userAuthentication: {
                actorId: aliceUserAccountId,
              },
            };

            return {
              events: [
                {
                  workflowExecutionStartedEventAttributes: {
                    input: {
                      payloads: [
                        {
                          data: JSON.stringify(mockedFlorWorkflowParams),
                        },
                      ],
                    },
                  },
                },
              ],
            };
          },
        }),
      },
    }),
  };
});
