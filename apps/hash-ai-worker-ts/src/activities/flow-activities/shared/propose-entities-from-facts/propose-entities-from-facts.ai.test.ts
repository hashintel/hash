import "../../../../shared/testing-utilities/mock-get-flow-context";

import { expect, test } from "vitest";

import { getDereferencedEntityTypesActivity } from "../../../get-dereferenced-entity-types-activity";
import { getFlowContext } from "../../../shared/get-flow-context";
import { graphApiClient } from "../../../shared/graph-api-client";
import type { EntitySummary } from "../infer-facts-from-text/get-entity-summaries-from-text";
import { proposeEntitiesFromFacts } from "../propose-entities-from-facts";

const ftse350EntitySummaries: EntitySummary[] = [
  {
    localId: "9940c4b8-1bce-4d51-9254-fc4da0ed5f0e",
    name: "HUNTING PLC ORD 25P",
    summary:
      "A stock market constituent with a code HTG, currency in GBX, market capitalization of 614.40 million, current price of 451.50, and a change of 21.21%.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: "212c272d-1538-4c9a-bb81-f9b3491695f1",
    name: "KELLER GROUP PLC ORD 10P",
    summary:
      "A stock market constituent with a code KLR, currency in GBX, market capitalization of 829.01 million, current price of 1,356.00, and a change of 19.37%.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: "ef76c7b4-fa38-46c3-ae6d-6fe9526a803e",
    name: "INTERNATIONAL DISTRIBUTIONS SERVICE ORD 1P",
    summary:
      "A stock market constituent with a code IDS, currency in GBX, market capitalization of 2,600.81 million, current price of 321.20, and a change of 18.35%.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: "478f25e8-d4c2-4ad7-81f0-bf0f15e81fe5",
    name: "BRITVIC PLC ORD 20P",
    summary:
      "A stock market constituent with a code BVIC, currency in GBX, market capitalization of 2,288.97 million, current price of 1,000.00, and a change of 8.99%.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: "970e65ef-34dd-4b43-b791-9f5d5e25e282",
    name: "EXPERIAN PLC ORD USD0.10",
    summary:
      "A stock market constituent with a code EXPN, currency in GBX, market capitalization of 31,860.88 million, current price of 3,732.00, and a change of 7.55%.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: "6866e6b5-2292-4eed-9e09-dfb45678e2be",
    name: "IMPERIAL BRANDS PLC ORD 10P",
    summary:
      "A stock market constituent with a code IMB, currency in GBX, market capitalization of 16,187.35 million, current price of 1,983.50, and a change of 5.59%.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: "07d1f8a7-7857-4f13-be71-99f3cb3fa273",
    name: "SEGRO PLC ORD 10P",
    summary:
      "A stock market constituent with a code SGRO, currency in GBX, market capitalization of 11,996.19 million, current price of 929.00, and a change of 4.64%.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: "2db9d615-2835-4387-ba8d-0c04281a4468",
    name: "IP GROUP PLC ORD 2P",
    summary:
      "A stock market constituent with a code IPO, currency in GBX, market capitalization of 522.51 million, current price of 53.00, and a change of 4.54%.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: "f12a2ab5-06fd-40f2-aa1b-d3bb6e93bd52",
    name: "BIG YELLOW GROUP PLC ORD 10P",
    summary:
      "A stock market constituent with a code BYG, currency in GBX, market capitalization of 2,221.56 million, current price of 1,180.00, and a change of 4.24%.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: "f4736db9-a73e-487a-bc85-c2b945ac8100",
    name: "FLUTTER ENTERTAINMENT PLC ORD EUR0.09 (DI)",
    summary:
      "A stock market constituent with a code FLTR, currency in GBX, market capitalization of 28,185.47 million, current price of 16,545.00, and a change of 4.22%.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
  },
];

const ftse350Facts = [
  {
    text: "HUNTING PLC ORD 25P trades under the code HTG",
    subjectEntityLocalId: "9940c4b8-1bce-4d51-9254-fc4da0ed5f0e",
    prepositionalPhrases: [],
  },
  {
    text: "HUNTING PLC ORD 25P trades in the currency GBX",
    subjectEntityLocalId: "9940c4b8-1bce-4d51-9254-fc4da0ed5f0e",
    prepositionalPhrases: [],
  },
  {
    text: "HUNTING PLC ORD 25P has a market capitalization of 614.40 million",
    subjectEntityLocalId: "9940c4b8-1bce-4d51-9254-fc4da0ed5f0e",
    prepositionalPhrases: [],
  },
  {
    text: "HUNTING PLC ORD 25P has a price of 451.50 GBX",
    subjectEntityLocalId: "9940c4b8-1bce-4d51-9254-fc4da0ed5f0e",
    prepositionalPhrases: [],
  },
  {
    text: "HUNTING PLC ORD 25P has changed by 79.00 GBX",
    subjectEntityLocalId: "9940c4b8-1bce-4d51-9254-fc4da0ed5f0e",
    prepositionalPhrases: [],
  },
  {
    text: "HUNTING PLC ORD 25P has a change percentage of 21.21%",
    subjectEntityLocalId: "9940c4b8-1bce-4d51-9254-fc4da0ed5f0e",
    prepositionalPhrases: [],
  },
  {
    text: "KELLER GROUP PLC ORD 10P has the stock code KLR",
    subjectEntityLocalId: "212c272d-1538-4c9a-bb81-f9b3491695f1",
    prepositionalPhrases: [],
  },
  {
    text: "KELLER GROUP PLC ORD 10P is denominated in GBX",
    subjectEntityLocalId: "212c272d-1538-4c9a-bb81-f9b3491695f1",
    prepositionalPhrases: [],
  },
  {
    text: "KELLER GROUP PLC ORD 10P has a market capitalization of 829.01 million GBP",
    subjectEntityLocalId: "212c272d-1538-4c9a-bb81-f9b3491695f1",
    prepositionalPhrases: [],
  },
  {
    text: "KELLER GROUP PLC ORD 10P has a price of 1,356.00 GBX",
    subjectEntityLocalId: "212c272d-1538-4c9a-bb81-f9b3491695f1",
    prepositionalPhrases: [],
  },
  {
    text: "KELLER GROUP PLC ORD 10P has a price change of 220.00 GBX",
    subjectEntityLocalId: "212c272d-1538-4c9a-bb81-f9b3491695f1",
    prepositionalPhrases: [],
  },
  {
    text: "KELLER GROUP PLC ORD 10P has a change percentage of 19.37%",
    subjectEntityLocalId: "212c272d-1538-4c9a-bb81-f9b3491695f1",
    prepositionalPhrases: [],
  },
  {
    text: "INTERNATIONAL DISTRIBUTIONS SERVICE ORD 1P has a currency of GBX",
    subjectEntityLocalId: "ef76c7b4-fa38-46c3-ae6d-6fe9526a803e",
    prepositionalPhrases: [],
  },
  {
    text: "INTERNATIONAL DISTRIBUTIONS SERVICE ORD 1P has a market capitalization of 2,600.81 million",
    subjectEntityLocalId: "ef76c7b4-fa38-46c3-ae6d-6fe9526a803e",
    prepositionalPhrases: [],
  },
  {
    text: "INTERNATIONAL DISTRIBUTIONS SERVICE ORD 1P has a price of 321.20 GBX",
    subjectEntityLocalId: "ef76c7b4-fa38-46c3-ae6d-6fe9526a803e",
    prepositionalPhrases: [],
  },
  {
    text: "INTERNATIONAL DISTRIBUTIONS SERVICE ORD 1P has a change of 49.80 GBX",
    subjectEntityLocalId: "ef76c7b4-fa38-46c3-ae6d-6fe9526a803e",
    prepositionalPhrases: [],
  },
  {
    text: "INTERNATIONAL DISTRIBUTIONS SERVICE ORD 1P has a change percentage of 18.35%",
    subjectEntityLocalId: "ef76c7b4-fa38-46c3-ae6d-6fe9526a803e",
    prepositionalPhrases: [],
  },
  {
    text: "BRITVIC PLC ORD 20P has a currency of GBX",
    subjectEntityLocalId: "478f25e8-d4c2-4ad7-81f0-bf0f15e81fe5",
    prepositionalPhrases: [],
  },
  {
    text: "BRITVIC PLC ORD 20P has a market capitalization of 2,288.97 million GBP",
    subjectEntityLocalId: "478f25e8-d4c2-4ad7-81f0-bf0f15e81fe5",
    prepositionalPhrases: [],
  },
  {
    text: "BRITVIC PLC ORD 20P has a price of 1,000.00 GBX",
    subjectEntityLocalId: "478f25e8-d4c2-4ad7-81f0-bf0f15e81fe5",
    prepositionalPhrases: [],
  },
  {
    text: "BRITVIC PLC ORD 20P has a change of 82.50 GBX",
    subjectEntityLocalId: "478f25e8-d4c2-4ad7-81f0-bf0f15e81fe5",
    prepositionalPhrases: [],
  },
  {
    text: "BRITVIC PLC ORD 20P has a change percentage of 8.99%",
    subjectEntityLocalId: "478f25e8-d4c2-4ad7-81f0-bf0f15e81fe5",
    prepositionalPhrases: [],
  },
  {
    text: "EXPERIAN PLC ORD USD0.10 is denominated in GBX",
    subjectEntityLocalId: "970e65ef-34dd-4b43-b791-9f5d5e25e282",
    prepositionalPhrases: [],
  },
  {
    text: "EXPERIAN PLC ORD USD0.10 has a market capitalization of 31,860.88 millions",
    subjectEntityLocalId: "970e65ef-34dd-4b43-b791-9f5d5e25e282",
    prepositionalPhrases: [],
  },
  {
    text: "EXPERIAN PLC ORD USD0.10 has a price of 3,732.00 GBX",
    subjectEntityLocalId: "970e65ef-34dd-4b43-b791-9f5d5e25e282",
    prepositionalPhrases: [],
  },
  {
    text: "EXPERIAN PLC ORD USD0.10 has a change of 262.00 GBX",
    subjectEntityLocalId: "970e65ef-34dd-4b43-b791-9f5d5e25e282",
    prepositionalPhrases: [],
  },
  {
    text: "EXPERIAN PLC ORD USD0.10 has a change percentage of 7.55%",
    subjectEntityLocalId: "970e65ef-34dd-4b43-b791-9f5d5e25e282",
    prepositionalPhrases: [],
  },
  {
    text: "IMPERIAL BRANDS PLC ORD 10P has a currency of GBX",
    subjectEntityLocalId: "6866e6b5-2292-4eed-9e09-dfb45678e2be",
    prepositionalPhrases: [],
  },
  {
    text: "IMPERIAL BRANDS PLC ORD 10P has a market capitalization of 16,187.35 million GBX",
    subjectEntityLocalId: "6866e6b5-2292-4eed-9e09-dfb45678e2be",
    prepositionalPhrases: [],
  },
  {
    text: "IMPERIAL BRANDS PLC ORD 10P has a price of 1983.50 GBX",
    subjectEntityLocalId: "6866e6b5-2292-4eed-9e09-dfb45678e2be",
    prepositionalPhrases: [],
  },
  {
    text: "IMPERIAL BRANDS PLC ORD 10P has a change of 105.00 GBX",
    subjectEntityLocalId: "6866e6b5-2292-4eed-9e09-dfb45678e2be",
    prepositionalPhrases: [],
  },
  {
    text: "IMPERIAL BRANDS PLC ORD 10P has a change percentage of 5.59%",
    subjectEntityLocalId: "6866e6b5-2292-4eed-9e09-dfb45678e2be",
    prepositionalPhrases: [],
  },
  {
    text: "SEGRO PLC ORD 10P trades under the ticker SGRO",
    subjectEntityLocalId: "07d1f8a7-7857-4f13-be71-99f3cb3fa273",
    prepositionalPhrases: [],
  },
  {
    text: "SEGRO PLC ORD 10P uses GBX as its trading currency",
    subjectEntityLocalId: "07d1f8a7-7857-4f13-be71-99f3cb3fa273",
    prepositionalPhrases: [],
  },
  {
    text: "SEGRO PLC ORD 10P has a market capitalization of 11,996.19 million",
    subjectEntityLocalId: "07d1f8a7-7857-4f13-be71-99f3cb3fa273",
    prepositionalPhrases: [],
  },
  {
    text: "SEGRO PLC ORD 10P has a stock price of 929.00 GBX",
    subjectEntityLocalId: "07d1f8a7-7857-4f13-be71-99f3cb3fa273",
    prepositionalPhrases: [],
  },
  {
    text: "SEGRO PLC ORD 10P experienced a change of 41.20 GBX",
    subjectEntityLocalId: "07d1f8a7-7857-4f13-be71-99f3cb3fa273",
    prepositionalPhrases: [],
  },
  {
    text: "SEGRO PLC ORD 10P had a change percentage of 4.64%",
    subjectEntityLocalId: "07d1f8a7-7857-4f13-be71-99f3cb3fa273",
    prepositionalPhrases: [],
  },
  {
    text: "IP GROUP PLC ORD 2P has a currency of GBX",
    subjectEntityLocalId: "2db9d615-2835-4387-ba8d-0c04281a4468",
    prepositionalPhrases: [],
  },
  {
    text: "IP GROUP PLC ORD 2P has a market capitalization of 522.51 million",
    subjectEntityLocalId: "2db9d615-2835-4387-ba8d-0c04281a4468",
    prepositionalPhrases: [],
  },
  {
    text: "IP GROUP PLC ORD 2P has a price of 53.00 GBX",
    subjectEntityLocalId: "2db9d615-2835-4387-ba8d-0c04281a4468",
    prepositionalPhrases: [],
  },
  {
    text: "IP GROUP PLC ORD 2P has a change of 2.30 GBX",
    subjectEntityLocalId: "2db9d615-2835-4387-ba8d-0c04281a4468",
    prepositionalPhrases: [],
  },
  {
    text: "IP GROUP PLC ORD 2P has a change percentage of 4.54%",
    subjectEntityLocalId: "2db9d615-2835-4387-ba8d-0c04281a4468",
    prepositionalPhrases: [],
  },
  {
    text: "BIG YELLOW GROUP PLC ORD 10P has a market capitalization of 2221.56 million GBX",
    subjectEntityLocalId: "f12a2ab5-06fd-40f2-aa1b-d3bb6e93bd52",
    prepositionalPhrases: [],
  },
  {
    text: "BIG YELLOW GROUP PLC ORD 10P has a price of 1180.00 GBX",
    subjectEntityLocalId: "f12a2ab5-06fd-40f2-aa1b-d3bb6e93bd52",
    prepositionalPhrases: [],
  },
  {
    text: "BIG YELLOW GROUP PLC ORD 10P has a change of 48.00 GBX",
    subjectEntityLocalId: "f12a2ab5-06fd-40f2-aa1b-d3bb6e93bd52",
    prepositionalPhrases: [],
  },
  {
    text: "BIG YELLOW GROUP PLC ORD 10P has a change percentage of 4.24%",
    subjectEntityLocalId: "f12a2ab5-06fd-40f2-aa1b-d3bb6e93bd52",
    prepositionalPhrases: [],
  },
  {
    text: "FLUTTER ENTERTAINMENT PLC ORD EUR0.09 (DI) has a market capitalization of 28185.47 million GBX",
    subjectEntityLocalId: "f4736db9-a73e-487a-bc85-c2b945ac8100",
    prepositionalPhrases: [],
  },
  {
    text: "FLUTTER ENTERTAINMENT PLC ORD EUR0.09 (DI) has a price of 16545.00 GBX",
    subjectEntityLocalId: "f4736db9-a73e-487a-bc85-c2b945ac8100",
    prepositionalPhrases: [],
  },
  {
    text: "FLUTTER ENTERTAINMENT PLC ORD EUR0.09 (DI) has a change of 670.00 GBX",
    subjectEntityLocalId: "f4736db9-a73e-487a-bc85-c2b945ac8100",
    prepositionalPhrases: [],
  },
  {
    text: "FLUTTER ENTERTAINMENT PLC ORD EUR0.09 (DI) has a change percentage of 4.22%",
    subjectEntityLocalId: "f4736db9-a73e-487a-bc85-c2b945ac8100",
    prepositionalPhrases: [],
  },
];

test(
  "Test proposeEntitiesFromFacts",
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

    const { proposedEntities } = await proposeEntitiesFromFacts({
      entitySummaries: ftse350EntitySummaries,
      facts: ftse350Facts,
      dereferencedEntityTypes,
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ proposedEntities }, null, 2));

    expect(proposedEntities).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);
