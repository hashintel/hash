/**
 * Microsoft Wikipedia - Source Text Fixture
 *
 * Excerpt from the Microsoft Wikipedia article.
 * Good for testing Company/Person entity extraction with rich factual content.
 *
 * Source: Wikipedia (Microsoft article)
 * Expected entities: Many Person and Organization entities
 */

export const microsoftWikipedia = {
  sourceText: `Microsoft Corporation is an American multinational corporation and technology company headquartered in Redmond, Washington. Microsoft's best-known software products are the Windows line of operating systems, the Microsoft 365 suite of productivity applications, and the Edge web browser. Its flagship hardware products are the Xbox video game consoles and the Microsoft Surface lineup of touchscreen personal computers. Microsoft ranked No. 14 in the 2022 Fortune 500 rankings of the largest United States corporations by total revenue; and it was the world's largest software maker by revenue in 2022 according to Forbes Global 2000. It is considered one of the Big Five American information technology companies, alongside Alphabet (parent company of Google), Amazon, Apple, and Meta (parent company of Facebook).

Microsoft was founded by Bill Gates and Paul Allen on April 4, 1975, to develop and sell BASIC interpreters for the Altair 8800. It rose to dominate the personal computer operating system market with MS-DOS in the mid-1980s, followed by Windows. The company's 1986 initial public offering (IPO) and subsequent rise in its share price created three billionaires and an estimated 12,000 millionaires among Microsoft employees. Since the 1990s, it has increasingly diversified from the operating system market and has made several corporate acquisitions, the largest being the acquisition of Activision Blizzard for $68.7 billion in October 2023, followed by its acquisition of LinkedIn for $26.2 billion in December 2016, and its acquisition of Skype Technologies for $8.5 billion in May 2011.

As of 2015, Microsoft is market-dominant in the IBM PC compatible operating system market and the office software suite market, although it has lost the majority of the overall operating system market to Android. The company also produces a wide range of other consumer and enterprise software for desktops, laptops, tabs, gadgets, and servers, including Internet search (with Bing), the digital services market (through MSN), mixed reality (HoloLens), cloud computing (Azure), and software development (Visual Studio).

Steve Ballmer replaced Gates as CEO in 2000 and later envisioned a "devices and services" strategy. This unfolded with Microsoft acquiring Danger Inc. in 2008, entering the personal computer production market for the first time in June 2012 with the launch of the Microsoft Surface line of tablet computers, and later forming Microsoft Mobile through the acquisition of Nokia's devices and services division. Since Satya Nadella took over as CEO in 2014, the company has scaled back on hardware and instead focused on cloud computing, a move that helped the company's shares reach their highest value since December 1999. Under Nadella's direction, the company has also heavily expanded its gaming business to support the Xbox brand, establishing the Microsoft Gaming division in 2022, dedicated to operating Xbox in addition to its three subsidiaries (publishers). Microsoft Gaming is the third-largest gaming company in the world by revenue as of 2024.

In 2018, Microsoft became the most valuable publicly traded company in the world, a position it has repeatedly traded with Apple in the years since. In April 2019, Microsoft reached a trillion-dollar market cap, becoming the third U.S. public company to be valued at over $1 trillion after Apple and Amazon, respectively. As of 2024, Microsoft has the third-highest global brand valuation.

Microsoft has been criticized for its monopolistic practices and the company's software has been criticized for problems with ease of use, robustness, and security.`,

  sourceMeta: {
    uri: "https://en.wikipedia.org/wiki/Microsoft",
    name: "Microsoft – Wikipedia",
    capturedAt: "2024-01-01T00:00:00Z",
  },

  /** Expected Person entities to extract */
  expectedPersons: [
    "Bill Gates",
    "Paul Allen",
    "Steve Ballmer",
    "Satya Nadella",
  ],

  /** Expected Organization entities to extract */
  expectedOrganizations: [
    "Microsoft",
    "Alphabet",
    "Google",
    "Amazon",
    "Apple",
    "Meta",
    "Facebook",
    "Activision Blizzard",
    "LinkedIn",
    "Skype Technologies",
    "Nokia",
    "Microsoft Gaming",
    "Danger Inc.",
  ],

  /** Research goal for testing */
  researchGoal: "Find information about Microsoft, its founders, executives, and acquisitions",
} as const;

