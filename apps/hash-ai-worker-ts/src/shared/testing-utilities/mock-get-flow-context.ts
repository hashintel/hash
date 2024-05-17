import type { RunFlowWorkflowParams } from "@local/hash-isomorphic-utils/flows/temporal-types";
import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { FlowProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  type AccountId,
  type EntityId,
  extractEntityUuidFromEntityId,
  type OwnedById,
} from "@local/hash-subgraph";
import type { Context } from "@temporalio/activity";
// eslint-disable-next-line import/no-extraneous-dependencies
import { vi } from "vitest";

import { graphApiClient } from "../../activities/shared/graph-api-client";
import { getAliceUserAccountId } from "./get-alice-user-account-id";

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

  const dummyFlowProperties: FlowProperties = {
    "https://hash.ai/@hash/types/property-type/flow-definition-id/": "dummy",
    "https://hash.ai/@hash/types/property-type/step/": [{}],
    "https://hash.ai/@hash/types/property-type/trigger/": {
      "https://hash.ai/@hash/types/property-type/trigger-definition-id/":
        "dummy-trigger",
    },
  };

  const { data: dummyFlowEntityMetadata } = await graphApiClient.createEntity(
    actorId,
    {
      ownedById: actorId,
      entityTypeIds: [systemEntityTypes.flow.entityTypeId],
      properties: dummyFlowProperties,
      draft: false,
      relationships: createDefaultAuthorizationRelationships({ actorId }),
    },
  );

  return { dummyFlowEntityMetadata };
};

const aliceUserAccountId = await getAliceUserAccountId();

vi.mock("@temporalio/activity", async (importOriginal) => {
  const original =
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    await importOriginal<typeof import("@temporalio/activity")>();

  const { dummyFlowEntityMetadata } = await createDummyFlow({
    actorId: aliceUserAccountId,
  });

  return {
    ...original,
    Context: {
      ...original.Context,
      current: () =>
        ({
          info: {
            workflowExecution: {
              workflowId: extractEntityUuidFromEntityId(
                dummyFlowEntityMetadata.recordId.entityId as EntityId,
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
            const mockedFlorWorkflowParams: Partial<RunFlowWorkflowParams> = {
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
