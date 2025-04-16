import type {
  BaseUrl,
  Confidence,
  PropertyObjectMetadata,
} from "@blockprotocol/type-system";
import type { Entity as GraphApiEntity } from "@local/hash-graph-client";
import { expect, test } from "vitest";

import { HashEntity } from "../src/entity.js";

const base_url_a = "https://example.com/property-type/a/" as BaseUrl;
const base_url_aa = "https://example.com/property-type/aa/" as BaseUrl;
const base_url_aaa = "https://example.com/property-type/aaa/" as BaseUrl;
const base_url_aaaa = "https://example.com/property-type/aaaa/" as BaseUrl;
const base_url_b = "https://example.com/property-type/b/" as BaseUrl;
const base_url_bb = "https://example.com/property-type/bb/" as BaseUrl;
const base_url_b10b = "https://example.com/property-type/b10b/" as BaseUrl;
const base_url_b10bb = "https://example.com/property-type/b10bb/" as BaseUrl;
const base_url_c = "https://example.com/property-type/c/" as BaseUrl;
const base_url_cc = "https://example.com/property-type/c/" as BaseUrl;

const createTestEntity = (): GraphApiEntity => ({
  metadata: {
    archived: false,
    confidence: 0.5,
    entityTypeIds: ["https://hash.ai/@h/types/entity-type/person/v/1"],
    provenance: {
      createdAtDecisionTime: "2001-01-01T00:00:00Z",
      createdAtTransactionTime: "2001-01-01T00:00:00Z",
      createdById: "4ed14962-7132-4453-8fc5-39b5c2131d45",
      firstNonDraftCreatedAtDecisionTime: "2001-01-01T00:00:00Z",
      firstNonDraftCreatedAtTransactionTime: "2001-01-01T00:00:00Z",
      edition: {
        createdById: "4ed14962-7132-4453-8fc5-39b5c2131d45",
        actorType: "machine",
        origin: {
          type: "api",
        },
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
    properties: {
      value: {
        [base_url_a]: {
          value: {
            [base_url_aa]: {
              value: {
                [base_url_aaa]: {
                  metadata: {
                    confidence: 0.1 as Confidence,
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  },
                },
              },
            },
          },
          metadata: {
            confidence: 0.2 as Confidence,
          },
        },
        [base_url_b]: {
          value: [
            {
              value: {
                [base_url_b10b]: {
                  metadata: {
                    confidence: 0.3 as Confidence,
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
                  },
                },
              },
            },
          ],
          metadata: {
            confidence: 0.4 as Confidence,
          },
        },
        [base_url_c]: {
          value: [
            {
              metadata: {
                confidence: 0.5 as Confidence,
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
              },
            },
          ],
        },
      },
    } satisfies PropertyObjectMetadata,
  },
  properties: {},
});

test("Entity can be created from Graph API", () => {
  const testEntity = createTestEntity();
  const entityInstance = new HashEntity(testEntity);

  expect(entityInstance.entityId).toBe(testEntity.metadata.recordId.entityId);
});

test("propertyMetadata access", () => {
  const entityInstance = new HashEntity(createTestEntity());

  expect(entityInstance.propertyMetadata([base_url_a])).toEqual({
    value: {
      [base_url_aa]: {
        value: {
          [base_url_aaa]: {
            metadata: {
              confidence: 0.1,
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        },
      },
    },
    metadata: {
      confidence: 0.2,
    },
  });

  expect(entityInstance.propertyMetadata([base_url_a, base_url_aa])).toEqual({
    value: {
      [base_url_aaa]: {
        metadata: {
          confidence: 0.1,
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        },
      },
    },
  });

  expect(
    entityInstance.propertyMetadata([base_url_a, base_url_aa, base_url_aaa]),
  ).toEqual({
    metadata: {
      confidence: 0.1,
      dataTypeId:
        "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
    },
  });

  expect(
    entityInstance.propertyMetadata([
      base_url_a,
      base_url_aa,
      base_url_aaa,
      base_url_aaaa,
    ]),
  ).toBeUndefined();

  expect(entityInstance.propertyMetadata([base_url_b])).toEqual({
    value: [
      {
        value: {
          [base_url_b10b]: {
            metadata: {
              confidence: 0.3,
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
            },
          },
        },
      },
    ],
    metadata: {
      confidence: 0.4,
    },
  });

  expect(
    entityInstance.propertyMetadata([base_url_b, base_url_bb]),
  ).toBeUndefined();

  expect(entityInstance.propertyMetadata([base_url_b, 10])).toBeUndefined();

  expect(entityInstance.propertyMetadata([base_url_b, 20])).toBeUndefined();

  expect(
    entityInstance.propertyMetadata([base_url_b, 0, base_url_b10b]),
  ).toEqual({
    metadata: {
      confidence: 0.3,
      dataTypeId:
        "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
    },
  });

  expect(
    entityInstance.propertyMetadata([
      base_url_b,
      10,
      base_url_b10b,
      base_url_b10bb,
    ]),
  ).toBeUndefined();

  expect(entityInstance.propertyMetadata([base_url_c])).toEqual({
    value: [
      {
        metadata: {
          confidence: 0.5,
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
        },
      },
    ],
  });

  expect(entityInstance.propertyMetadata([base_url_c, 1])).toBeUndefined();

  expect(
    entityInstance.propertyMetadata([base_url_c, 0, base_url_cc]),
  ).toBeUndefined();

  expect(entityInstance.propertyMetadata([base_url_c, 0])).toEqual({
    metadata: {
      confidence: 0.5,
      dataTypeId:
        "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
    },
  });
});

test("flattened properties", () => {
  const entityInstance = new HashEntity(createTestEntity());

  expect(entityInstance.flattenedPropertiesMetadata()).toStrictEqual([
    {
      path: [base_url_a, base_url_aa, base_url_aaa],
      metadata: {
        confidence: 0.1,
        dataTypeId:
          "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      },
    },
    { path: [base_url_a], metadata: { confidence: 0.2 } },
    {
      path: [base_url_b, 0, base_url_b10b],
      metadata: {
        confidence: 0.3,
        dataTypeId:
          "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
      },
    },
    { path: [base_url_b], metadata: { confidence: 0.4 } },
    {
      path: [base_url_c, 0],
      metadata: {
        confidence: 0.5,
        dataTypeId:
          "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
      },
    },
  ]);
});
