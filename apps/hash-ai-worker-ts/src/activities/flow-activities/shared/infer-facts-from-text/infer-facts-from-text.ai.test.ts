import "../../../../shared/testing-utilities/mock-get-flow-context";

import { expect, test } from "vitest";

import { getDereferencedEntityTypesActivity } from "../../../get-dereferenced-entity-types-activity";
import { getWebPageActivity } from "../../../get-web-page-activity";
import { getFlowContext } from "../../../shared/get-flow-context";
import { graphApiClient } from "../../../shared/graph-api-client";
import { inferFactsFromText } from "../infer-facts-from-text";
import type { LocalEntitySummary } from "./get-entity-summaries-from-text";

const microsoftWikipediaParagraph = `
Microsoft Corporation is an American multinational corporation and technology company headquartered in Redmond, Washington.[2] Microsoft's best-known software products are the Windows line of operating systems, the Microsoft 365 suite of productivity applications, and the Edge web browser. Its flagship hardware products are the Xbox video game consoles and the Microsoft Surface lineup of touchscreen personal computers. Microsoft ranked No. 14 in the 2022 Fortune 500 rankings of the largest United States corporations by total revenue;[3] and it was the world's largest software maker by revenue in 2022 according to Forbes Global 2000. It is considered one of the Big Five American information technology companies, alongside Alphabet (parent company of Google), Amazon, Apple, and Meta (parent company of Facebook).

Microsoft was founded by Bill Gates and Paul Allen on April 4, 1975, to develop and sell BASIC interpreters for the Altair 8800. It rose to dominate the personal computer operating system market with MS-DOS in the mid-1980s, followed by Windows. The company's 1986 initial public offering (IPO) and subsequent rise in its share price created three billionaires and an estimated 12,000 millionaires among Microsoft employees. Since the 1990s, it has increasingly diversified from the operating system market and has made several corporate acquisitions, the largest being the acquisition of Activision Blizzard for $68.7 billion in October 2023,[4] followed by its acquisition of LinkedIn for $26.2 billion in December 2016,[5] and its acquisition of Skype Technologies for $8.5 billion in May 2011.[6]

As of 2015, Microsoft is market-dominant in the IBM PC compatible operating system market and the office software suite market, although it has lost the majority of the overall operating system market to Android.[7] The company also produces a wide range of other consumer and enterprise software for desktops, laptops, tabs, gadgets, and servers, including Internet search (with Bing), the digital services market (through MSN), mixed reality (HoloLens), cloud computing (Azure), and software development (Visual Studio).

Steve Ballmer replaced Gates as CEO in 2000 and later envisioned a "devices and services" strategy.[8] This unfolded with Microsoft acquiring Danger Inc. in 2008,[9] entering the personal computer production market for the first time in June 2012 with the launch of the Microsoft Surface line of tablet computers, and later forming Microsoft Mobile through the acquisition of Nokia's devices and services division. Since Satya Nadella took over as CEO in 2014, the company has scaled back on hardware and instead focused on cloud computing, a move that helped the company's shares reach their highest value since December 1999.[10][11] Under Nadella's direction, the company has also heavily expanded its gaming business to support the Xbox brand, establishing the Microsoft Gaming division in 2022, dedicated to operating Xbox in addition to its three subsidiaries (publishers). Microsoft Gaming is the third-largest gaming company in the world by revenue as of 2024.[12]

In 2018, Microsoft became the most valuable publicly traded company in the world, a position it has repeatedly traded with Apple in the years since.[13] In April 2019, Microsoft reached a trillion-dollar market cap, becoming the third U.S. public company to be valued at over $1 trillion after Apple and Amazon, respectively. As of 2024, Microsoft has the third-highest global brand valuation.

Microsoft has been criticized for its monopolistic practices and the company's software has been criticized for problems with ease of use, robustness, and security.
`;

test.skip(
  "Test inferFactsFromText with Microsoft Wikipedia paragraph.",
  async () => {
    const { facts } = await inferFactsFromText({
      text: microsoftWikipediaParagraph,
      dereferencedEntityTypes: {},
    });

    expect(facts).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);

const _ftse350EntitySummaries: LocalEntitySummary[] = [
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

test(
  "Test inferFactsFromText with FTSE350 web page html",
  async () => {
    const { htmlContent } = await getWebPageActivity({
      url: "https://www.londonstockexchange.com/indices/ftse-350/constituents/table",
      sanitizeForLlm: true,
    });

    const { userAuthentication } = await getFlowContext();

    const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
      entityTypeIds: [
        "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
        "https://hash.ai/@ftse/types/entity-type/stock-market-index/v/1",
        "https://hash.ai/@ftse/types/entity-type/appears-in-index/v/1",
      ],
      actorId: userAuthentication.actorId,
      graphApiClient,
      simplifyPropertyKeys: true,
    });

    const { facts, entitySummaries } = await inferFactsFromText({
      text: htmlContent,
      dereferencedEntityTypes,
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ facts, entitySummaries }, null, 2));

    expect(facts).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);
