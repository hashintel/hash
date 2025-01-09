import "../../shared/testing-utilities/mock-get-flow-context.js";

import path from "node:path";
import { fileURLToPath } from "node:url";

import { typedEntries } from "@local/advanced-types/typed-entries";
import type { ValueMetadata } from "@local/hash-graph-client";
import type {
  EntityId,
  EntityUuid,
  PropertyMetadataObject,
} from "@local/hash-graph-types/entity";
import { brandPropertyObject } from "@local/hash-graph-types/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import {
  blockProtocolDataTypes,
  systemDataTypes,
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import type { PersonProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { entityIdFromComponents } from "@local/hash-subgraph";
import { test } from "vitest";

import type { LlmParams } from "./get-llm-response/types.js";
import type { MatchExistingEntityParams } from "./match-existing-entity.js";
import {
  matchExistingEntity,
  matchExistingEntitySystemPrompt,
} from "./match-existing-entity.js";
import { optimizeSystemPrompt } from "./optimize-system-prompt.js";
import type { MetricDefinition } from "./optimize-system-prompt/types.js";

const emptyMetadataObject: PropertyMetadataObject = {
  value: {},
};

const testOwnedById = generateUuid() as OwnedById;

const generateEntityId = () =>
  entityIdFromComponents(testOwnedById, generateUuid() as EntityUuid);

type MatchExistingEntityTest = {
  testName: string;
  inputData: MatchExistingEntityParams;
  expectedMatchEntityId: EntityId | null;
};

const billGatesUuid = generateEntityId();
const williamHenryGatesUuid = generateEntityId();
const popGatesUuid = generateEntityId();
const williamGatesBasketballUuid = generateEntityId();

const ceoStarted2020Uuid = generateEntityId();
const ceoStarted2022Uuid = generateEntityId();

const matchTestData: MatchExistingEntityTest[] = [
  {
    testName: "Match Person – Match expected",
    expectedMatchEntityId: billGatesUuid,
    inputData: {
      potentialMatches: [
        {
          entityId: billGatesUuid,
          metadata: {
            entityTypeIds: [systemEntityTypes.person.entityTypeId],
            provenance: { edition: { sources: [] } },
          },
          propertiesMetadata: emptyMetadataObject,
          properties: brandPropertyObject<PersonProperties>({
            "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
              "Bill Gates",
            "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
              "An American businessman and philanthropist best known for co-founding the software company Microsoft Corporation.",
          }),
        },
        {
          entityId: popGatesUuid,
          metadata: {
            entityTypeIds: [systemEntityTypes.person.entityTypeId],
            provenance: { edition: { sources: [] } },
          },
          propertiesMetadata: emptyMetadataObject,
          properties: brandPropertyObject<PersonProperties>({
            "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
              "William Gates",
            "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
              "A professional basketball player, he was the first African American player signed to the National Basketball League.",
          }),
        },
        {
          metadata: {
            entityTypeIds: [systemEntityTypes.person.entityTypeId],
            provenance: { edition: { sources: [] } },
          },
          entityId: williamGatesBasketballUuid,
          propertiesMetadata: emptyMetadataObject,
          properties: brandPropertyObject<PersonProperties>({
            "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
              "William Gates",
            "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
              "An American former college basketball player, subject of the 1994 documentary film Hoop Dreams.",
          }),
        },
      ],
      newEntity: {
        entityTypeIds: [systemEntityTypes.person.entityTypeId],
        editionSources: [],
        propertiesMetadata: {
          value: brandPropertyObject({
            "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
              {
                metadata: {
                  dataTypeId: blockProtocolDataTypes.text.dataTypeId,
                  provenance: {
                    sources: [],
                  },
                } satisfies ValueMetadata,
              },
            "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
              {
                metadata: {
                  dataTypeId: blockProtocolDataTypes.text.dataTypeId,
                  provenance: {
                    sources: [],
                  },
                } satisfies ValueMetadata,
              },
          }),
        },
        properties: brandPropertyObject<PersonProperties>({
          "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
            "William Gates",
          "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
            "He founded Microsoft in Albuquerque, New Mexico.",
        }),
      },
    },
  },
  {
    testName: "Match Person – No match expected",
    expectedMatchEntityId: null,
    inputData: {
      potentialMatches: [
        {
          entityId: williamHenryGatesUuid,
          metadata: {
            entityTypeIds: [systemEntityTypes.person.entityTypeId],
            provenance: { edition: { sources: [] } },
          },
          propertiesMetadata: emptyMetadataObject,
          properties: brandPropertyObject<PersonProperties>({
            "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
              "William Gates",
            "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
              "He founded Microsoft in Albuquerque, New Mexico.",
          }),
        },
        {
          entityId: billGatesUuid,
          metadata: {
            entityTypeIds: [systemEntityTypes.person.entityTypeId],
            provenance: { edition: { sources: [] } },
          },
          propertiesMetadata: emptyMetadataObject,
          properties: brandPropertyObject<PersonProperties>({
            "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
              "Bill Gates",
            "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
              "An American businessman and philanthropist best known for co-founding the software company Microsoft Corporation.",
          }),
        },
        {
          entityId: popGatesUuid,
          metadata: {
            entityTypeIds: [systemEntityTypes.person.entityTypeId],
            provenance: { edition: { sources: [] } },
          },
          propertiesMetadata: emptyMetadataObject,
          properties: brandPropertyObject<PersonProperties>({
            "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
              "William Gates",
            "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
              "A professional basketball player, he was the first African American player signed to the National Basketball League.",
          }),
        },
      ],
      newEntity: {
        entityTypeIds: [systemEntityTypes.person.entityTypeId],
        editionSources: [],
        propertiesMetadata: {
          value: brandPropertyObject({
            "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
              {
                metadata: {
                  dataTypeId: blockProtocolDataTypes.text.dataTypeId,
                  provenance: {
                    sources: [],
                  },
                } satisfies ValueMetadata,
              },
            "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
              {
                metadata: {
                  dataTypeId: blockProtocolDataTypes.text.dataTypeId,
                  provenance: {
                    sources: [],
                  },
                } satisfies ValueMetadata,
              },
          }),
        },
        properties: brandPropertyObject<PersonProperties>({
          "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
            "William Gates",
          "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
            "An American former college basketball player, subject of the 1994 documentary film Hoop Dreams. He never played professionally.",
        }),
      },
    },
  },
  {
    testName: "Match Worked At – Match expected",
    expectedMatchEntityId: ceoStarted2020Uuid,
    inputData: {
      potentialMatches: [
        {
          entityId: ceoStarted2020Uuid,
          metadata: {
            entityTypeIds: [
              "https://hash.ai/@hash/types/entity-type/worked-at/v/1",
            ],
            provenance: { edition: { sources: [] } },
          },
          properties: {
            [systemPropertyTypes.appliesFrom.propertyTypeBaseUrl]: "2024-02-11",
            [systemPropertyTypes.role.propertyTypeBaseUrl]: "CEO",
          },
          propertiesMetadata: emptyMetadataObject,
        },
        {
          entityId: ceoStarted2022Uuid,
          metadata: {
            entityTypeIds: [
              "https://hash.ai/@hash/types/entity-type/worked-at/v/1",
            ],
            provenance: { edition: { sources: [] } },
          },
          properties: {
            [systemPropertyTypes.role.propertyTypeBaseUrl]: "CEO",
          },
          propertiesMetadata: emptyMetadataObject,
        },
      ],
      newEntity: {
        editionSources: [],
        entityTypeIds: [
          "https://hash.ai/@hash/types/entity-type/worked-at/v/1",
        ],
        properties: {
          [systemPropertyTypes.appliesFrom.propertyTypeBaseUrl]: "2024-02-11",
        },
        propertiesMetadata: {
          value: brandPropertyObject({
            [systemPropertyTypes.appliesFrom.propertyTypeBaseUrl]: {
              metadata: {
                dataTypeId: systemDataTypes.date.dataTypeId,
                provenance: {
                  sources: [],
                },
              } satisfies ValueMetadata,
            },
          }),
        },
      },
    },
  },
  {
    testName: "Match Worked At – No match expected",
    expectedMatchEntityId: null,
    inputData: {
      potentialMatches: [
        {
          entityId: ceoStarted2020Uuid,
          metadata: {
            entityTypeIds: [
              "https://hash.ai/@hash/types/entity-type/worked-at/v/1",
            ],
            provenance: { edition: { sources: [] } },
          },
          properties: {
            [systemPropertyTypes.role.propertyTypeBaseUrl]: "CIO",
          },
          propertiesMetadata: emptyMetadataObject,
        },
        {
          entityId: ceoStarted2022Uuid,
          metadata: {
            entityTypeIds: [
              "https://hash.ai/@hash/types/entity-type/worked-at/v/1",
            ],
            provenance: { edition: { sources: [] } },
          },
          properties: {
            [systemPropertyTypes.role.propertyTypeBaseUrl]: "CEO",
            [systemPropertyTypes.appliesFrom.propertyTypeBaseUrl]: "2022-04-22",
          },
          propertiesMetadata: emptyMetadataObject,
        },
      ],
      newEntity: {
        editionSources: [],
        entityTypeIds: [
          "https://hash.ai/@hash/types/entity-type/worked-at/v/1",
        ],
        properties: {
          [systemPropertyTypes.role.propertyTypeBaseUrl]: "CEO",
          [systemPropertyTypes.appliesFrom.propertyTypeBaseUrl]: "2024-02-11",
        },
        propertiesMetadata: {
          value: brandPropertyObject({
            [systemPropertyTypes.role.propertyTypeBaseUrl]: {
              metadata: {
                dataTypeId: blockProtocolDataTypes.text.dataTypeId,
                provenance: {
                  sources: [],
                },
              } satisfies ValueMetadata,
            },
            [systemPropertyTypes.appliesFrom.propertyTypeBaseUrl]: {
              metadata: {
                dataTypeId: systemDataTypes.date.dataTypeId,
                provenance: {
                  sources: [],
                },
              } satisfies ValueMetadata,
            },
          }),
        },
      },
    },
  },
];

const metrics: MetricDefinition[] = matchTestData.map(
  (testItem): MetricDefinition => {
    return {
      name: testItem.testName,
      description: "",
      executeMetric: async ({ testingParams }) => {
        const { inputData, expectedMatchEntityId } = testItem;

        const match = await matchExistingEntity({
          entities: inputData,
          isLink: false,
          previousError: null,
          testingParams,
        });

        const reportedMatchId = match?.existingEntity.entityId ?? null;

        const score = reportedMatchId === expectedMatchEntityId ? 1 : 0;

        let naturalLanguageReport = "";
        if (!score) {
          if (!expectedMatchEntityId) {
            naturalLanguageReport = `No match was expected, but a match with entityId ${reportedMatchId} found.`;
          } else if (reportedMatchId) {
            naturalLanguageReport = `Expected match with entityId ${expectedMatchEntityId} but LLM matched with entityId ${reportedMatchId}.`;
          } else {
            naturalLanguageReport = `Expected match with entityId ${expectedMatchEntityId} but no match found.`;
          }
        } else {
          naturalLanguageReport = `Correctly matched with entityId ${expectedMatchEntityId}.`;
        }

        const mergedProperties = match?.newValues.properties;
        const inputProperties = inputData.newEntity.properties;

        const propertiesWithMergedValues = typedEntries(
          mergedProperties ?? {},
        ).filter(([key, value]) => {
          return inputProperties[key] !== value;
        });

        const additionalInfo = {
          propertiesWithMergedValues: propertiesWithMergedValues.map(
            ([key, value]) => `${key}: ${stringifyPropertyValue(value)}`,
          ),
        };

        return {
          score,
          testingParams,
          naturalLanguageReport,
          additionalInfo,
        };
      },
    };
  },
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseDirectoryPath = path.join(
  __dirname,
  "/var/match-existing-entity-test",
);

test(
  "Match new entity with existing entity",
  async () => {
    const models: LlmParams["model"][] = [
      "claude-3-haiku-20240307",
      "claude-3-5-sonnet-20240620",
      "gpt-4o-mini-2024-07-18",
    ];

    await optimizeSystemPrompt({
      attemptsPerPrompt: 2,
      models,
      initialSystemPrompt: matchExistingEntitySystemPrompt,
      directoryPath: baseDirectoryPath,
      metrics,
      promptIterations: 2,
    });
  },
  {
    timeout: 30 * 60 * 1000,
  },
);
