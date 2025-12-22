/**
 * Mock Plan Outputs — Cached PlanSpec for Each Fixture
 *
 * These are realistic PlanSpec outputs that match what the LLM would generate
 * for each fixture. Used for:
 * - Testing the TUI without burning API tokens
 * - Running in CI
 * - Faster iteration during development
 *
 * Run with: npx tsx src/mastra/scripts/demo-plan-execution.ts --mock
 */

import type { PlanSpec } from "../schemas/plan-spec";

// =============================================================================
// SUMMARIZE PAPERS (Simplest)
// =============================================================================

/**
 * Mock plan for summarize-papers fixture.
 * Pattern: Parallel research → synthesize
 */
export const mockSummarizePapersPlan: PlanSpec = {
  id: "summarize-papers-plan",
  goalSummary:
    "Summarize 3 recent papers on RAG and produce a comparison table",
  aimType: "describe",
  requirements: [
    {
      id: "R1",
      description: "Find and summarize 3 recent RAG papers (last 2 years)",
      priority: "must",
    },
    {
      id: "R2",
      description:
        "Compare architecture, retrieval method, performance, limitations",
      priority: "must",
    },
    {
      id: "R3",
      description: "Produce a comparison table",
      priority: "must",
    },
  ],
  hypotheses: [],
  steps: [
    {
      type: "research",
      id: "S1",
      description: "Search for recent RAG papers focusing on architecture",
      dependencyIds: [],
      requirementIds: ["R1"],
      inputs: [],
      outputs: [
        { name: "paper_1", description: "First RAG paper with summary" },
      ],
      query:
        "Recent retrieval-augmented generation architecture papers 2023-2024",
      stoppingRule:
        "Find 1 high-quality paper with clear architecture description",
      concurrent: true,
      executor: { kind: "agent", ref: "literature-searcher" },
    },
    {
      type: "research",
      id: "S2",
      description: "Search for RAG papers focusing on retrieval methods",
      dependencyIds: [],
      requirementIds: ["R1"],
      inputs: [],
      outputs: [
        { name: "paper_2", description: "Second RAG paper with summary" },
      ],
      query: "RAG retrieval methods dense sparse hybrid 2023-2024",
      stoppingRule: "Find 1 high-quality paper with novel retrieval approach",
      concurrent: true,
      executor: { kind: "agent", ref: "literature-searcher" },
    },
    {
      type: "research",
      id: "S3",
      description: "Search for RAG papers with performance benchmarks",
      dependencyIds: [],
      requirementIds: ["R1"],
      inputs: [],
      outputs: [
        { name: "paper_3", description: "Third RAG paper with summary" },
      ],
      query: "RAG performance benchmarks evaluation 2023-2024",
      stoppingRule: "Find 1 paper with comprehensive performance evaluation",
      concurrent: true,
      executor: { kind: "agent", ref: "literature-searcher" },
    },
    {
      type: "synthesize",
      id: "S4",
      description: "Create comparison table from all three papers",
      dependencyIds: ["S1", "S2", "S3"],
      requirementIds: ["R2", "R3"],
      inputs: [
        { name: "paper_1", description: "First paper" },
        { name: "paper_2", description: "Second paper" },
        { name: "paper_3", description: "Third paper" },
      ],
      outputs: [
        {
          name: "comparison_table",
          description: "Structured comparison of RAG approaches",
        },
      ],
      mode: "integrative",
      concurrent: false,
      executor: { kind: "agent", ref: "result-synthesizer" },
    },
  ],
  unknownsMap: {
    knownKnowns: [
      "RAG combines retrieval with generation",
      "Multiple architectural approaches exist",
    ],
    knownUnknowns: [
      "Which papers are most relevant to our use case",
      "How to fairly compare different evaluation metrics",
    ],
    unknownUnknowns: [
      {
        potentialSurprise: "All recent papers focus on same approach",
        detectionSignal:
          "Unable to find diverse architectures in search results",
      },
    ],
    communityCheck:
      "Paper selection criteria and comparison dimensions should be transparent",
  },
  estimatedComplexity: "low",
};

// =============================================================================
// EXPLORE AND RECOMMEND (Parallel Research + Evaluative Synthesis)
// =============================================================================

/**
 * Mock plan for explore-and-recommend fixture.
 * Pattern: Parallel research on options → evaluative synthesis → recommendation
 */
export const mockExploreAndRecommendPlan: PlanSpec = {
  id: "explore-and-recommend-plan",
  goalSummary:
    "Research vector database indexing approaches and recommend best for our use case",
  aimType: "explain",
  requirements: [
    {
      id: "R1",
      description: "Research HNSW indexing approach",
      priority: "must",
    },
    {
      id: "R2",
      description: "Research IVF indexing approach",
      priority: "must",
    },
    {
      id: "R3",
      description: "Research other promising approaches",
      priority: "should",
    },
    {
      id: "R4",
      description:
        "Evaluate against: 10M docs, <100ms latency, similarity + filtering",
      priority: "must",
    },
    {
      id: "R5",
      description: "Provide justified recommendation",
      priority: "must",
    },
  ],
  hypotheses: [],
  steps: [
    {
      type: "research",
      id: "S1",
      description: "Deep dive into HNSW indexing",
      dependencyIds: [],
      requirementIds: ["R1"],
      inputs: [],
      outputs: [
        {
          name: "hnsw_analysis",
          description: "HNSW characteristics, tradeoffs, benchmarks",
        },
      ],
      query:
        "HNSW hierarchical navigable small world index performance characteristics filtered queries",
      stoppingRule:
        "Understand latency at scale, memory requirements, and filtering support",
      concurrent: true,
      executor: { kind: "agent", ref: "literature-searcher" },
    },
    {
      type: "research",
      id: "S2",
      description: "Deep dive into IVF indexing",
      dependencyIds: [],
      requirementIds: ["R2"],
      inputs: [],
      outputs: [
        {
          name: "ivf_analysis",
          description: "IVF characteristics, tradeoffs, benchmarks",
        },
      ],
      query:
        "IVF inverted file index vector database performance nlist nprobe tradeoffs",
      stoppingRule:
        "Understand build time, query latency, and accuracy tradeoffs",
      concurrent: true,
      executor: { kind: "agent", ref: "literature-searcher" },
    },
    {
      type: "research",
      id: "S3",
      description: "Research hybrid and emerging approaches",
      dependencyIds: [],
      requirementIds: ["R3"],
      inputs: [],
      outputs: [
        {
          name: "other_approaches",
          description: "Analysis of DiskANN, ScaNN, and hybrid methods",
        },
      ],
      query: "DiskANN ScaNN hybrid vector index billion scale filtered search",
      stoppingRule: "Identify 2-3 promising alternatives to HNSW and IVF",
      concurrent: true,
      executor: { kind: "agent", ref: "literature-searcher" },
    },
    {
      type: "synthesize",
      id: "S4",
      description: "Compare all approaches against our requirements",
      dependencyIds: ["S1", "S2", "S3"],
      requirementIds: ["R4"],
      inputs: [
        {
          name: "hnsw_analysis",
          description: "HNSW research",
        },
        { name: "ivf_analysis", description: "IVF research" },
        {
          name: "other_approaches",
          description: "Other approaches",
        },
      ],
      outputs: [
        {
          name: "comparison_matrix",
          description:
            "Comparison against latency, memory, filtering requirements",
        },
      ],
      mode: "integrative",
      concurrent: false,
      executor: { kind: "agent", ref: "result-synthesizer" },
    },
    {
      type: "synthesize",
      id: "S5",
      description: "Evaluate options and make recommendation",
      dependencyIds: ["S4"],
      requirementIds: ["R5"],
      inputs: [
        {
          name: "comparison_matrix",
          description: "Comparison results",
        },
      ],
      outputs: [
        {
          name: "recommendation",
          description: "Justified recommendation for our use case",
        },
      ],
      mode: "evaluative",
      evaluateAgainst: [
        "Query latency <100ms at 10M scale",
        "Memory efficiency for production deployment",
        "Support for metadata filtering",
        "Index build time within 3-week timeline",
      ],
      concurrent: false,
      executor: { kind: "agent", ref: "progress-evaluator" },
    },
  ],
  unknownsMap: {
    knownKnowns: [
      "HNSW is widely used for approximate nearest neighbor search",
      "IVF offers controllable accuracy-speed tradeoff",
      "Filtering adds complexity to vector search",
    ],
    knownUnknowns: [
      "How filtering performance scales with our data distribution",
      "Whether hybrid approaches are production-ready",
      "Actual memory requirements for our embedding dimensions",
    ],
    unknownUnknowns: [
      {
        potentialSurprise:
          "Our specific query patterns don't match benchmark assumptions",
        detectionSignal:
          "Large gap between published benchmarks and our prototype results",
      },
    ],
    communityCheck:
      "Benchmark methodology and requirement prioritization should be reviewable",
  },
  estimatedComplexity: "medium",
};

// =============================================================================
// HYPOTHESIS VALIDATION (With Experiments)
// =============================================================================

/**
 * Mock plan for hypothesis-validation fixture.
 * Pattern: Research → hypothesis → experiment design → run → evaluate
 */
export const mockHypothesisValidationPlan: PlanSpec = {
  id: "hypothesis-validation-plan",
  goalSummary:
    "Test whether fine-tuning outperforms few-shot prompting for entity extraction",
  aimType: "predict",
  requirements: [
    {
      id: "R1",
      description: "Establish baseline with few-shot GPT-4",
      priority: "must",
    },
    {
      id: "R2",
      description: "Fine-tune Llama 3 8B on labeled data",
      priority: "must",
    },
    {
      id: "R3",
      description: "Compare F1 scores rigorously",
      priority: "must",
    },
    {
      id: "R4",
      description: "Consider inference cost for production",
      priority: "should",
    },
    {
      id: "R5",
      description: "Justify recommendation to stakeholders",
      priority: "must",
    },
  ],
  hypotheses: [
    {
      id: "H1",
      statement:
        "Fine-tuned Llama 3 8B will achieve higher F1 than few-shot GPT-4 on legal entity extraction",
      assumptions: [
        "5,000 labeled examples are sufficient for fine-tuning",
        "Legal entity extraction benefits from domain-specific training",
        "F1 score is an appropriate metric for this task",
      ],
      testableVia:
        "Run both approaches on held-out test set and compare F1 scores",
      status: "untested",
    },
    {
      id: "H2",
      statement:
        "Fine-tuned model will have significantly lower inference cost per document",
      assumptions: [
        "Smaller model = lower cost",
        "Fine-tuning doesn't require longer context",
      ],
      testableVia: "Measure tokens/latency per document for both approaches",
      status: "untested",
    },
  ],
  steps: [
    {
      type: "research",
      id: "S1",
      description: "Review prior work on fine-tuning vs few-shot for NER",
      dependencyIds: [],
      requirementIds: ["R1"],
      inputs: [],
      outputs: [
        {
          name: "prior_work",
          description:
            "Summary of relevant papers and expected performance gaps",
        },
      ],
      query:
        "Fine-tuning vs few-shot prompting named entity recognition legal documents comparison",
      stoppingRule: "Find 3+ relevant comparisons with quantitative results",
      concurrent: true,
      executor: { kind: "agent", ref: "literature-searcher" },
    },
    {
      type: "experiment",
      id: "S2",
      description: "Establish few-shot GPT-4 baseline",
      dependencyIds: ["S1"],
      requirementIds: ["R1"],
      inputs: [
        {
          name: "prior_work",
          description: "Inform prompt design",
        },
      ],
      outputs: [
        {
          name: "baseline_results",
          description: "GPT-4 F1 scores on test set",
        },
      ],
      mode: "exploratory",
      hypothesisIds: ["H1"],
      procedure:
        "Design 5-shot prompt with representative examples, run on 500 test documents, compute F1",
      expectedOutcomes: [
        "F1 between 0.7-0.9 based on prior work",
        "Identify challenging entity types",
      ],
      successCriteria: [
        "Complete evaluation on all test documents",
        "F1 score computed for each entity type",
      ],
      concurrent: true,
      executor: { kind: "agent", ref: "experiment-runner" },
    },
    {
      type: "develop",
      id: "S3",
      description: "Fine-tune Llama 3 8B on training data",
      dependencyIds: ["S1"],
      requirementIds: ["R2"],
      inputs: [
        {
          name: "prior_work",
          description: "Inform fine-tuning approach",
        },
      ],
      outputs: [
        {
          name: "fine_tuned_model",
          description: "Fine-tuned Llama 3 8B checkpoint",
        },
      ],
      specification:
        "Fine-tune Llama 3 8B using 4,500 training examples with LoRA, 500 for validation",
      deliverables: [
        "Model checkpoint",
        "Training curves",
        "Validation F1 progression",
      ],
      concurrent: true,
      executor: { kind: "agent", ref: "code-writer" },
    },
    {
      type: "experiment",
      id: "S4",
      description: "Evaluate fine-tuned model on test set",
      dependencyIds: ["S3"],
      requirementIds: ["R3"],
      inputs: [
        {
          name: "fine_tuned_model",
          description: "Trained model",
        },
      ],
      outputs: [
        {
          name: "finetuned_results",
          description: "Fine-tuned model F1 scores on test set",
        },
      ],
      mode: "confirmatory",
      hypothesisIds: ["H1", "H2"],
      procedure:
        "Run fine-tuned model on same 500 test documents, compute F1, measure inference time",
      expectedOutcomes: [
        "If H1 true: F1 > baseline by >0.05",
        "If H1 false: F1 within 0.05 of baseline",
      ],
      successCriteria: [
        "Complete evaluation on all test documents",
        "Statistical significance computed",
      ],
      preregisteredCommitments: [
        "Use same test set as baseline",
        "Report all entity types, not just best performing",
        "Significance threshold: p < 0.05",
      ],
      concurrent: false,
      executor: { kind: "agent", ref: "experiment-runner" },
    },
    {
      type: "synthesize",
      id: "S5",
      description: "Analyze results and make recommendation",
      dependencyIds: ["S2", "S4"],
      requirementIds: ["R4", "R5"],
      inputs: [
        {
          name: "baseline_results",
          description: "GPT-4 baseline",
        },
        {
          name: "finetuned_results",
          description: "Fine-tuned results",
        },
      ],
      outputs: [
        {
          name: "recommendation",
          description: "Justified recommendation with supporting evidence",
        },
      ],
      mode: "evaluative",
      evaluateAgainst: [
        "F1 score comparison (primary metric)",
        "Inference cost at 10K docs/day",
        "Stakeholder explainability",
      ],
      concurrent: false,
      executor: { kind: "agent", ref: "progress-evaluator" },
    },
  ],
  unknownsMap: {
    knownKnowns: [
      "We have 5,000 high-quality labeled examples",
      "Legal NER includes: parties, dates, amounts, terms, obligations",
      "GPT-4 has strong few-shot capabilities",
    ],
    knownUnknowns: [
      "Optimal number of fine-tuning epochs",
      "Whether LoRA is sufficient or full fine-tuning needed",
      "Distribution shift between training and production documents",
    ],
    unknownUnknowns: [
      {
        potentialSurprise:
          "Legal documents have formatting that confuses the tokenizer",
        detectionSignal:
          "High error rate on documents with tables or unusual formatting",
      },
      {
        potentialSurprise: "Entity types have different optimal approaches",
        detectionSignal:
          "Large variance in F1 across entity types for one approach",
      },
    ],
    communityCheck:
      "Test set composition, prompt design, and fine-tuning hyperparameters should be documented",
  },
  estimatedComplexity: "high",
};

// =============================================================================
// CT DATABASE GOAL (Full R&D Cycle)
// =============================================================================

/**
 * Mock plan for ct-database-goal fixture.
 * Pattern: Multi-phase R&D with research, experimentation, and development
 */
export const mockCtDatabasePlan: PlanSpec = {
  id: "ct-database-plan",
  goalSummary:
    "Create a category-theory native database with competitive query performance",
  aimType: "intervene",
  requirements: [
    {
      id: "R1",
      description: "Literature review of CT in databases and PLs",
      priority: "must",
    },
    {
      id: "R2",
      description: "Feasibility: represent and query CT structures",
      priority: "must",
    },
    {
      id: "R3",
      description: "Performance benchmarks vs traditional approaches",
      priority: "must",
    },
    {
      id: "R4",
      description: "Prototype if experiments promising",
      priority: "should",
    },
    {
      id: "R5",
      description: "Explore functors for schema migrations",
      priority: "could",
    },
  ],
  hypotheses: [
    {
      id: "H1",
      statement:
        "CT concepts (objects, morphisms) can be efficiently indexed for query",
      assumptions: [
        "CT structures have regular patterns exploitable by indexes",
        "Query patterns are known in advance",
      ],
      testableVia: "Implement basic indexing and measure query latency",
      status: "untested",
    },
    {
      id: "H2",
      statement:
        "Functors can express schema migrations more naturally than ALTER TABLE",
      assumptions: [
        "Schema changes follow categorical patterns",
        "Users understand functor semantics",
      ],
      testableVia:
        "Implement functor-based migrations and compare to SQL migrations",
      status: "untested",
    },
    {
      id: "H3",
      statement:
        "Natural transformations can express data transformations type-safely",
      assumptions: [
        "Data transformations preserve structure",
        "Type system can encode naturality",
      ],
      testableVia: "Implement NT-based transforms and check type safety",
      status: "untested",
    },
  ],
  steps: [
    {
      type: "research",
      id: "S1",
      description: "Survey CT foundations in database theory",
      dependencyIds: [],
      requirementIds: ["R1"],
      inputs: [],
      outputs: [
        {
          name: "db_theory_survey",
          description: "Survey of categorical database theory",
        },
      ],
      query:
        "Category theory database foundations functorial data migration categorical query language",
      stoppingRule: "Identify key papers: Spivak, Schultz, CQL",
      concurrent: true,
      executor: { kind: "agent", ref: "literature-searcher" },
    },
    {
      type: "research",
      id: "S2",
      description: "Survey CT in programming languages",
      dependencyIds: [],
      requirementIds: ["R1"],
      inputs: [],
      outputs: [
        { name: "pl_theory_survey", description: "Survey of CT in PLs" },
      ],
      query:
        "Category theory programming languages Haskell categorical semantics type theory",
      stoppingRule: "Understand how Haskell/ML encode CT concepts",
      concurrent: true,
      executor: { kind: "agent", ref: "literature-searcher" },
    },
    {
      type: "research",
      id: "S3",
      description:
        "Analyze existing CT-based systems (CQL, Algebraic Databases)",
      dependencyIds: [],
      requirementIds: ["R1"],
      inputs: [],
      outputs: [
        {
          name: "existing_systems",
          description: "Analysis of prior implementations",
        },
      ],
      query:
        "CQL categorical query language implementation Algebraic Databases performance",
      stoppingRule:
        "Document architecture, limitations, and performance of 2+ systems",
      concurrent: true,
      executor: { kind: "agent", ref: "literature-searcher" },
    },
    {
      type: "synthesize",
      id: "S4",
      description: "Synthesize research into design principles",
      dependencyIds: ["S1", "S2", "S3"],
      requirementIds: ["R1"],
      inputs: [
        {
          name: "db_theory_survey",
          description: "DB theory",
        },
        {
          name: "pl_theory_survey",
          description: "PL theory",
        },
        {
          name: "existing_systems",
          description: "Existing systems",
        },
      ],
      outputs: [
        {
          name: "design_principles",
          description: "Principles for CT-native database design",
        },
      ],
      mode: "integrative",
      concurrent: false,
      executor: { kind: "agent", ref: "result-synthesizer" },
    },
    {
      type: "experiment",
      id: "S5",
      description: "Feasibility: Implement and index basic CT structures",
      dependencyIds: ["S4"],
      requirementIds: ["R2"],
      inputs: [
        {
          name: "design_principles",
          description: "Design guidance",
        },
      ],
      outputs: [
        {
          name: "feasibility_results",
          description: "Can CT structures be indexed efficiently?",
        },
      ],
      mode: "exploratory",
      hypothesisIds: ["H1"],
      procedure:
        "Implement objects/morphisms in Rust, create B-tree indexes, measure query latency",
      expectedOutcomes: [
        "Query latency within 10x of relational for simple queries",
        "Identify indexing challenges",
      ],
      successCriteria: [
        "Complete implementation of basic structures",
        "Benchmark results for 3 query types",
      ],
      concurrent: false,
      executor: { kind: "agent", ref: "experiment-runner" },
    },
    {
      type: "experiment",
      id: "S6",
      description: "Performance: Benchmark against PostgreSQL",
      dependencyIds: ["S5"],
      requirementIds: ["R3"],
      inputs: [
        {
          name: "feasibility_results",
          description: "Feasibility results",
        },
      ],
      outputs: [
        { name: "benchmark_results", description: "Performance comparison" },
      ],
      mode: "confirmatory",
      hypothesisIds: ["H1"],
      procedure:
        "Define 5 benchmark queries, run on equivalent PostgreSQL schema, compare latency",
      expectedOutcomes: [
        "If promising: within 2x of PostgreSQL",
        "If not: identify bottlenecks",
      ],
      successCriteria: [
        "All 5 queries benchmarked",
        "Statistical confidence in results",
      ],
      preregisteredCommitments: [
        "Same data size for both systems",
        "Warm cache for both",
        "Report median and p99 latency",
      ],
      concurrent: false,
      executor: { kind: "agent", ref: "experiment-runner" },
    },
    {
      type: "synthesize",
      id: "S7",
      description: "Go/no-go decision on prototype development",
      dependencyIds: ["S6"],
      requirementIds: ["R4"],
      inputs: [
        {
          name: "benchmark_results",
          description: "Benchmark results",
        },
      ],
      outputs: [
        { name: "go_decision", description: "Decision and justification" },
      ],
      mode: "evaluative",
      evaluateAgainst: [
        "Performance within 2x of traditional DB",
        "Clear path to optimization",
        "Team has capacity for 6+ month project",
      ],
      concurrent: false,
      executor: { kind: "agent", ref: "progress-evaluator" },
    },
    {
      type: "develop",
      id: "S8",
      description: "Develop prototype with functor-based migrations",
      dependencyIds: ["S7"],
      requirementIds: ["R4", "R5"],
      inputs: [{ name: "go_decision", description: "Go decision" }],
      outputs: [
        {
          name: "prototype",
          description: "Working prototype with functor migrations",
        },
      ],
      specification:
        "Build on feasibility code, add functor-based schema migrations, basic query language",
      deliverables: [
        "Rust crate with CT primitives",
        "Migration DSL",
        "Query language parser",
        "Documentation",
      ],
      concurrent: false,
      executor: { kind: "agent", ref: "code-writer" },
    },
  ],
  unknownsMap: {
    knownKnowns: [
      "Category theory has been applied to databases (Spivak et al.)",
      "CQL exists as prior art",
      "Rust is suitable for database implementation",
    ],
    knownUnknowns: [
      "Performance characteristics at scale",
      "User experience of CT-based query language",
      "Integration path with existing systems",
    ],
    unknownUnknowns: [
      {
        potentialSurprise: "CT abstraction level too high for practical use",
        detectionSignal: "Users struggle to express common queries",
      },
      {
        potentialSurprise:
          "Impedance mismatch with traditional systems insurmountable",
        detectionSignal: "Every integration requires complex translation layer",
      },
      {
        potentialSurprise:
          "Theoretical elegance doesn't translate to performance",
        detectionSignal: "Fundamental data structure limitations emerge",
      },
    ],
    communityCheck:
      "Benchmark methodology, design decisions, and CT-to-performance tradeoffs should be documented for review",
  },
  estimatedComplexity: "very-high",
};

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * Map of fixture ID to mock plan for easy lookup.
 */
export const MOCK_PLANS: Record<string, PlanSpec> = {
  "summarize-papers": mockSummarizePapersPlan,
  "explore-and-recommend": mockExploreAndRecommendPlan,
  "hypothesis-validation": mockHypothesisValidationPlan,
  "ct-database-goal": mockCtDatabasePlan,
};

/**
 * Get mock plan for a fixture ID.
 */
export function getMockPlan(fixtureId: string): PlanSpec | undefined {
  return MOCK_PLANS[fixtureId];
}
