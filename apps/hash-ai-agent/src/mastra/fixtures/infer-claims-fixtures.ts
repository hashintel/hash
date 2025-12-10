import path from "node:path";
import { fileURLToPath } from "node:url";

import type { VersionedUrl } from "@blockprotocol/type-system";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Fixtures for testing the infer-summaries-then-claims pipeline.
 *
 * These test the full entity extraction → claim extraction flow.
 * Based on test cases from hash-ai-worker-ts infer-summaries-then-claims-from-text.ai.test.ts
 */

// Mock entity type definitions (simplified for testing)
const personEntityType = {
  $id: "https://hash.ai/@h/types/entity-type/person/v/1" as VersionedUrl,
  title: "Person",
  description: "A human being",
};

const companyEntityType = {
  $id: "https://hash.ai/@h/types/entity-type/company/v/1" as VersionedUrl,
  title: "Company",
  description:
    "A legal entity representing an association of people with a specific objective.",
};

const stockMarketConstituentEntityType = {
  $id: "https://hash.ai/@h/types/entity-type/stock-market-constituent/v/1" as VersionedUrl,
  title: "Stock Market Constituent",
  description: "A company that is part of a stock market index",
};

const stockMarketIndexEntityType = {
  $id: "https://hash.ai/@h/types/entity-type/stock-market-index/v/1" as VersionedUrl,
  title: "Stock Market Index",
  description: "A measurement of the value of a section of the stock market",
};

const llmEntityType = {
  $id: "https://hash.ai/@h/types/entity-type/large-language-model/v/1" as VersionedUrl,
  title: "Large Language Model",
  description:
    "A large language model (LLM) is a type of artificial intelligence model trained on vast amounts of text data",
};

// Static text content from the original test file
const microsoftWikipediaParagraph = `
Microsoft Corporation is an American multinational corporation and technology company headquartered in Redmond, Washington.[2] Microsoft's best-known software products are the Windows line of operating systems, the Microsoft 365 suite of productivity applications, and the Edge web browser. Its flagship hardware products are the Xbox video game consoles and the Microsoft Surface lineup of touchscreen personal computers. Microsoft ranked No. 14 in the 2022 Fortune 500 rankings of the largest United States corporations by total revenue;[3] and it was the world's largest software maker by revenue in 2022 according to Forbes Global 2000. It is considered one of the Big Five American information technology companies, alongside Alphabet (parent company of Google), Amazon, Apple, and Meta (parent company of Facebook).

Microsoft was founded by Bill Gates and Paul Allen on April 4, 1975, to develop and sell BASIC interpreters for the Altair 8800. It rose to dominate the personal computer operating system market with MS-DOS in the mid-1980s, followed by Windows. The company's 1986 initial public offering (IPO) and subsequent rise in its share price created three billionaires and an estimated 12,000 millionaires among Microsoft employees. Since the 1990s, it has increasingly diversified from the operating system market and has made several corporate acquisitions, the largest being the acquisition of Activision Blizzard for $68.7 billion in October 2023,[4] followed by its acquisition of LinkedIn for $26.2 billion in December 2016,[5] and its acquisition of Skype Technologies for $8.5 billion in May 2011.[6]

As of 2015, Microsoft is market-dominant in the IBM PC compatible operating system market and the office software suite market, although it has lost the majority of the overall operating system market to Android.[7] The company also produces a wide range of other consumer and enterprise software for desktops, laptops, tabs, gadgets, and servers, including Internet search (with Bing), the digital services market (through MSN), mixed reality (HoloLens), cloud computing (Azure), and software development (Visual Studio).

Steve Ballmer replaced Gates as CEO in 2000 and later envisioned a "devices and services" strategy.[8] This unfolded with Microsoft acquiring Danger Inc. in 2008,[9] entering the personal computer production market for the first time in June 2012 with the launch of the Microsoft Surface line of tablet computers, and later forming Microsoft Mobile through the acquisition of Nokia's devices and services division. Since Satya Nadella took over as CEO in 2014, the company has scaled back on hardware and instead focused on cloud computing, a move that helped the company's shares reach their highest value since December 1999.[10][11] Under Nadella's direction, the company has also heavily expanded its gaming business to support the Xbox brand, establishing the Microsoft Gaming division in 2022, dedicated to operating Xbox in addition to its three subsidiaries (publishers). Microsoft Gaming is the third-largest gaming company in the world by revenue as of 2024.[12]

In 2018, Microsoft became the most valuable publicly traded company in the world, a position it has repeatedly traded with Apple in the years since.[13] In April 2019, Microsoft reached a trillion-dollar market cap, becoming the third U.S. public company to be valued at over $1 trillion after Apple and Amazon, respectively. As of 2024, Microsoft has the third-highest global brand valuation.

Microsoft has been criticized for its monopolistic practices and the company's software has been criticized for problems with ease of use, robustness, and security.
`;

export type InferClaimsFixture = {
  name: string;
  content: string;
  url: string | null;
  title: string | null;
  goal: string;
  contentType: "webpage" | "document";
  entityTypes: {
    $id: VersionedUrl;
    title: string;
    description: string;
  }[];
};

export const inferClaimsFixtures: InferClaimsFixture[] = [
  {
    name: "Microsoft Wikipedia",
    content: microsoftWikipediaParagraph,
    url: null,
    title: "Microsoft – Wikipedia",
    goal: "Find info on Microsoft",
    contentType: "webpage",
    entityTypes: [companyEntityType],
  },
  // TODO: Re-enable once HTML fixtures are properly captured
  // {
  //   name: "Sora paper authors",
  //   content: soraPaperHtml,
  //   url: "https://arxiv.org/html/2402.17177v1",
  //   title:
  //     "Sora: A Review on Background, Technology, Limitations, and Opportunities of Large Vision Models",
  //   goal: "Find the authors of the Sora paper",
  //   contentType: "webpage",
  //   entityTypes: [personEntityType],
  // },
  // The current captures are incomplete (FTSE350 is empty, OpenAI is nav-only)
  // {
  //   name: "FTSE350 constituents",
  //   content: ftse350Html,
  //   url: "https://www.londonstockexchange.com/indices/ftse-350/constituents/table",
  //   title: "FTSE 350 Constituents",
  //   goal: "Find information about FTSE350 constituents.",
  //   contentType: "webpage",
  //   entityTypes: [stockMarketConstituentEntityType, stockMarketIndexEntityType],
  // },
  // {
  //   name: "OpenAI Models",
  //   content: openaiModelsHtml,
  //   url: "https://platform.openai.com/docs/models",
  //   title: "OpenAI Models Documentation",
  //   goal: "Find all the Large Language Models provided by OpenAI",
  //   contentType: "webpage",
  //   entityTypes: [llmEntityType],
  // },
];

// Export entity types for use in tests
export {
  companyEntityType,
  llmEntityType,
  personEntityType,
  stockMarketConstituentEntityType,
  stockMarketIndexEntityType,
};
