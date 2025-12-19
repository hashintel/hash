> Essential architectural patterns from Anthropic’s two articles re agent harnesses:
> - https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
> - https://www.anthropic.com/research/building-effective-agents

## Patterns

### 1. Two-agent separation: Initializer + Worker

**Pattern**: Use distinct prompts for first-run setup vs. subsequent execution sessions. The initializer creates durable project scaffolding; each worker session operates cold but orients via artifacts.

**Potential R&D translation**: Initializer agent generates a hypothesis backlog, experiment registry, and evidence log from a high-level research question. Worker agents pick one hypothesis per session, design experiments, run them, log results, and commit artifacts (code, data, analysis notebooks).

### 2. Externalized memory schema

**Pattern**: Store state in structured files (JSON feature list, progress log, git history) that agents read/write, not in context. This prevents amnesia and spec drift.

**Potential R&D translation**: Maintain a `hypotheses.json` (each with `status: failing/passing`, validation criteria), `experiments.log` (timestamp, method, outcome), and `evidence/` directory. Agents only flip status after meeting predefined validation checks.

### 3. Incremental progress with clean-state discipline

**Pattern**: One feature/hypothesis per session; end with mergeable state (tests pass, docs updated, progress logged). This avoids half-implemented, undocumented messes.

**Potential R&D translation**: Each session tackles one hypothesis or experiment. Close with reproducible analysis, committed data pipeline, and updated documentation. If validation fails, revert and log why.

### 4. Standardized boot-up ritual

**Pattern**: Every worker session runs the same orientation sequence: read progress, read feature list, check git history, run basic tests, then act. This saves tokens and enforces consistency.

**Potential R&D translation**: Worker agent always: (1) reads `experiments.log` and `hypotheses.json`, (2) pulls latest data/analysis commits, (3) runs a quick sanity check (e.g., data schemas, environment health), (4) picks highest-priority untested hypothesis.

### 5. Self-verification before status change

**Pattern**: Agent must test end-to-end (e.g., browser automation) before marking a feature as passing. Prevents premature declaration of success.

**Potential R&D translation**: Agent must execute validation protocol (statistical tests, replication checks, peer-review script) and log evidence before marking a hypothesis as supported/refuted. No status flips without documented, reproducible validation.

### 6. Workflow vs. agent: Use predictable paths where possible

**Pattern**: Prefer workflows (prompt chaining, routing, parallelization) for well-defined subtasks; reserve full agent autonomy for open-ended problems. This reduces cost and error compounding.

**Potential R&D translation**: Use prompt chaining for literature review → hypothesis generation → experimental design. Use routing to dispatch to domain-specific tools (wet lab vs. simulation vs. data analysis). Use orchestrator-workers only when subtasks are unpredictable.

### 7. Orchestrator-workers for dynamic decomposition

**Pattern**: Central LLM breaks complex tasks into subtasks, delegates to worker LLMs, synthesizes results. Useful when you can’t predefine all steps.

**Potential R&D translation**: For multi-method research programs, orchestrator agent decomposes “prove mechanism X” into “run assay A,” “fit model B,” “review literature C,” then aggregates evidence across workers.

### 8. Evaluator-optimizer loop for refinement

**Pattern**: One LLM generates, another evaluates output against criteria, and they iterate. Effective when feedback measurably improves results.

**Potential R&D translation**: Generator agent drafts experiment protocol; evaluator agent checks for statistical power, confounders, and ethics compliance. Iterate until criteria met.

### 9. Agent-computer interface (ACI) design

**Pattern**: Tools must be natural (close to internet text formats), well-documented with examples, and error-resistant (poka-yoke). Test tool usage extensively.

**Potential R&D translation**: Design tools like `run_experiment(params)`, `validate_hypothesis(id)`, and `log_evidence(data)` with clear JSON schemas, example payloads, and guardrails (e.g., mandatory parameter ranges). Test that agents call them correctly.

### 10. Transparency in planning

**Pattern**: Show agent’s reasoning steps explicitly (e.g., “I’ll start by getting my bearings”). This aids debugging and trust.

**Potential R&D translation**: Agent outputs structured plan: “First, read backlog; second, select hypothesis H3; third, design experiment; fourth, execute; fifth, validate and log.” Log these plans to `plans.log` for audit.

## Synthesis

**Extrapolated core R&D harness blueprint**: Initializer creates `hypotheses.json`, `experiments.log`, `validation_criteria/`; each worker session follows boot ritual, picks one hypothesis, runs experiment, validates against criteria, commits artifacts, updates log, and exits. This moves the moat from model IQ to domain-specific memory schema and testing loops.
