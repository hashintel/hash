import path from "node:path";
import { fileURLToPath } from "node:url";

import { typedEntries } from "@local/advanced-types/typed-entries";
import type {
  EntityId,
  EntityUuid,
  PropertyMetadataObject,
} from "@local/hash-graph-types/entity";
import { brandPropertyObject } from "@local/hash-graph-types/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import type { PersonProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { entityIdFromComponents } from "@local/hash-subgraph";
import { test } from "vitest";

import type { LlmParams } from "./get-llm-response/types.js";
import type { MatchExistingEntityParams } from "./match-existing-entity.js";
import { matchExistingEntitySystemPrompt } from "./match-existing-entity.js";
import { matchExistingEntity } from "./match-existing-entity.js";
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

const matchTestData: MatchExistingEntityTest[] = [
  {
    testName: "Match Person – Match expected",
    expectedMatchEntityId: billGatesUuid,
    inputData: {
      potentialMatches: [
        {
          entityId: billGatesUuid,
          propertyMetadata: emptyMetadataObject,
          properties: brandPropertyObject<PersonProperties>({
            "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
              "Bill Gates",
            "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
              "An American businessman and philanthropist best known for co-founding the software company Microsoft Corporation.",
          }),
        },
        {
          entityId: popGatesUuid,
          propertyMetadata: emptyMetadataObject,
          properties: brandPropertyObject<PersonProperties>({
            "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
              "William Gates",
            "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
              "A professional basketball player, he was the first African American player signed to the National Basketball League.",
          }),
        },
        {
          entityId: williamGatesBasketballUuid,
          propertyMetadata: emptyMetadataObject,
          properties: brandPropertyObject<PersonProperties>({
            "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
              "William Gates",
            "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
              "An American former college basketball player, subject of the 1994 documentary film Hoop Dreams.",
          }),
        },
      ],
      newEntity: {
        propertyMetadata: emptyMetadataObject,
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
          propertyMetadata: emptyMetadataObject,
          properties: brandPropertyObject<PersonProperties>({
            "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
              "William Gates",
            "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
              "He founded Microsoft in Albuquerque, New Mexico.",
          }),
        },
        {
          entityId: billGatesUuid,
          propertyMetadata: emptyMetadataObject,
          properties: brandPropertyObject<PersonProperties>({
            "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
              "Bill Gates",
            "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
              "An American businessman and philanthropist best known for co-founding the software company Microsoft Corporation.",
          }),
        },
        {
          entityId: popGatesUuid,
          propertyMetadata: emptyMetadataObject,
          properties: brandPropertyObject<PersonProperties>({
            "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
              "William Gates",
            "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
              "A professional basketball player, he was the first African American player signed to the National Basketball League.",
          }),
        },
      ],
      newEntity: {
        propertyMetadata: emptyMetadataObject,
        properties: brandPropertyObject<PersonProperties>({
          "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
            "William Gates",
          "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
            "An American former college basketball player, subject of the 1994 documentary film Hoop Dreams.",
        }),
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

        const { matchWithMergedChangedProperties } = await matchExistingEntity(
          inputData,
          undefined,
          testingParams,
        );

        const reportedMatchId =
          matchWithMergedChangedProperties?.entityId ?? null;

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

        const mergedProperties = matchWithMergedChangedProperties?.properties;
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
      attemptsPerPrompt: 3,
      models,
      initialSystemPrompt: matchExistingEntitySystemPrompt,
      directoryPath: baseDirectoryPath,
      metrics,
      promptIterations: 3,
    });
  },
  {
    timeout: 30 * 60 * 1000,
  },
);
