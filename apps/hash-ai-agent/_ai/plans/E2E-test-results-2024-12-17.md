# E2E Test Results — Planning Pipeline

**Date**: 2024-12-17  
**Test File**: `src/mastra/workflows/planning-workflow.test.ts`  
**Duration**: ~98 seconds total

## Overview

These are the console outputs from running the E2E planning pipeline tests against all 4 fixtures. The tests generate plans using the planner agent, validate them, analyze topology, and run deterministic scorers.

**Results**: 3/4 fixtures pass, 1 fails (known issue with preregistered commitments)

---

## Individual Fixture Tests

<details>
<summary>summarize-papers (4.2s) — PASS</summary>

```
============================================================
  FIXTURE: summarize-papers
============================================================
Goal: Summarize 3 recent papers on retrieval-augmented generation (RAG) 
           and produce a comparis...

--- Generating Plan ---
  ID: rag-paper-summary-comparison-plan
  Goal Summary: Summarize 3 recent RAG papers and create a comparison table....
  Steps: 3
  Requirements: 3
  Hypotheses: 0
  Step types: {"research":2,"synthesize":1}

--- Validation ---
  Valid: true
  Errors: 0

--- Topology Analysis ---
  Entry points: [S1]
  Exit points: [S3]
  Critical path: 3 steps
  Parallel groups: 3

--- Deterministic Scores ---
  Overall: 92.8%
  Structure: 76.7%
  Coverage: 100.0%
  Experiment Rigor: 100.0%
  Unknowns Coverage: 93.3%

--- Expected Characteristics Check ---
  All expected characteristics met

  (LLM scorers skipped — set RUN_LLM_SCORERS=true to enable)

  Duration: 4.2s
```

</details>

<details>
<summary>explore-and-recommend (13.9s) — PASS (with notes)</summary>

```
============================================================
  FIXTURE: explore-and-recommend
============================================================
Goal: Research approaches to vector database indexing and recommend 
           the best approach for our ...

--- Generating Plan ---
  ID: vector-db-indexing-research-plan
  Goal Summary: Research vector database indexing approaches and recommend the best for 10M docu...
  Steps: 11
  Requirements: 7
  Hypotheses: 2
  Step types: {"research":4,"synthesize":5,"experiment":2}

--- Validation ---
  Valid: true
  Errors: 0

--- Topology Analysis ---
  Entry points: [S1]
  Exit points: [S11]
  Critical path: 8 steps
  Parallel groups: 8

--- Deterministic Scores ---
  Overall: 92.5%
  Structure: 85.9%
  Coverage: 92.9%
  Experiment Rigor: 92.5%
  Unknowns Coverage: 100.0%

--- Expected Characteristics Check ---
  Issues:
    - Unexpected hypotheses: 2
    - Unexpected experiment steps: 2

  (LLM scorers skipped — set RUN_LLM_SCORERS=true to enable)

  Duration: 13.9s
```

**Note**: The LLM generated hypotheses and experiments that the fixture didn't expect. This is not a validation failure — the plan is valid, just more thorough than the minimum expected.

</details>

<details>
<summary>hypothesis-validation (15.4s) — PASS</summary>

```
============================================================
  FIXTURE: hypothesis-validation
============================================================
Goal: Test whether fine-tuning a small LLM (e.g., Llama 3 8B) on 
           domain-specific data outperfo...

--- Generating Plan ---
  ID: entity-extraction-llm-comparison-plan
  Goal Summary: Compare fine-tuned small LLM vs. few-shot large LLM for entity extraction....
  Steps: 12
  Requirements: 4
  Hypotheses: 2
  Step types: {"research":3,"synthesize":3,"experiment":3,"develop":3}

--- Validation ---
  Valid: true
  Errors: 0

--- Topology Analysis ---
  Entry points: [S1, S2, S3]
  Exit points: [S12]
  Critical path: 8 steps
  Parallel groups: 8

--- Deterministic Scores ---
  Overall: 95.3%
  Structure: 86.0%
  Coverage: 100.0%
  Experiment Rigor: 95.0%
  Unknowns Coverage: 100.0%

--- Expected Characteristics Check ---
  All expected characteristics met

  (LLM scorers skipped — set RUN_LLM_SCORERS=true to enable)

  Duration: 15.4s
```

</details>

<details>
<summary>ct-database-goal (15.8s) — FAIL</summary>

```
============================================================
  FIXTURE: ct-database-goal
============================================================
Goal: Create a backend language and database that is natively aligned 
           with category-theoretica...

--- Generating Plan ---
  ID: ct-db-backend-plan
  Goal Summary: Create a backend language and database natively aligned with category theory, su...
  Steps: 17
  Requirements: 8
  Hypotheses: 4
  Step types: {"research":4,"synthesize":8,"experiment":4,"develop":1}

--- Validation ---
  Valid: false
  Errors: 1
    [MISSING_PREREGISTERED_COMMITMENTS] Confirmatory experiment "S14" must have preregistered commitments

  Duration: 15.8s
```

**Failure Reason**: The LLM generated a confirmatory experiment (S14) without including `preregisteredCommitments`. This is a known issue — the prompt needs to more strongly emphasize this requirement, or a revision loop needs to catch and fix it.

</details>

---

## Summary Report Test

<details>
<summary>Summary Report (49.0s) — runs all fixtures sequentially</summary>

```
============================================================
  SUMMARY REPORT
============================================================

Total: 4 fixtures
Successful: 3
Failed: 1

Failures:
  - ct-database-goal: Validation failed: Confirmatory experiment "S14" must have preregistered commitments

Deterministic Scores:
  Fixture                     | Overall | Structure | Coverage | Rigor | Unknowns
  -------------------------------------------------------------------------------------
  summarize-papers             |     93% |       77% |     100% |  100% |      93%
  explore-and-recommend        |     92% |       86% |      93% |   93% |     100%
  hypothesis-validation        |     95% |       86% |     100% |   95% |     100%

Total duration: 49.0s
```

</details>

---

## Analysis

### What's Working

1. **Schema-LLM alignment is good** — 3/4 plans pass validation on first try
2. **Deterministic scores are high** (92-95%) indicating quality plans
3. **Step type variety** — LLM uses all 4 step types appropriately
4. **Unknowns coverage** — LLM consistently produces good epistemic documentation

### Known Issue

The `ct-database-goal` fixture fails due to **MISSING_PREREGISTERED_COMMITMENTS** — the LLM generates confirmatory experiments without the required `preregisteredCommitments` array.

**Root cause**: The prompt instruction about preregisteredCommitments may not be prominent enough for complex plans.

**Potential fixes**:

1. Strengthen prompt wording around preregisteredCommitments requirement
2. Implement revision workflow loop (validator feedback → regenerate)
3. Add few-shot example showing proper confirmatory experiment structure

### Next Steps

See `PLAN-task-decomposition.md` Section 18 for the revision workflow implementation plan.
