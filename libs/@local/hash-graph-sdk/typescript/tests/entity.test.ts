import type { Entity as GraphApiEntity } from "@local/hash-graph-client/api";
import { expect, test } from "vitest";

import { Entity } from "../src/entity";

test("Entity can be created from Graph API", () => {
  const graph_api_entity = {
    metadata: {
      archived: false,
      confidence: 0.5,
      entityTypeIds: ["https://hash.ai/@hash/types/entity-type/person/v/1"],
      properties: [],
      provenance: {
        createdAtDecisionTime: "2001-01-01T00:00:00Z",
        createdAtTransactionTime: "2001-01-01T00:00:00Z",
        createdById: "4ed14962-7132-4453-8fc5-39b5c2131d45",
        firstNonDraftCreatedAtDecisionTime: "2001-01-01T00:00:00Z",
        firstNonDraftCreatedAtTransactionTime: "2001-01-01T00:00:00Z",
        edition: {
          createdById: "4ed14962-7132-4453-8fc5-39b5c2131d45",
        },
      },
      temporalVersioning: {
        decisionTime: {
          start: {
            kind: "inclusive",
            limit: "2001-01-01T00:00:00Z",
          },
          end: {
            kind: "unbounded",
          },
        },
        transactionTime: {
          start: {
            kind: "inclusive",
            limit: "2001-01-01T00:00:00Z",
          },
          end: {
            kind: "unbounded",
          },
        },
      },
      recordId: {
        // random uuid
        editionId: "b152948f-5bc2-43e6-a6ff-87d8006f0fae",
        entityId:
          "36fb3cd2-a500-493e-ab1e-e0b3a40839aa~17562306-35b5-4bb1-bda3-1c5ddea833ea",
      },
    },
    properties: {},
  } satisfies GraphApiEntity;

  const entityInstance = new Entity(graph_api_entity);

  expect(entityInstance.entityId).toBe(
    graph_api_entity.metadata.recordId.entityId,
  );
});
