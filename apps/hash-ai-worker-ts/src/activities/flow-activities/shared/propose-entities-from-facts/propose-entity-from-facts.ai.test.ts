import "../../../../shared/testing-utilities/mock-get-flow-context";

import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { expect, test } from "vitest";

import { getDereferencedEntityTypesActivity } from "../../../get-dereferenced-entity-types-activity";
import { getFlowContext } from "../../../shared/get-flow-context";
import { graphApiClient } from "../../../shared/graph-api-client";
import type { LocalEntitySummary } from "../infer-facts-from-text/get-entity-summaries-from-text";
import type { Fact } from "../infer-facts-from-text/types";
import { proposeEntityFromFacts } from "./propose-entity-from-facts";

const huntingPlcEntitySummary: LocalEntitySummary = {
  localId: "6916156b-e759-41ad-b1da-2cf7af05d223",
  name: "HUNTING PLC ORD 25P",
  summary:
    "HUNTING PLC, represented by the stock code HTG, has a market cap of 614.40 million GBX, a last recorded price of 452.50 GBX, and experienced a recent price change of 80.00 GBX, translating to a 21.48% increase.",
  entityTypeId:
    "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
};

const huntingPlcEntityFacts = [
  {
    text: "HUNTING PLC has a market cap of 614.40 million GBX",
    subjectEntityLocalId: "66f93842-c6e0-4378-ab04-519edd7231af",
    prepositionalPhrases: [],
  },
  {
    text: "HUNTING PLC has a price of 443.50 GBX",
    subjectEntityLocalId: "66f93842-c6e0-4378-ab04-519edd7231af",
    prepositionalPhrases: [],
  },
  {
    text: "HUNTING PLC has a change value of 71.00 GBX",
    subjectEntityLocalId: "66f93842-c6e0-4378-ab04-519edd7231af",
    prepositionalPhrases: [],
  },
  {
    text: "HUNTING PLC has a change percentage of 19.06%",
    subjectEntityLocalId: "66f93842-c6e0-4378-ab04-519edd7231af",
    prepositionalPhrases: [],
  },
];

test.skip(
  "Test proposeEntityFromFacts: HUNTING PLC ORD 25P",
  async () => {
    const { userAuthentication } = await getFlowContext();

    const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
      entityTypeIds: [
        "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
      ],
      actorId: userAuthentication.actorId,
      graphApiClient,
      simplifyPropertyKeys: true,
    });

    const { schema: dereferencedEntityType, simplifiedPropertyTypeMappings } =
      Object.values(dereferencedEntityTypes)[0]!;

    const huntingPlcEntityFactsWithSources = huntingPlcEntityFacts.map(
      (fact): Fact => ({
        ...fact,
        factId: generateUuid(),
        sources: [
          {
            type: "webpage",
            location: {
              uri: "https://www.londonstockexchange.com/indices/ftse-350/constituents/table",
            },
            loadedAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const proposeEntityFromFactsStatus = await proposeEntityFromFacts({
      entitySummary: huntingPlcEntitySummary,
      facts: huntingPlcEntityFactsWithSources,
      dereferencedEntityType,
      simplifiedPropertyTypeMappings: simplifiedPropertyTypeMappings!,
      proposeOutgoingLinkEntityTypes: [],
      possibleOutgoingLinkTargetEntitySummaries: [],
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ proposeEntityFromFactsStatus }, null, 2));

    expect(proposeEntityFromFactsStatus).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);

const graphicsCardEntitySummary: LocalEntitySummary = {
  localId: "d705527d-59ed-462c-92c4-507b92095c22",
  name: "NVIDIA GeForce RTX 2080 Ti",
  summary:
    "The GeForce RTX 2080 Ti is a PC GPU based on the TU102 graphics processor with 11GB of memory, 352-bit memory bus, and approximately 120 teraflops of performance.",
  entityTypeId: "https://hash.ai/@ftse/types/entity-type/graphics-card/v/1",
};

const factsAboutGraphicsCard: Fact[] = [
  {
    factId: "5294b951-fbe0-4b31-b287-130036c1f551",
    text: "NVIDIA GeForce RTX 2080 Ti provides 11GB of memory",
    subjectEntityLocalId: "d705527d-59ed-462c-92c4-507b92095c22",
    prepositionalPhrases: [],
    sources: [
      {
        type: "webpage",
        location: {
          uri: "https://www.run.ai/guides/gpu-deep-learning/best-gpu-for-deep-learning",
        },
        loadedAt: "2024-05-29T15:59:55.606Z",
      },
    ],
  },
  {
    factId: "e2ef33ee-d23e-4fba-aded-944067013515",
    text: "NVIDIA GeForce RTX 2080 Ti has a 352-bit memory bus",
    subjectEntityLocalId: "d705527d-59ed-462c-92c4-507b92095c22",
    prepositionalPhrases: [],
    sources: [
      {
        type: "webpage",
        location: {
          uri: "https://www.run.ai/guides/gpu-deep-learning/best-gpu-for-deep-learning",
        },
        loadedAt: "2024-05-29T15:59:55.606Z",
      },
    ],
  },
  {
    factId: "710c911e-7641-4f7a-908e-dd5d162399d5",
    text: "NVIDIA GeForce RTX 2080 Ti has a 6MB cache",
    subjectEntityLocalId: "d705527d-59ed-462c-92c4-507b92095c22",
    prepositionalPhrases: [],
    sources: [
      {
        type: "webpage",
        location: {
          uri: "https://www.run.ai/guides/gpu-deep-learning/best-gpu-for-deep-learning",
        },
        loadedAt: "2024-05-29T15:59:55.606Z",
      },
    ],
  },
  {
    factId: "b8547d6c-dbdc-4765-8e40-326c39b87e6c",
    text: "NVIDIA GeForce RTX 2080 Ti provides roughly 120 teraflops of performance",
    subjectEntityLocalId: "d705527d-59ed-462c-92c4-507b92095c22",
    prepositionalPhrases: [],
    sources: [
      {
        type: "webpage",
        location: {
          uri: "https://www.run.ai/guides/gpu-deep-learning/best-gpu-for-deep-learning",
        },
        loadedAt: "2024-05-29T15:59:55.606Z",
      },
    ],
  },
  {
    factId: "06e3ae80-e7c7-4762-877b-36241edf8b55",
    text: "NVIDIA GeForce RTX 2080 Ti is a PC GPU",
    subjectEntityLocalId: "d705527d-59ed-462c-92c4-507b92095c22",
    prepositionalPhrases: [],
    sources: [
      {
        type: "webpage",
        location: {
          uri: "https://www.run.ai/guides/gpu-deep-learning/best-gpu-for-deep-learning",
        },
        loadedAt: "2024-05-29T15:59:55.606Z",
      },
    ],
  },
  {
    factId: "e9fa4dba-a4d0-421d-b907-7b534fb0eae0",
    text: "NVIDIA GeForce RTX 2080 Ti is based on the TU102 graphics processor",
    subjectEntityLocalId: "d705527d-59ed-462c-92c4-507b92095c22",
    prepositionalPhrases: [],
    sources: [
      {
        type: "webpage",
        location: {
          uri: "https://www.run.ai/guides/gpu-deep-learning/best-gpu-for-deep-learning",
        },
        loadedAt: "2024-05-29T15:59:55.606Z",
      },
    ],
  },
];

test.skip(
  "Test proposeEntityFromFacts with graphics card entity",
  async () => {
    const { userAuthentication } = await getFlowContext();

    const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
      entityTypeIds: [
        "https://hash.ai/@ftse/types/entity-type/graphics-card/v/1",
      ],
      actorId: userAuthentication.actorId,
      graphApiClient,
      simplifyPropertyKeys: true,
    });

    const { schema: dereferencedEntityType, simplifiedPropertyTypeMappings } =
      Object.values(dereferencedEntityTypes)[0]!;

    const proposeEntityFromFactsStatus = await proposeEntityFromFacts({
      entitySummary: graphicsCardEntitySummary,
      facts: factsAboutGraphicsCard,
      dereferencedEntityType,
      simplifiedPropertyTypeMappings: simplifiedPropertyTypeMappings!,
      proposeOutgoingLinkEntityTypes: [],
      possibleOutgoingLinkTargetEntitySummaries: [],
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ proposeEntityFromFactsStatus }, null, 2));

    expect(proposeEntityFromFactsStatus).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);
