import "../../../shared/testing-utilities/mock-get-flow-context";

import { expect, test } from "vitest";

import type { LocalEntitySummary } from "../shared/infer-facts-from-text/get-entity-summaries-from-text";
import { deduplicateEntities } from "./deduplicate-entities";

const ftse350EntitySummaries: LocalEntitySummary[] = [
  {
    localId: "6916156b-e759-41ad-b1da-2cf7af05d223",
    name: "HUNTING PLC ORD 25P",
    summary:
      "HUNTING PLC, represented by the stock code HTG, has a market cap of 614.40 million GBX, a last recorded price of 452.50 GBX, and experienced a recent price change of 80.00 GBX, translating to a 21.48% increase.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: "ef7fa92d-343a-430a-9c2b-34f8aed573d1",
    name: "KELLER GROUP PLC ORD 10P",
    summary:
      "KELLER GROUP PLC, symbolized by KLR, with a market capitalization of 829.01 million GBX, a last price of 1,330.00 GBX, and a recent price jump of 194.00 GBX, which is a 17.08% increase.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: "6bb3c550-82c1-4d5f-89e9-e6723a414619",
    name: "BRITVIC PLC ORD 20P",
    summary:
      "BRITVIC PLC, trading under the code BVIC, has a market capitalization of 2,288.97 million GBX, with its last price at 1,021.00 GBX, and a recent price increase of 103.50 GBX, amounting to an 11.28% rise.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: "4dd0da92-40a3-40fc-84db-c75aecdd0c2d",
    name: "EXPERIAN PLC ORD USD0.10",
    summary:
      "EXPERIAN PLC, designated by the code EXPN, with a market cap of 31,860.88 million GBX, a closing price of 3,697.00 GBX, and a recent gain of 227.00 GBX, equivalent to a 6.54% uplift.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: "a8304ece-a8cc-4373-aa2c-6ea5b00dca2b",
    name: "VODAFONE GROUP PLC ORD USD0.20 20/21",
    summary:
      "VODAFONE GROUP PLC, identified by the ticker VOD, has a market capitalization of 19,844.47 million GBX, a last recorded price of 76.72 GBX, and a recent change of 3.44 GBX, marking a 4.69% increase.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: "426fa3ef-5e9b-403e-a592-a20ec0979cdc",
    name: "IMPERIAL BRANDS PLC ORD 10P",
    summary:
      "IMPERIAL BRANDS PLC, under the symbol IMB, with a market cap of 16,187.35 million GBX, a last price of 1,966.00 GBX, and a recent change of 87.50 GBX, results in a 4.66% increase.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: "85ce6362-bafa-4b08-9c19-5e2c5df020f2",
    name: "CMC MARKETS PLC ORD 25P",
    summary:
      "CMC MARKETS PLC, represented by CMCX, has a market capitalization of 726.12 million GBX, recorded its last price at 271.00 GBX, and saw a recent price increase of 11.50 GBX, or 4.43%.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: "73faf1ef-f64c-4308-be86-8f119db77cca",
    name: "SPIRAX-SARCO ENGINEERING PLC ORD 26 12/13P",
    summary:
      "SPIRAX-SARCO ENGINEERING PLC, with the ticker SPX, boasts a market capitalization of 6,831.66 million GBX, a last price of 9,615.00 GBX, and sustained a recent increase of 355.00 GBX, amounting to a 3.83% rise.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: "01c487e6-5a26-47fd-90ae-da25136b3039",
    name: "REDDE NORTHGATE PLC ORD 50P",
    summary:
      "REDDE NORTHGATE PLC, trading with the code REDD, has a market capitalization of 924.94 million GBX, a last price of 420.50 GBX, and observed a recent price rise of 12.50 GBX, which is a 3.06% increase.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
  },
  {
    localId: "55f19188-c6ff-4eea-902b-a94b9952d917",
    name: "CENTRICA PLC ORD 6 14/81P",
    summary:
      "CENTRICA PLC, identified by the ticker CNA, with a market cap of 7,410.30 million GBX, having a last recorded price of 143.40 GBX, and a recent change of 4.00 GBX, reflecting a 2.87% increase.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
  },
];

const duplicateEntitySummaries: LocalEntitySummary[] = [
  {
    localId: "2d858320-e712-4d97-8f76-86c5c93d1dc9",
    name: "Experian",
    summary:
      "Experian is a global information services company, providing data and analytical tools to clients around the world.",
    entityTypeId: "https://hash.ai/@ftse/types/entity-type/company/v/1",
  },

  {
    localId: "ecbee8ca-48f6-475c-a2ea-17bfe5b7589b",
    name: "Imperial Brands Plc",
    summary: "",
    entityTypeId: "https://hash.ai/@ftse/types/entity-type/company/v/1",
  },
];

const nonDuplicateEntitySummaries: LocalEntitySummary[] = [
  {
    localId: "4d1b76ae-02f0-4157-b0d4-be47d12670ed",
    name: "Apple",
    summary: "Apple Inc. is an American multinational technology company.",
    entityTypeId: "https://hash.ai/@ftse/types/entity-type/company/v/1",
  },
];

test.skip(
  "Test deduplicate entities with FTSE350 companies",
  async () => {
    const { duplicates } = await deduplicateEntities({
      entities: [
        ...ftse350EntitySummaries,
        ...duplicateEntitySummaries,
        ...nonDuplicateEntitySummaries,
      ],
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ duplicates }, null, 2));

    for (const duplicateEntitySummary of duplicateEntitySummaries) {
      expect(
        duplicates.find(
          (duplicate) =>
            duplicate.duplicateIds.includes(duplicateEntitySummary.localId) ||
            (duplicate.canonicalId === duplicateEntitySummary.localId &&
              duplicate.duplicateIds.length > 0),
        ),
      ).toBeDefined();
    }

    for (const nonDuplicateEntitySummary of nonDuplicateEntitySummaries) {
      expect(
        duplicates.find(
          (duplicate) =>
            duplicate.duplicateIds.includes(
              nonDuplicateEntitySummary.localId,
            ) ||
            (duplicate.canonicalId === nonDuplicateEntitySummary.localId &&
              duplicate.duplicateIds.length > 0),
        ),
      ).toBeUndefined();
    }
  },
  {
    timeout: 5 * 60 * 1000,
  },
);

const llmProviderExistingEntitySummaries: LocalEntitySummary[] = [
  {
    localId: "1f33981a-4d1f-4067-b279-a7d72f609b71",
    name: "GPT-4o",
    summary:
      "GPT-4o is OpenAI's most advanced multimodal large language model, known for its high efficiency, speed, and cost-effectiveness.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/large-language-model/v/1",
  },
  {
    localId: "771c6c67-3ea4-46e3-a120-b95a89c9ca4d",
    name: "GPT-4 Turbo",
    summary:
      "GPT-4 Turbo is a high-intelligence and multimodal large language model previously favored for its advanced reasoning and vision capabilities.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/large-language-model/v/1",
  },
  {
    localId: "bd536684-597b-4368-b390-425868dd5b83",
    name: "GPT-3.5 Turbo",
    summary:
      "GPT-3.5 Turbo is a fast, inexpensive large language model optimized for simple tasks and chat functionalities.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/large-language-model/v/1",
  },
  {
    localId: "ab049eb7-894d-42ea-a063-a76144b08b71",
    name: "GPT Base",
    summary:
      "GPT Base models are large language models capable of understanding and generating natural language or code without instruction following.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/large-language-model/v/1",
  },
  {
    localId: "3ae3cc00-eb67-41a4-9d51-fa19e0157537",
    name: "gpt-4-turbo-2024-04-09",
    summary:
      "gpt-4-turbo-2024-04-09 is a version of GPT-4 Turbo with vision capabilities, supporting JSON mode and function calling.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/large-language-model/v/1",
  },
  {
    localId: "c5a65ece-9499-4ebf-bf33-117b7a58c6fb",
    name: "gpt-4-turbo-2024-04-09",
    summary:
      "GPT-4 Turbo with Vision is the latest GPT-4 Turbo model with vision capabilities, including support for JSON mode and function calling.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/large-language-model/v/1",
  },
  {
    localId: "f8aea256-2e38-4c1c-b748-c6d0be878b24",
    name: "gpt-4-turbo-preview",
    summary:
      "gpt-4-turbo-preview is a preview version of GPT-4 Turbo intended to reduce incomplete task responses.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/large-language-model/v/1",
  },
  {
    localId: "7c5d7b76-f5c8-4dd7-a88e-7f94996050aa",
    name: "gpt-4-0125-preview",
    summary:
      "gpt-4-0125-preview is an earlier preview of GPT-4 Turbo, focused on reducing inadequately completed tasks.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/large-language-model/v/1",
  },
  {
    localId: "14fdba17-11f2-4957-a00b-3e2e8b58a2ac",
    name: "gpt-4-1106-preview",
    summary:
      "gpt-4-1106-preview is a preview version of GPT-4 Turbo with improved instruction following and new features.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/large-language-model/v/1",
  },
  {
    localId: "06a0bad9-da61-41c0-9149-cdbb1e49c750",
    name: "gpt-4-vision-preview",
    summary:
      "gpt-4-vision-preview is a preview model of GPT-4 with image understanding and other high-level capabilities.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/large-language-model/v/1",
  },
  {
    localId: "52aa0aa0-3753-4c03-8552-f86915fa5bfe",
    name: "gpt-4-1106-vision-preview",
    summary:
      "gpt-4-1106-vision-preview is a preview model of GPT-4 with image understanding and advanced functionalities.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/large-language-model/v/1",
  },
  {
    localId: "d588f0d1-8ea1-4f18-b09e-099f1ba573eb",
    name: "gpt-4",
    summary:
      "GPT-4 is a multimodal large language model known for its advanced reasoning, solving difficult problems with greater accuracy and broader general knowledge.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/large-language-model/v/1",
  },
  {
    localId: "02f58d32-6fa5-4055-8518-1178eaddabbb",
    name: "gpt-4-0613",
    summary:
      "gpt-4-0613 is a snapshot model of GPT-4 focused on improved function calling support as of June 13, 2023.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/large-language-model/v/1",
  },
  {
    localId: "11a7b96a-44f0-48ee-9b88-19cd13bab94c",
    name: "gpt-4-32k",
    summary:
      "gpt-4-32k is a version of GPT-4 designed for larger context windows, though not widely rolled out due to preference for GPT-4 Turbo.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/large-language-model/v/1",
  },
  {
    localId: "bf6aa6ae-85ea-4590-bf0e-6e9102cb69b0",
    name: "gpt-4-32k-0613",
    summary:
      "gpt-4-32k-0613 is a snapshot model of GPT-4 for large context windows with better function calling support.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/large-language-model/v/1",
  },
  {
    localId: "1e42a1ef-d1ea-482e-97d2-37d4403591c6",
    name: "gpt-3.5-turbo-0125",
    summary:
      "gpt-3.5-turbo-0125 is a version of GPT-3.5 Turbo with higher programming format accuracy and improved non-English language support.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/large-language-model/v/1",
  },
  {
    localId: "f20f5e21-17bb-4b27-9deb-9e04a89df33f",
    name: "gpt-3.5-turbo-1106",
    summary:
      "gpt-3.5-turbo-1106 features improved instruction following and other enhancements.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/large-language-model/v/1",
  },
  {
    localId: "244114fe-bd85-434b-a56b-20ebefed3210",
    name: "gpt-3.5-turbo-instruct",
    summary:
      "GPT-3.5 Turbo Instruct is a large language model compatible with legacy Completions endpoints.",
    entityTypeId:
      "https://hash.ai/@ftse/types/entity-type/large-language-model/v/1",
  },
];

test.skip(
  "Test deduplicate LLM providers",
  async () => {
    const { duplicates } = await deduplicateEntities({
      entities: llmProviderExistingEntitySummaries,
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ duplicates }, null, 2));

    expect(duplicates).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);
