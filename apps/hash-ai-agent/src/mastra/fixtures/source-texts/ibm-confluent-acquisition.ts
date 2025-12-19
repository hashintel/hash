/**
 * IBM-Confluent Acquisition - Source Text Fixture
 *
 * Confluent blog post announcing IBM's acquisition of Confluent.
 * Good for testing Company/Person extraction in M&A context.
 *
 * Source: https://confluent.io/blog/ibm-to-acquire-confluent/
 * Published: December 8, 2025
 */

export const ibmConfluentAcquisition = {
  sourceText: `IBM to Acquire Confluent

Dec 8, 2025

We are excited to announce that Confluent has entered into a definitive agreement to be acquired by IBM. After the transaction is closed (subject to customary closing conditions and regulatory approvals), together, IBM and Confluent will aim to provide a platform that unifies the world's largest enterprises, unlocking data for cloud/microservices, accelerating time-to-value, and building the real-time data foundation required to scale AI across every organization.

The below email was shared earlier today from Jay Kreps, CEO and Co-Founder of Confluent to our Confluent team.

Confluent Team,

I'm excited to share that a few moments ago, we announced that Confluent has signed an agreement to be acquired by IBM in an all cash deal for $31.00 per share. Confluent will continue to operate as a distinct brand and business within IBM post-close.

In the letter I wrote at our IPO in 2021, I said that "There is a saying that a fox knows many things, but a hedgehog knows one big thing--Confluent is a company that knows a very big thing" and that rings true for me today.

Data is at the heart of what companies need to do to harness AI, modernize their operations, and build the next generation of applications; and Confluent is at the heart of what companies need to harness their data. This has been our goal in the team we've built, the products we've shipped, and the customer relationships we've cultivated. That conviction has only grown stronger.

IBM sees the same future we do: one in which enterprises run on continuous, event-driven intelligence, with data moving freely and reliably across every part of the business. They see that this connective layer will define how companies operate for decades to come, they understand open source and its power, and they work with some of the largest hybrid enterprises in the world. By joining forces, we can bring this architecture to far more organizations, accelerating the shift toward real-time and AI-powered operations globally.

IBM also has a long history of supporting open source and has demonstrated real leadership in this area with their prior acquisitions of Red Hat and HashiCorp. Our shared values of technical leadership, customer trust, and the belief that data is foundational to the next generation of AI is a big part of why I'm excited.

Becoming part of IBM won't change Confluent's mission; it will amplify it. The idea that sparked Kafka, grew into Confluent, and shaped an entire new category of data infrastructure now enters a phase where it can scale even more broadly and meaningfully.

Serving as CEO and leading this team over the past eleven years has been and continues to be the great privilege of my career. I'm profoundly proud of what we've built—the products, the technology, and equally important, the culture that has defined Confluent from the very beginning.

We're still pretty early in this process, so there are many details that still need to be figured out. Until the deal officially closes (subject to customary closing conditions and regulatory approvals, which we expect by the middle of 2026), Confluent will continue to operate as a separate, independent company, and our priorities remain the same.

Now, more than ever, we're here to set data in motion.

Thank you,
Jay`,

  sourceMeta: {
    uri: "https://confluent.io/blog/ibm-to-acquire-confluent/",
    name: "IBM to Acquire Confluent",
    capturedAt: "2025-12-08T00:00:00Z",
  },

  /** Expected Person entities to extract */
  expectedPersons: ["Jay Kreps"],

  /** Expected Organization entities to extract */
  expectedOrganizations: ["IBM", "Confluent", "Red Hat", "HashiCorp"],

  /** Research goal for testing */
  researchGoal: "Find details about the IBM acquisition of Confluent",
} as const;
