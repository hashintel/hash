import "../../../../shared/testing-utilities/mock-get-flow-context.js";

import type { EntityUuid } from "@local/hash-graph-types/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { entityIdFromComponents } from "@local/hash-subgraph";
import { expect, test } from "vitest";

import { getDereferencedEntityTypesActivity } from "../../../get-dereferenced-entity-types-activity.js";
import { getFlowContext } from "../../../shared/get-flow-context.js";
import { graphApiClient } from "../../../shared/graph-api-client.js";
import type { LocalEntitySummary } from "../infer-summaries-then-claims-from-text/get-entity-summaries-from-text.js";
import type { Claim } from "../infer-summaries-then-claims-from-text/types.js";
import { proposeEntitiesFromClaims } from "../propose-entities-from-claims.js";

/**
 * @file These are not 'tests' but rather ways of running specific agents,
 *       the results of which can be inspected in the logs saved to the file system under get-llm-response/logs/
 *
 * NOTE: these tests depend on having run `npx tsx apps/hash-api/src/seed-data/seed-flow-test-types.ts`
 */

const ownedById = generateUuid();

const generateEntityId = (entityUuid: string) =>
  entityIdFromComponents(ownedById as OwnedById, entityUuid as EntityUuid);

const ftse350EntitySummaries: LocalEntitySummary[] = [
  {
    localId: generateEntityId("91f82ccc-42b0-4dd1-8b53-56e07eb265b2"),
    name: "HUNTING PLC ORD 25P",
    summary:
      "HUNTING PLC ORD 25P is a constituent of the FTSE 350 stock market index with a market cap of 614.40 million GBX and saw a recent price change of 20.94%.",
    entityTypeId:
      "https://hash.ai/@hash/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: generateEntityId("e789a5b9-890b-4a7e-960a-7b18f6abaed1"),
    name: "KELLER GROUP PLC ORD 10P",
    summary:
      "KELLER GROUP PLC ORD 10P is listed in the FTSE 350, having a market capitalization of 829.01 million GBX and experiencing an 18.84% price change.",
    entityTypeId:
      "https://hash.ai/@hash/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: generateEntityId("afb8f86e-ebf6-4078-9991-23f0a70983e2"),
    name: "INTERNATIONAL DISTRIBUTIONS SERVICE ORD 1P",
    summary:
      "INTERNATIONAL DISTRIBUTIONS SERVICE ORD 1P, part of the FTSE 350, has a market cap of 2,600.81 million GBX and a recent price change of 16.95%.",
    entityTypeId:
      "https://hash.ai/@hash/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: generateEntityId("16b1ac59-5594-4ad5-8f95-cfc279ba4381"),
    name: "BRITVIC PLC ORD 20P",
    summary:
      "BRITVIC PLC ORD 20P, a FTSE 350 constituent, possesses a market cap of 2,288.97 million GBX with a price change of 10.08%.",
    entityTypeId:
      "https://hash.ai/@hash/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: generateEntityId("1e1df791-6764-4c9f-9f56-519ecd116806"),
    name: "EXPERIAN PLC ORD USD0.10",
    summary:
      "EXPERIAN PLC ORD USD0.10, listed in the FTSE 350, has a market capitalization of 31,860.88 million GBX and a 7.90% price change.",
    entityTypeId:
      "https://hash.ai/@hash/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: generateEntityId("64844a08-e7b6-4449-8dac-df0986840c52"),
    name: "IMPERIAL BRANDS PLC ORD 10P",
    summary:
      "IMPERIAL BRANDS PLC ORD 10P is a FTSE 350 stock with a market cap of 16,187.35 million GBX, experiencing a 5.30% price change.",
    entityTypeId:
      "https://hash.ai/@hash/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: generateEntityId("3b5eff7f-46a5-4c2b-b1f7-7b01fb957e68"),
    name: "SEGRO PLC ORD 10P",
    summary:
      "SEGRO PLC ORD 10P, a FTSE 350 listed company, has a market cap of 11,996.19 million GBX and a 5.09% change in price.",
    entityTypeId:
      "https://hash.ai/@hash/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: generateEntityId("c5cb0cff-487f-4805-b58f-84404e382c50"),
    name: "IP GROUP PLC ORD 2P",
    summary:
      "IP GROUP PLC ORD 2P, included in the FTSE 350, has a market capitalization of 522.51 million GBX and a 4.54% change in price.",
    entityTypeId:
      "https://hash.ai/@hash/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: generateEntityId("a271bdf9-9be2-49e3-b987-6616e32d571c"),
    name: "VODAFONE GROUP PLC ORD USD0.20 20/21",
    summary:
      "VODAFONE GROUP PLC ORD USD0.20 20/21 is part of the FTSE 350 with a market cap of 19,844.47 million GBX and a 4.01% price change.",
    entityTypeId:
      "https://hash.ai/@hash/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: generateEntityId("86737639-f13a-45dd-a312-1d7a4e7e1b1e"),
    name: "REDDE NORTHGATE PLC ORD 50P",
    summary:
      "REDDE NORTHGATE PLC ORD 50P, a constituent of the FTSE 350, has a market cap of 924.94 million GBX and a 3.92% change in price.",
    entityTypeId:
      "https://hash.ai/@hash/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: generateEntityId("c1008286-64e8-49de-b86d-0360630a81c7"),
    name: "FTSE 350",
    summary:
      "A stock market index comprised of 350 high-capitalisation companies listed on the London Stock Exchange.",
    entityTypeId:
      "https://hash.ai/@hash/types/entity-type/stock-market-index/v/1",
  },
];

const ftse350Claims = [
  {
    text: "HUNTING PLC ORD 25P has the code HTG",
    subjectEntityLocalId: generateEntityId(
      "91f82ccc-42b0-4dd1-8b53-56e07eb265b2",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "HUNTING PLC ORD 25P has the name HUNTING PLC ORD 25P",
    subjectEntityLocalId: generateEntityId(
      "91f82ccc-42b0-4dd1-8b53-56e07eb265b2",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "HUNTING PLC ORD 25P uses the currency GBX",
    subjectEntityLocalId: generateEntityId(
      "91f82ccc-42b0-4dd1-8b53-56e07eb265b2",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "HUNTING PLC ORD 25P has a market capitalization of 614.40 million",
    subjectEntityLocalId: generateEntityId(
      "91f82ccc-42b0-4dd1-8b53-56e07eb265b2",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "HUNTING PLC ORD 25P has a price of 450.50 GBX",
    subjectEntityLocalId: generateEntityId(
      "91f82ccc-42b0-4dd1-8b53-56e07eb265b2",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "HUNTING PLC ORD 25P has a change of 78.00 GBX",
    subjectEntityLocalId: generateEntityId(
      "91f82ccc-42b0-4dd1-8b53-56e07eb265b2",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "HUNTING PLC ORD 25P has a change percentage of 20.94%",
    subjectEntityLocalId: generateEntityId(
      "91f82ccc-42b0-4dd1-8b53-56e07eb265b2",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "HUNTING PLC ORD 25P appears in the index FTSE 350",
    subjectEntityLocalId: generateEntityId(
      "91f82ccc-42b0-4dd1-8b53-56e07eb265b2",
    ),
    objectEntityLocalId: generateEntityId(
      "c1008286-64e8-49de-b86d-0360630a81c7",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "KELLER GROUP PLC ORD 10P's currency is GBX",
    subjectEntityLocalId: generateEntityId(
      "e789a5b9-890b-4a7e-960a-7b18f6abaed1",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "KELLER GROUP PLC ORD 10P's market capitalization is 829.01 million",
    subjectEntityLocalId: generateEntityId(
      "e789a5b9-890b-4a7e-960a-7b18f6abaed1",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "KELLER GROUP PLC ORD 10P's price is 1,350.00",
    subjectEntityLocalId: generateEntityId(
      "e789a5b9-890b-4a7e-960a-7b18f6abaed1",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "KELLER GROUP PLC ORD 10P's change is 214.00",
    subjectEntityLocalId: generateEntityId(
      "e789a5b9-890b-4a7e-960a-7b18f6abaed1",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "KELLER GROUP PLC ORD 10P's change percentage is 18.84%",
    subjectEntityLocalId: generateEntityId(
      "e789a5b9-890b-4a7e-960a-7b18f6abaed1",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "INTERNATIONAL DISTRIBUTIONS SERVICE ORD 1P is listed on the GBX",
    subjectEntityLocalId: generateEntityId(
      "afb8f86e-ebf6-4078-9991-23f0a70983e2",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "INTERNATIONAL DISTRIBUTIONS SERVICE ORD 1P has a market capitalization of 2,600.81 million",
    subjectEntityLocalId: generateEntityId(
      "afb8f86e-ebf6-4078-9991-23f0a70983e2",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "INTERNATIONAL DISTRIBUTIONS SERVICE ORD 1P has a price of 317.40 GBX",
    subjectEntityLocalId: generateEntityId(
      "afb8f86e-ebf6-4078-9991-23f0a70983e2",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "INTERNATIONAL DISTRIBUTIONS SERVICE ORD 1P has an increase of 46 GBX",
    subjectEntityLocalId: generateEntityId(
      "afb8f86e-ebf6-4078-9991-23f0a70983e2",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "INTERNATIONAL DISTRIBUTIONS SERVICE ORD 1P has an increase of 16.95%",
    subjectEntityLocalId: generateEntityId(
      "afb8f86e-ebf6-4078-9991-23f0a70983e2",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "INTERNATIONAL DISTRIBUTIONS SERVICE ORD 1P appears in FTSE 350",
    subjectEntityLocalId: generateEntityId(
      "afb8f86e-ebf6-4078-9991-23f0a70983e2",
    ),
    objectEntityLocalId: generateEntityId(
      "c1008286-64e8-49de-b86d-0360630a81c7",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "BRITVIC PLC ORD 20P has a market capitalization of 2288.97 million GBP",
    subjectEntityLocalId: generateEntityId(
      "16b1ac59-5594-4ad5-8f95-cfc279ba4381",
    ),
    prepositionalPhrases: ["as of the last update"],
  },
  {
    text: "BRITVIC PLC ORD 20P has a price of 1010 GBX",
    subjectEntityLocalId: generateEntityId(
      "16b1ac59-5594-4ad5-8f95-cfc279ba4381",
    ),
    prepositionalPhrases: ["as of the last update"],
  },
  {
    text: "BRITVIC PLC ORD 20P has a change of 92.50 GBX",
    subjectEntityLocalId: generateEntityId(
      "16b1ac59-5594-4ad5-8f95-cfc279ba4381",
    ),
    prepositionalPhrases: ["as of the last update"],
  },
  {
    text: "BRITVIC PLC ORD 20P has a change percentage of 10.08%",
    subjectEntityLocalId: generateEntityId(
      "16b1ac59-5594-4ad5-8f95-cfc279ba4381",
    ),
    prepositionalPhrases: ["as of the last update"],
  },
  {
    text: "BRITVIC PLC ORD 20P appears in FTSE 350",
    subjectEntityLocalId: generateEntityId(
      "16b1ac59-5594-4ad5-8f95-cfc279ba4381",
    ),
    objectEntityLocalId: generateEntityId(
      "c1008286-64e8-49de-b86d-0360630a81c7",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "EXPERIAN PLC ORD USD0.10 has a market capitalization of 31,860.88 million GBX",
    subjectEntityLocalId: generateEntityId(
      "1e1df791-6764-4c9f-9f56-519ecd116806",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "EXPERIAN PLC ORD USD0.10 has a price of 3,744.00 GBX",
    subjectEntityLocalId: generateEntityId(
      "1e1df791-6764-4c9f-9f56-519ecd116806",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "EXPERIAN PLC ORD USD0.10 has a change of 274.00 GBX",
    subjectEntityLocalId: generateEntityId(
      "1e1df791-6764-4c9f-9f56-519ecd116806",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "EXPERIAN PLC ORD USD0.10 has a change percentage of 7.90%",
    subjectEntityLocalId: generateEntityId(
      "1e1df791-6764-4c9f-9f56-519ecd116806",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "IMPERIAL BRANDS PLC ORD 10P is denominated in GBX",
    subjectEntityLocalId: generateEntityId(
      "64844a08-e7b6-4449-8dac-df0986840c52",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "IMPERIAL BRANDS PLC ORD 10P has a market capitalization of 16187.35 million",
    subjectEntityLocalId: generateEntityId(
      "64844a08-e7b6-4449-8dac-df0986840c52",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "IMPERIAL BRANDS PLC ORD 10P has a price of 1978.00 GBX",
    subjectEntityLocalId: generateEntityId(
      "64844a08-e7b6-4449-8dac-df0986840c52",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "IMPERIAL BRANDS PLC ORD 10P has a change of 99.50 GBX",
    subjectEntityLocalId: generateEntityId(
      "64844a08-e7b6-4449-8dac-df0986840c52",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "IMPERIAL BRANDS PLC ORD 10P has a change percentage of 5.30%",
    subjectEntityLocalId: generateEntityId(
      "64844a08-e7b6-4449-8dac-df0986840c52",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "SEGRO PLC ORD 10P has the code SGRO",
    subjectEntityLocalId: generateEntityId(
      "3b5eff7f-46a5-4c2b-b1f7-7b01fb957e68",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "SEGRO PLC ORD 10P has the currency GBX",
    subjectEntityLocalId: generateEntityId(
      "3b5eff7f-46a5-4c2b-b1f7-7b01fb957e68",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "SEGRO PLC ORD 10P has a market capitalization of 11996.19 million",
    subjectEntityLocalId: generateEntityId(
      "3b5eff7f-46a5-4c2b-b1f7-7b01fb957e68",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "SEGRO PLC ORD 10P has a price of 933.00 GBX",
    subjectEntityLocalId: generateEntityId(
      "3b5eff7f-46a5-4c2b-b1f7-7b01fb957e68",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "SEGRO PLC ORD 10P has a change of 45.20",
    subjectEntityLocalId: generateEntityId(
      "3b5eff7f-46a5-4c2b-b1f7-7b01fb957e68",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "SEGRO PLC ORD 10P has a change percentage of 5.09%",
    subjectEntityLocalId: generateEntityId(
      "3b5eff7f-46a5-4c2b-b1f7-7b01fb957e68",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "SEGRO PLC ORD 10P appears in the index FTSE 350",
    subjectEntityLocalId: generateEntityId(
      "3b5eff7f-46a5-4c2b-b1f7-7b01fb957e68",
    ),
    objectEntityLocalId: generateEntityId(
      "c1008286-64e8-49de-b86d-0360630a81c7",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "IP GROUP PLC ORD 2P has a market cap of 522.51 million GBP",
    subjectEntityLocalId: generateEntityId(
      "c5cb0cff-487f-4805-b58f-84404e382c50",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "IP GROUP PLC ORD 2P has a price of 53.00 GBX",
    subjectEntityLocalId: generateEntityId(
      "c5cb0cff-487f-4805-b58f-84404e382c50",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "IP GROUP PLC ORD 2P has a change of 2.30 GBX",
    subjectEntityLocalId: generateEntityId(
      "c5cb0cff-487f-4805-b58f-84404e382c50",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "IP GROUP PLC ORD 2P has a change percentage of 4.54%",
    subjectEntityLocalId: generateEntityId(
      "c5cb0cff-487f-4805-b58f-84404e382c50",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "IP GROUP PLC ORD 2P appears in FTSE 350",
    subjectEntityLocalId: generateEntityId(
      "c5cb0cff-487f-4805-b58f-84404e382c50",
    ),
    objectEntityLocalId: generateEntityId(
      "c1008286-64e8-49de-b86d-0360630a81c7",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "VODAFONE GROUP PLC ORD USD0.20 20/21 has a market capitalization of 19844.47 million",
    subjectEntityLocalId: generateEntityId(
      "a271bdf9-9be2-49e3-b987-6616e32d571c",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "VODAFONE GROUP PLC ORD USD0.20 20/21 is denominated in GBX",
    subjectEntityLocalId: generateEntityId(
      "a271bdf9-9be2-49e3-b987-6616e32d571c",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "VODAFONE GROUP PLC ORD USD0.20 20/21 has a price of 76.22 GBX",
    subjectEntityLocalId: generateEntityId(
      "a271bdf9-9be2-49e3-b987-6616e32d571c",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "VODAFONE GROUP PLC ORD USD0.20 20/21 appears in index FTSE 350",
    subjectEntityLocalId: generateEntityId(
      "a271bdf9-9be2-49e3-b987-6616e32d571c",
    ),
    objectEntityLocalId: generateEntityId(
      "c1008286-64e8-49de-b86d-0360630a81c7",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "REDDE NORTHGATE PLC ORD 50P has a currency of GBX",
    subjectEntityLocalId: generateEntityId(
      "86737639-f13a-45dd-a312-1d7a4e7e1b1e",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "REDDE NORTHGATE PLC ORD 50P has a market capitalization of 924.94 million",
    subjectEntityLocalId: generateEntityId(
      "86737639-f13a-45dd-a312-1d7a4e7e1b1e",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "REDDE NORTHGATE PLC ORD 50P has a price of 424.00 GBX",
    subjectEntityLocalId: generateEntityId(
      "86737639-f13a-45dd-a312-1d7a4e7e1b1e",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "REDDE NORTHGATE PLC ORD 50P had a change of 16.00 GBX",
    subjectEntityLocalId: generateEntityId(
      "86737639-f13a-45dd-a312-1d7a4e7e1b1e",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "REDDE NORTHGATE PLC ORD 50P had a change percentage of 3.92%",
    subjectEntityLocalId: generateEntityId(
      "86737639-f13a-45dd-a312-1d7a4e7e1b1e",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "REDDE NORTHGATE PLC ORD 50P appears in index FTSE 350",
    subjectEntityLocalId: generateEntityId(
      "86737639-f13a-45dd-a312-1d7a4e7e1b1e",
    ),
    objectEntityLocalId: generateEntityId(
      "c1008286-64e8-49de-b86d-0360630a81c7",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "FTSE 350 has constituents",
    subjectEntityLocalId: generateEntityId(
      "c1008286-64e8-49de-b86d-0360630a81c7",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "FTSE 350 constituents are reviewed every quarter",
    subjectEntityLocalId: generateEntityId(
      "c1008286-64e8-49de-b86d-0360630a81c7",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "FTSE 350 review months include March",
    subjectEntityLocalId: generateEntityId(
      "c1008286-64e8-49de-b86d-0360630a81c7",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "FTSE 350 review months include June",
    subjectEntityLocalId: generateEntityId(
      "c1008286-64e8-49de-b86d-0360630a81c7",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "FTSE 350 review months include September",
    subjectEntityLocalId: generateEntityId(
      "c1008286-64e8-49de-b86d-0360630a81c7",
    ),
    prepositionalPhrases: [],
  },
  {
    text: "FTSE 350 review months include December",
    subjectEntityLocalId: generateEntityId(
      "c1008286-64e8-49de-b86d-0360630a81c7",
    ),
    prepositionalPhrases: [],
  },
];

test(
  "Test proposeEntitiesFromClaims",
  async () => {
    const { userAuthentication } = await getFlowContext();

    const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
      entityTypeIds: [
        "https://hash.ai/@hash/types/entity-type/stock-market-constituent/v/1",
        "https://hash.ai/@hash/types/entity-type/stock-market-index/v/1",
        "https://hash.ai/@hash/types/entity-type/appears-in-index/v/1",
      ],
      actorId: userAuthentication.actorId,
      graphApiClient,
      simplifyPropertyKeys: true,
    });

    const claims = ftse350Claims.map(
      (claim): Claim => ({
        ...claim,
        claimId: entityIdFromComponents(
          userAuthentication.actorId as OwnedById,
          generateUuid() as EntityUuid,
        ),
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

    const { proposedEntities } = await proposeEntitiesFromClaims({
      entitySummaries: ftse350EntitySummaries,
      existingEntitySummaries: [],
      claims,
      dereferencedEntityTypes,
      potentialLinkTargetEntitySummaries: [],
      workerIdentifiers: {
        workerInstanceId: generateUuid(),
        parentInstanceId: null,
        workerType: "Coordinator",
      },
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ proposedEntities }, null, 2));

    expect(proposedEntities).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);
