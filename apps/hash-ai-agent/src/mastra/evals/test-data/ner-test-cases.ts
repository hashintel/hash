/**
 * NER Test Cases for Entity Extraction Evaluation
 *
 * Ported and simplified from hash-ai-worker-ts test data.
 * Focuses on stable, fixture-based test cases without external dependencies.
 *
 * Each test case includes:
 * - name: Test case description
 * - entityType: The target entity type to extract
 * - relevantEntitiesPrompt: Research goal/filter
 * - context: Source text
 * - goldEntities: Entities that MUST be found (recall measure)
 * - irrelevantEntities: Entities that should be IGNORED (precision measure)
 * - wrongTypeEntities: Entities with correct name but wrong type (type accuracy measure)
 */

type EntitySummary = {
  name: string;
  description?: string;
};

export type NERTestCase = {
  name: string;
  entityType: {
    $id: string;
    title: string;
    description: string;
  };
  relevantEntitiesPrompt: string;
  context: string;
  goldEntities: EntitySummary[];
  irrelevantEntities: EntitySummary[];
  wrongTypeEntities: EntitySummary[];
};

export const nerTestCases: NERTestCase[] = [
  {
    name: "AI companies from tech news",
    entityType: {
      $id: "https://hash.ai/@h/types/entity-type/company/v/1",
      title: "Company",
      description:
        "A legal entity representing an association of people with a specific objective.",
    },
    relevantEntitiesPrompt: "AI companies",
    context: `Elon Musk drops lawsuit after OpenAI published his emails

Lawyers for Elon Musk on Tuesday moved to dismiss the billionaire's lawsuit against OpenAI and CEO Sam Altman, ending a months-long legal battle between co-founders of the artificial intelligence startup.

Musk — who co-founded OpenAI in 2015 — sued the company in February, accusing the ChatGPT maker of abandoning its original, nonprofit mission by reserving some of its most advanced AI technology for private customers. The lawsuit had sought a jury trial and for the company, Altman and co-founder and president Greg Brockman to pay back any profit they received from the business.

But OpenAI quickly pushed back against Musk's claims, calling them "incoherent" and "frivolous" and arguing in a court filing that the case should be dismissed. The company also published a blog post that included several of Musk's emails from OpenAI's early days. The emails appeared to show Musk acknowledging the need for the company to make large sums of money to fund the computing resources needed to power its AI ambitions, which stood in contrast to the claims in his lawsuit that OpenAI was wrongly pursuing profit.

The move to drop the lawsuit also came one day after Musk fired off a string of posts on his social media platform X criticizing OpenAI and its handling of user data, after Apple announced a partnership that integrates ChatGPT with digital personal assistant Siri for users on an opt-in basis.

The Musk-OpenAI legal battle represented the diverging visions for how the ChatGPT maker — which has quickly skyrocketed in value and become the leader in the burgeoning AI space that many see as the future of technology — should be managed.

Musk accused OpenAI of racing to develop powerful "artificial general intelligence" technology to "maximize profits." OpenAI, meanwhile, accused Musk of essentially being jealous that he was no longer involved in the startup, after he left OpenAI in 2018 following an unsuccessful bid to convince his fellow co-founders to let Tesla acquire it.

After days of uncertainty and an intervention by Microsoft, a major investor in OpenAI, Altman was restored to his position in what industry analysts said was a victory for those seeking to commercialize AI technology.

More recently, multiple high-profile OpenAI safety leaders exited the company, with several publicly claiming the company had prioritized quickly rolling out new products over safety.`,
    goldEntities: [
      {
        name: "OpenAI",
        description:
          "Artificial Intelligence startup co-founded by Elon Musk, involved in a lawsuit with Musk over its profit-driven direction.",
      },
      {
        name: "Tesla",
        description:
          "Company founded by Elon Musk, which Musk wanted to integrate with OpenAI.",
      },
      {
        name: "Microsoft",
        description:
          "Major investor in OpenAI, involved in resolving a leadership crisis within the company.",
      },
      {
        name: "Apple",
        description:
          "Company partnered with OpenAI to integrate ChatGPT with Siri.",
      },
    ],
    irrelevantEntities: [],
    wrongTypeEntities: [
      {
        name: "Elon Musk",
        description:
          "CEO and entrepreneur involved in the lawsuit against OpenAI.",
      },
      {
        name: "Sam Altman",
        description:
          "CEO of OpenAI, involved in the legal dispute with Elon Musk.",
      },
      {
        name: "Greg Brockman",
        description:
          "Co-founder and president of OpenAI, mentioned in Elon Musk lawsuit.",
      },
    ],
  },
  {
    name: "People from AI research context",
    entityType: {
      $id: "https://hash.ai/@h/types/entity-type/person/v/1",
      title: "Person",
      description: "A human person",
    },
    relevantEntitiesPrompt:
      "People who are researchers, executives, or key figures in AI companies",
    context: `The rise of large language models has been driven by several key figures in the AI industry.

Geoffrey Hinton, often called the "godfather of AI," recently left Google to speak more freely about AI risks. His pioneering work on neural networks laid the foundation for modern deep learning.

Sam Altman leads OpenAI as CEO, guiding the development of GPT-4 and ChatGPT. Under his leadership, OpenAI has become one of the most valuable AI startups, though not without controversy.

Demis Hassabis co-founded DeepMind, which was acquired by Google. His team developed AlphaGo, which famously defeated world Go champion Lee Sedol in 2016.

Yann LeCun serves as Chief AI Scientist at Meta, where he advocates for open-source AI development. He is known for his work on convolutional neural networks.

Anthropic, founded by former OpenAI researchers Dario Amodei and Daniela Amodei, focuses on AI safety. Their Claude model emphasizes helpful, harmless, and honest AI.`,
    goldEntities: [
      {
        name: "Geoffrey Hinton",
        description:
          'AI researcher known as the "godfather of AI," pioneered neural networks, recently left Google.',
      },
      {
        name: "Sam Altman",
        description: "CEO of OpenAI, leads development of GPT-4 and ChatGPT.",
      },
      {
        name: "Demis Hassabis",
        description:
          "Co-founder of DeepMind (acquired by Google), led AlphaGo development.",
      },
      {
        name: "Yann LeCun",
        description:
          "Chief AI Scientist at Meta, known for convolutional neural networks.",
      },
      {
        name: "Dario Amodei",
        description: "Co-founder of Anthropic, former OpenAI researcher.",
      },
      {
        name: "Daniela Amodei",
        description: "Co-founder of Anthropic, former OpenAI researcher.",
      },
      {
        name: "Lee Sedol",
        description: "World Go champion defeated by AlphaGo in 2016.",
      },
    ],
    irrelevantEntities: [],
    wrongTypeEntities: [
      {
        name: "Google",
        description: "Company where Geoffrey Hinton worked, acquired DeepMind.",
      },
      {
        name: "OpenAI",
        description: "AI company led by Sam Altman.",
      },
      {
        name: "DeepMind",
        description: "AI research company co-founded by Demis Hassabis.",
      },
      {
        name: "Meta",
        description: "Company where Yann LeCun serves as Chief AI Scientist.",
      },
      {
        name: "Anthropic",
        description: "AI safety company founded by Dario and Daniela Amodei.",
      },
    ],
  },
  {
    name: "Organizations from funding announcement",
    entityType: {
      $id: "https://hash.ai/@h/types/entity-type/organization/v/1",
      title: "Organization",
      description: "An organized group of people with a particular purpose",
    },
    relevantEntitiesPrompt:
      "Organizations involved in AI funding, investment, or regulation",
    context: `The National Science Foundation announced $140 million in funding for seven new AI research institutes across the United States.

The institutes will be led by universities including MIT, Carnegie Mellon University, and Stanford University. Each institute will partner with industry leaders and government agencies.

The Defense Advanced Research Projects Agency (DARPA) will collaborate on projects related to AI safety and national security applications.

The European Union has also taken action, with the European Commission proposing comprehensive AI regulations. The proposal follows input from UNESCO on ethical AI development.

In the private sector, venture capital firms like Sequoia Capital and Andreessen Horowitz have invested billions in AI startups. Y Combinator has accelerated dozens of AI companies through its program.`,
    goldEntities: [
      {
        name: "National Science Foundation",
        description:
          "US agency providing $140M in funding for AI research institutes.",
      },
      {
        name: "MIT",
        description:
          "University leading one of the new AI research institutes.",
      },
      {
        name: "Carnegie Mellon University",
        description:
          "University leading one of the new AI research institutes.",
      },
      {
        name: "Stanford University",
        description:
          "University leading one of the new AI research institutes.",
      },
      {
        name: "DARPA",
        description:
          "Defense Advanced Research Projects Agency, collaborating on AI safety.",
      },
      {
        name: "European Commission",
        description: "EU body proposing comprehensive AI regulations.",
      },
      {
        name: "UNESCO",
        description: "Provided input on ethical AI development.",
      },
      {
        name: "Sequoia Capital",
        description: "Venture capital firm investing billions in AI startups.",
      },
      {
        name: "Andreessen Horowitz",
        description: "Venture capital firm investing billions in AI startups.",
      },
      {
        name: "Y Combinator",
        description: "Startup accelerator for AI companies.",
      },
    ],
    irrelevantEntities: [],
    wrongTypeEntities: [],
  },
  {
    name: "Misleading prompt - seeking people but context has companies",
    entityType: {
      $id: "https://hash.ai/@h/types/entity-type/person/v/1",
      title: "Person",
      description: "A human person",
    },
    relevantEntitiesPrompt:
      "People working on large language models and AI research",
    context: `Major tech companies are racing to develop the most powerful large language models.

OpenAI's GPT-4 and GPT-3.5 have set benchmarks for language generation capabilities. The company's ChatGPT product has attracted millions of users worldwide.

Google has responded with its own LLM offerings, including the Gemini model and earlier PaLM models. The company leverages its vast search data for training.

Anthropic developed Claude, focusing on constitutional AI principles to ensure safety and alignment.

Meta released Llama 2 as an open-source alternative, available for commercial use.

Cohere provides enterprise-focused language models for business applications.

Microsoft, through its partnership with OpenAI, has integrated GPT models into its product suite including Copilot.`,
    goldEntities: [],
    irrelevantEntities: [],
    wrongTypeEntities: [
      { name: "OpenAI", description: "Developer of GPT-4 and ChatGPT" },
      { name: "Google", description: "Developer of Gemini and PaLM models" },
      { name: "Anthropic", description: "Developer of Claude" },
      { name: "Meta", description: "Developer of Llama 2" },
      { name: "Cohere", description: "Provider of enterprise language models" },
      {
        name: "Microsoft",
        description: "Partner of OpenAI, integrating GPT models",
      },
    ],
  },
  {
    name: "Complex entity disambiguation - similar names",
    entityType: {
      $id: "https://hash.ai/@h/types/entity-type/company/v/1",
      title: "Company",
      description:
        "A legal entity representing an association of people with a specific objective.",
    },
    relevantEntitiesPrompt: "Technology companies",
    context: `Nintendo of America announced strong sales for the Nintendo Switch console in North America. The subsidiary, based in Redmond, Washington, reported that the Switch has outsold previous Nintendo consoles in the region.

Meanwhile, Nintendo Co., Ltd., the parent company headquartered in Kyoto, Japan, revealed global financial results showing revenue growth across all markets.

Nintendo of Europe, another regional subsidiary, confirmed similar trends in European markets, with particularly strong sales in the UK and Germany.

The success comes as Meta Platforms continues to invest in VR gaming through its Meta Quest devices, competing in the gaming hardware space.`,
    goldEntities: [
      {
        name: "Nintendo of America",
        description:
          "Regional subsidiary of Nintendo based in Redmond, Washington, handling North American operations.",
      },
      {
        name: "Nintendo Co., Ltd.",
        description:
          "Parent company headquartered in Kyoto, Japan, global gaming company.",
      },
      {
        name: "Nintendo of Europe",
        description: "Regional subsidiary handling European market operations.",
      },
      {
        name: "Meta Platforms",
        description: "Company investing in VR gaming with Meta Quest devices.",
      },
    ],
    irrelevantEntities: [],
    wrongTypeEntities: [],
  },
];

/**
 * Scoring weights (from original hash-ai-worker-ts evaluation logic)
 */
export const evaluationWeights = {
  /**
   * Penalty multiplier for missing gold entities
   * - If only gold entities: 1.0 (full weight)
   * - If gold + wrong type: 0.7
   * - If gold + irrelevant: 0.8
   * - If all three categories: 0.5
   */
  missingGoldEntities: (hasWrongType: boolean, hasIrrelevant: boolean) => {
    if (hasWrongType && hasIrrelevant) {
      return 0.5;
    }
    if (hasWrongType) {
      return 0.7;
    }
    if (hasIrrelevant) {
      return 0.8;
    }
    return 1.0;
  },

  /**
   * Penalty multiplier for identifying irrelevant entities (false positives)
   */
  irrelevantEntities: 0.2,

  /**
   * Penalty multiplier for wrong-type entities
   * Calculated as: 1 - missingWeight - irrelevantWeight
   */
  wrongTypeEntities: (missingWeight: number, irrelevantWeight: number) =>
    1 - missingWeight - irrelevantWeight,
};

/**
 * Calculate evaluation score based on extraction results
 *
 * Score formula (from hash-ai-worker-ts):
 * score = 1.0 - (missingPenalty + irrelevantPenalty + wrongTypePenalty)
 *
 * @param testCase - The test case with ground truth
 * @param extractedEntityNames - Names of entities extracted by the system
 * @returns Score between 0 and 1 (1 = perfect)
 */
export function calculateNERScore(
  testCase: NERTestCase,
  extractedEntityNames: string[],
): {
  score: number;
  report: string;
  breakdown: {
    foundGold: string[];
    missedGold: string[];
    foundIrrelevant: string[];
    foundWrongType: string[];
  };
} {
  const extractedSet = new Set(extractedEntityNames);

  const goldSet = new Set(testCase.goldEntities.map((e) => e.name));
  const irrelevantSet = new Set(testCase.irrelevantEntities.map((e) => e.name));
  const wrongTypeSet = new Set(testCase.wrongTypeEntities.map((e) => e.name));

  // Calculate intersections
  const foundGold = extractedSet.intersection(goldSet);
  const missedGold = goldSet.difference(extractedSet);
  const foundIrrelevant = extractedSet.intersection(irrelevantSet);
  const foundWrongType = extractedSet.intersection(wrongTypeSet);

  const hasGold = goldSet.size > 0;
  const hasWrongType = wrongTypeSet.size > 0;
  const hasIrrelevant = irrelevantSet.size > 0;

  let score = 1.0;

  // Missing gold entities penalty
  if (hasGold) {
    const missingWeight = evaluationWeights.missingGoldEntities(
      hasWrongType,
      hasIrrelevant,
    );
    const missingPenalty = missingWeight * (missedGold.size / goldSet.size);
    score -= missingPenalty;
  }

  // Irrelevant entities penalty
  if (hasIrrelevant) {
    const irrelevantPenalty =
      evaluationWeights.irrelevantEntities *
      (foundIrrelevant.size / irrelevantSet.size);
    score -= irrelevantPenalty;
  }

  // Wrong type entities penalty
  if (hasWrongType) {
    const missingWeight = evaluationWeights.missingGoldEntities(
      hasWrongType,
      hasIrrelevant,
    );
    const wrongTypeWeight = evaluationWeights.wrongTypeEntities(
      missingWeight,
      evaluationWeights.irrelevantEntities,
    );
    const wrongTypePenalty =
      wrongTypeWeight * (foundWrongType.size / wrongTypeSet.size);
    score -= wrongTypePenalty;
  }

  const report =
    `Extracted ${extractedEntityNames.length} entities total. ` +
    `Found ${foundGold.size}/${goldSet.size} gold entities. ` +
    `Incorrectly identified ${foundWrongType.size} wrong-type entities. ` +
    `Incorrectly identified ${foundIrrelevant.size} irrelevant entities.`;

  return {
    score: Math.max(0, score),
    report,
    breakdown: {
      foundGold: [...foundGold],
      missedGold: [...missedGold],
      foundIrrelevant: [...foundIrrelevant],
      foundWrongType: [...foundWrongType],
    },
  };
}
