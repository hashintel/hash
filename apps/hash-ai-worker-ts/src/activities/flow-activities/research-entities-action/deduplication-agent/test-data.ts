import { VersionedUrl } from "@blockprotocol/type-system";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";

export type EntitySummary = {
  localId: string;
  name: string;
  summary: string;
  entityTypeId: VersionedUrl;
};

const ftse350EntitySummaries: EntitySummary[] = [
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

const soraPaperAuthors: EntitySummary[] = [
  {
    localId: "6b886b38-4adc-4be7-a3db-8c06f5842a6f",
    name: "Tim Brooks",
    summary:
      "Author of the Sora paper. No affiliations or contact info provided in the text.",
    entityTypeId: "https://hash.ai/@ftse/types/entity-type/person/v/1",
  },
  {
    localId: "91b5a2f2-4057-4f1a-afcb-08aea573ec70",
    name: "Bill Peebles",
    summary:
      "Author of the Sora paper. No affiliations or contact info provided in the text.",
    entityTypeId: "https://hash.ai/@ftse/types/entity-type/person/v/1",
  },
  {
    localId: "63501a4b-ae38-4e2c-9fda-c493ff7504c3",
    name: "Connor Holmes",
    summary:
      "Author of the Sora paper. No affiliations or contact info provided in the text.",
    entityTypeId: "https://hash.ai/@ftse/types/entity-type/person/v/1",
  },
  {
    localId: "8b4e85ac-22ce-43c9-a56c-afc66ef4d38f",
    name: "Will DePue",
    summary:
      "Author of the Sora paper. No affiliations or contact info provided in the text.",
    entityTypeId: "https://hash.ai/@ftse/types/entity-type/person/v/1",
  },
  {
    localId: "750618d6-8d7e-4fac-9eb0-a4e6e9c36a09",
    name: "Yufei Guo",
    summary:
      "Author of the Sora paper. No affiliations or contact info provided in the text.",
    entityTypeId: "https://hash.ai/@ftse/types/entity-type/person/v/1",
  },
  {
    localId: "bf0523e8-d1a1-4d94-9624-0b2dae06a01c",
    name: "Li Jing",
    summary:
      "Author of the Sora paper. No affiliations or contact info provided in the text.",
    entityTypeId: "https://hash.ai/@ftse/types/entity-type/person/v/1",
  },
  {
    localId: "01873977-fbcf-4d77-95c2-69793013e2e3",
    name: "David Schnurr",
    summary:
      "Author of the Sora paper. No affiliations or contact info provided in the text.",
    entityTypeId: "https://hash.ai/@ftse/types/entity-type/person/v/1",
  },
  {
    localId: "e66b64af-37b5-49a9-b4a7-eaa94cf13b5c",
    name: "Joe Taylor",
    summary:
      "Author of the Sora paper. No affiliations or contact info provided in the text.",
    entityTypeId: "https://hash.ai/@ftse/types/entity-type/person/v/1",
  },
  {
    localId: "26551804-0ac9-49d9-95a5-773cd44d70a9",
    name: "Troy Luhman",
    summary:
      "Author of the Sora paper. No affiliations or contact info provided in the text.",
    entityTypeId: "https://hash.ai/@ftse/types/entity-type/person/v/1",
  },
  {
    localId: "c3a46f97-2122-4b6a-8b0a-c4c5832c8c9a",
    name: "Eric Luhman",
    summary:
      "Author of the Sora paper. No affiliations or contact info provided in the text.",
    entityTypeId: "https://hash.ai/@ftse/types/entity-type/person/v/1",
  },
  {
    localId: "8379cd88-448c-49d4-a15e-b3ccc4fa7c61",
    name: "Clarence Ng",
    summary:
      "Author of the Sora paper. No affiliations or contact info provided in the text.",
    entityTypeId: "https://hash.ai/@ftse/types/entity-type/person/v/1",
  },
  {
    localId: "e364c967-8f3a-47fc-b524-b740437ba8bf",
    name: "Ricky Wang",
    summary:
      "Author of the Sora paper. No affiliations or contact info provided in the text.",
    entityTypeId: "https://hash.ai/@ftse/types/entity-type/person/v/1",
  },
  {
    localId: "66002d8d-abf8-4b2b-a243-cd1188fbf67d",
    name: "Aditya Ramesh",
    summary:
      "Author of the Sora paper. No affiliations or contact info provided in the text.",
    entityTypeId: "https://hash.ai/@ftse/types/entity-type/person/v/1",
  },
];

const generateRandomIndices = (
  numberToGenerate: number,
  maxIndex: number,
): number[] => {
  const randomIndices: number[] = [];
  for (let i = 0; i < numberToGenerate; i++) {
    const randomIndex = Math.floor(Math.random() * maxIndex);
    randomIndices.push(randomIndex);
  }
  return randomIndices;
};

const shuffleArray = (array: unknown[]) => {
  let currentIndex = array.length;

  while (currentIndex != 0) {
    let randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }
};

const originalEntities = [...ftse350EntitySummaries, ...soraPaperAuthors];

export const generateEntitySummariesWithDuplicates = () => {
  const entities: EntitySummary[] = [...originalEntities];

  const randomIndices = generateRandomIndices(15, entities.length);

  // ensure we have multiple duplicates of the same entity
  randomIndices.push(randomIndices[0]!, randomIndices[3]!, randomIndices[5]!);

  entities.push(
    ...randomIndices.map((randomIndex) => {
      const original = entities[randomIndex]!;

      const lettersToRemove = generateRandomIndices(
        20,
        original.summary.length,
      );

      const garbledSummary = original.summary
        .split("")
        .filter((_, index) => !lettersToRemove.includes(index))
        .join("");

      const duplicate = {
        ...original,
        localId: generateUuid(),
        summary: garbledSummary,
      };

      return duplicate;
    }),
  );

  shuffleArray(entities);

  return {
    entities,
    duplicateCount: entities.length - originalEntities.length,
  };
};
