/**
 * Netflix WBD Bidding War - Source Text Fixture
 *
 * CNN article about Netflix's bid for Warner Bros. Discovery assets.
 * Good for testing complex Company/Person extraction with political context.
 *
 * Source: https://edition.cnn.com/2025/12/04/media/netflix-paramount-wbd-bidding-war-warner-bros-discovery
 * Published: December 4, 2025
 */

export const netflixWbdBidding = {
  sourceText: `Netflix becomes frontrunner in bidding war for Warner Bros. Discovery, sources say

Netflix has submitted the highest bid to date for Warner Bros. Discovery's studio and streaming assets, according to people familiar with the secretive bidding process.

Netflix's most recent offer, submitted on Thursday, valued the Warner Bros. studio, HBO Max streaming service and related parts of the company at around $28 per share, sources said.

Paramount also submitted a new bid on Thursday, closer to $27 per share, one of the sources added.

The two offers aren't apples-to-apples, however, because Paramount has been trying to buy all of Warner Bros. Discovery, including CNN and other cable channels, while Netflix and another bidder, Comcast, have only shown interest in the studio and streaming assets.

The mega-media bidding war has intensified in recent days, captivating a wide swath of Hollywood and garnering attention from the Trump White House. Iconic brands like HBO and DC Comics hang in the balance.

Representatives for the companies involved have declined to comment. But leaks out of what is supposed to be a confidential process suggest that Netflix now has the pole position.

Paramount certainly perceives it that way; the company's attorneys wrote to Zaslav expressing "grave concerns" about the auction process.

Specifically, Paramount's attorneys charged that WBD has "embarked on a myopic process with a predetermined outcome that favors a single bidder," meaning Netflix.

Analysts said the letter could be a precursor to a hostile-takeover play by Paramount, which has moved aggressively in recent months under new CEO David Ellison's leadership.

Late Thursday, Bloomberg reported that WBD and Netflix have entered exclusive talks.

Ellison kickstarted the auction process earlier in the fall by submitting multiple bids to WBD CEO David Zaslav and the company's board.

Zaslav officially put up the for-sale sign in October. At the same time, he said that WBD's previously announced plan to split the company into two publicly traded halves would continue to be pursued.

The WBD board had been under pressure to do something, since the company's stock plummeted after it was formed through a 2022 merger, from roughly $25 a share to a low of $7.52.

The split plan helped to rejuvenate WBD's shares earlier this year, and then word of Paramount's offers sent the stock skyrocketing back toward $25.

If the split still takes effect next year, the Warner Bros. half would house HBO Max and the movie studio, and the Discovery Global half would house CNN and other cable channels.

Ellison's pursuit is audacious, to be sure: Paramount's market cap is currently one-fourth the size of WBD's market cap.

But Ellison and his management team have been moving fast to revitalize Paramount and disprove skeptics across Hollywood.

It's impossible to make sense of the WBD bidding war without understanding the "Trump card."

Ellison and Paramount are perceived to have a mutually beneficial relationship with President Trump and the White House — and thus an advantage in getting any deal approved by the Trump administration. "That's the Trump card," an Ellison adviser remarked to CNN in October.

Trump has repeatedly praised Ellison and his father Larry, Oracle's executive chairman, who is a key player in Trump's dealings with TikTok.

"They're friends of mine. They're big supporters of mine," the president said in mid-October.

Numerous Republican lawmakers have also cheered the Ellison takeover of CBS and the rest of Paramount, especially the installation of Bari Weiss as editor in chief of CBS News.

Ellison has been both credited and criticized for forging a relationship with Trump's inner circle this year despite donating nearly $1 million to Joe Biden's reelection campaign last year.

Just a couple of weeks ago, Ellison landed an invitation to Trump's White House dinner for Saudi Crown Prince Mohammed bin Salman.

On Wednesday he was scheduled to appear at the DealBook Summit, an annual conference hosted by The New York Times in Manhattan. But he withdrew from the summit amid the negotiations with WBD and was later spotted back in Washington, D.C. for talks with officials there.

During the WBD bidding process, Paramount executives have bluntly argued that their offer will pass muster with Trump administration regulators while rival offers will not.

When the Justice Department in 2017 sued to stop AT&T's merger with Time Warner, a forerunner to WBD, the companies fought the case in court and prevailed.

Some Wall Street analysts have asserted that Netflix may be willing to stomach a similar legal battle.

A WBD sale, in whole or in part, would face scrutiny in the United Kingdom, the European Union and some Latin American countries.

"Learning about Netflix's ambition to buy its real competitive threat — WBD's streaming business — should send alarm to antitrust enforcers around the world," Sen. Mike Lee wrote on X. "This potential transaction, if it were to materialize, would raise serious competition questions — perhaps more so than any transaction I've seen in about a decade."

A recent Bank of America analyst report put it this way: "If Netflix acquires Warner Bros., the streaming wars are effectively over. Netflix would become the undisputed global powerhouse of Hollywood beyond even its currently lofty position."`,

  sourceMeta: {
    uri: "https://edition.cnn.com/2025/12/04/media/netflix-paramount-wbd-bidding-war-warner-bros-discovery",
    name: "Netflix becomes frontrunner in bidding war for Warner Bros. Discovery",
    capturedAt: "2025-12-04T00:00:00Z",
  },

  /** Expected Person entities to extract */
  expectedPersons: [
    "David Ellison",
    "David Zaslav",
    "Larry Ellison",
    "Donald Trump",
    "Bari Weiss",
    "Joe Biden",
    "Mohammed bin Salman",
    "Mike Lee",
  ],

  /** Expected Organization entities to extract */
  expectedOrganizations: [
    "Netflix",
    "Warner Bros. Discovery",
    "Paramount",
    "HBO",
    "HBO Max",
    "DC Comics",
    "CNN",
    "Comcast",
    "Oracle",
    "TikTok",
    "CBS",
    "CBS News",
    "AT&T",
    "Time Warner",
    "Bloomberg",
    "The New York Times",
    "Bank of America",
  ],

  /** Research goal for testing */
  researchGoal: "Find all the companies and executives involved in the Warner Bros. Discovery bidding war",
} as const;

