# RFC: Mastra-Based NER (Entity Inference) for HASH

Status: Draft
Author: (you)
Last updated: 2026-01-29

## Overview

This RFC proposes introducing the Mastra agent/workflow framework into HASH's entity inference ("NER") system to materially improve:

1. Observability and debugging of LLM-driven pipelines (step-level traces, token/cost/latency attribution),
2. Evaluation (repeatable quality measurement, regression detection, optional production sampling),
3. Maintainability (separating retry/validation scaffolding from domain logic with typed step boundaries).

The key design constraint is that HASH's current architecture relies on Temporal for durability and orchestration, and on the HASH Graph for persistence, provenance, and usage accounting. The proposal therefore adopts a hybrid approach:

- Temporal remains the durability shell and the system-of-record for long-running orchestration.
- Mastra owns the bounded LLM inference chain(s) for entity inference on extracted content.
- Graph persistence (entities, claims, usage records, provenance objects) remains in HASH/Temporal initially.

This RFC is intentionally higher-level than an implementation specification; it focuses on proposals, rationale, and the conceptual architecture needed to proceed with implementation.

## Context: what “NER” means in HASH

HASH "NER" is not token tagging (BIO labels). It is schema-conditioned entity inference:

- Input: extracted content (text) + an ontology type selection (+ optional goal prompt).
- Output: typed entity proposals (`ProposedEntity[]`), optionally supported by claim/provenance data, suitable for deterministic resolution/merge and Graph persistence.

The system behaves more like a compiler pipeline than a classic NER tagger:
discover candidates -> infer structured fields -> validate -> persist and relate in a knowledge graph.

## Current state (summary)

Today, `hash-ai-worker-ts` implements entity inference via:

- Temporal workflows and a custom FlowDefinition DAG runner for orchestration,
- Imperative activities that embed multi-step LLM chains,
- A custom multi-provider LLM abstraction (`getLlmResponse`) with logging and usage tracking,
- Ad-hoc evaluation patterns in `.ai.test.ts` via a `MetricDefinition` harness,
- Strong coupling to Graph for provenance, claim creation, and usage record linking.

The existing NER chain patterns (two-pass discovery then detail; schema-guided structured outputs; iterative repair with validation feedback) are solid, but difficult to observe and evaluate at the granularity where improvements are typically made (per step / per model call).

## Problems we are solving (and why now)

1) Observability is fragmented
- LLM requests are logged, but there is no unified "flight recorder" view of workflow -> step -> model calls.
- Step-level latency and token attribution is not first-class, which slows iteration and debugging.

1b) Visibility is poor for both developers and end users
- In development, there is limited visibility into what is going in/out of each inference step and where time/cost accumulates.
- In product, users have limited visibility into step progress, timings, partial results, and usage/costs for AI-driven steps.

2) Evaluation exists but is not a system
- Tests exist, but evaluation is scattered, not standardized, and not designed for historical comparison or production sampling.
- There is no consistent mapping from "quality regression" to the step/model call that caused it.

3) Retry/validation logic is interleaved with domain logic
- Many parts of the pipeline combine orchestration, schema validation, retry scaffolding, and domain transformations in the same functions.
- This makes changes high-risk and discourages the kinds of small experiments that improve quality/cost over time.

4) Provenance must become more explicit for file-based inference
- For file/document-based inference, provenance UX requirements imply we need a generalized way to reference where a claim/property came from.
- A naive "just text" interface is insufficient if we want reviewable outputs, grounding, and UI highlighting.

## Goals

- Introduce step-level tracing and a coherent eval harness for entity inference.
- Keep Temporal durability and Graph integration unchanged during initial adoption.
- Improve developer and user visibility by making inference pipelines step-structured and introspectable (even if initial UI surfacing is incremental).
- Define a generalized, provenance-complete input interface for "extracted content" that supports both:
  - file-based inference (PDF/doc) and
  - web-based inference (via stored snapshots).
- Make chunking a first-class, traceable part of the inference workflow (task-dependent, iterated with quality/cost).

## Non-goals (initially)

- Replacing Temporal workflows with Mastra (Temporal remains the orchestration/durability shell).
- Migrating long-running research orchestration (10h flows) into Mastra.
- Replacing HASH’s schema tooling for ontology types (current JSON Schema conditioning remains the source of truth).
- Solving the snapshot storage system in this RFC (we assume snapshots exist; we define the contract they must satisfy).

## Proposals and rationale (non-exhaustive)

### 1) Mastra vs building tooling around Temporal directly

Proposal: adopt Mastra for tracing + eval + bounded inference workflows; keep Temporal for durability.

Rationale:
- Temporal provides durable orchestration, retries, queues, and a UI for activity history, but it is not designed as a first-class LLM observability + eval platform.
- Building comparable step-level tracing and eval infrastructure directly around Temporal is possible but would require significant bespoke work and ongoing maintenance.
- Mastra directly targets agentic workflows with built-in observability hooks and evaluation primitives; adopting it concentrates effort on HASH-specific problems rather than reinventing generic tooling.

### 2) Where the internal API lives (standalone vs within global HASH instance)

Proposal: implement Mastra entity inference as an internal service in a separate (private) monorepo, called by Temporal activities via an internal HTTP API; keep an "embedded" option open for later.

Rationale:
- A standalone service creates a clean boundary: Mastra does not need Graph credentials, and can evolve independently.
- It provides a natural place to consolidate inference concerns (models, prompts, evals, tracing exporters) without entangling the main monorepo.
- An embedded integration remains an option if latency/ops overhead becomes a problem; the boundary should therefore be defined by a stable contract, not by in-process call semantics.

### 3) What gets persisted to Graph vs logged elsewhere

Proposal:
- Persist to Graph (system of record):
  - Entities/links created from `ProposedEntity[]`,
  - Claims (if the workflow produces them and HASH chooses to persist them),
  - Provenance references that link extracted facts to source snapshots/files,
  - Usage records tied to Graph entities/flows (existing behavior).
- Persist outside Graph (operational/artifact stores; not part of the knowledge graph):
  - Web/page snapshots and document extraction artifacts (e.g. raw HTML/PDF bytes, extracted-text atoms, chunk maps) stored in an appropriate blob/document store, referenced from Graph by stable IDs/hashes.
  - Workflow runtime state needed for operations/debug (if retained) stored in an appropriate relational/document store with retention controls.
- Log elsewhere (observability/evals system):
  - Step-level traces, token/cost/latency breakdowns, retry/validation metadata,
  - Eval results and score distributions.

Rationale:
- Graph should remain the durable knowledge base and the store for user-visible provenance.
- Large artifacts and operational state should not be modeled as graph facts; they should live in stores optimized for size, retention, and access control, and be referenced from Graph when needed.
- Traces and evals are high-volume operational telemetry; they belong in a tracing/evals backend designed for query, sampling, and retention policies.

### 4) Chunking ownership

Proposal: chunking is owned by the Mastra inference workflow (downstream of extraction), not by upstream extraction.

Rationale:
- Chunking strategy is task-dependent and will be iterated to optimize quality/cost.
- The workflow needs to be able to choose different chunking for discovery vs claim extraction vs property extraction.
- However, chunking can only be provenance-correct if upstream extraction provides stable atom-level anchors.

## Proposed conceptual architecture

### High-level control-plane

- Temporal orchestrates flows and invokes a single "entity inference" activity step.
- That activity calls the Mastra service with:
  - extracted content in a generalized, provenance-complete representation,
  - dereferenced ontology schemas for type conditioning,
  - request-scoped metadata for trace correlation (`flowEntityId`, `stepId`, `webId`, `actorId`, etc.).
- Mastra executes the bounded inference workflow and returns proposed entities plus optional claims and evidence references.
- Temporal transforms and persists outputs to Graph (and records usage), preserving existing invariants.

### Data-plane: generalized extracted content with anchors

We introduce an intermediate representation for extracted content intended to be stable, referenceable, and sufficient for provenance:

- The extracted corpus is a sequence of text atoms with stable IDs.
- Each atom carries one or more anchors that describe where it came from in the source snapshot/file.
- The inference workflow is free to group atoms into task-specific chunks; evidence from LLM outputs references these chunks/atoms.

This model supports:
- PDFs (page-based anchors, later upgradable to character ranges and/or bounding boxes),
- Web pages (snapshot-based anchors; assume snapshot storage exists),
- Other sources that "resolve to text" (linear offsets, line/column, timecodes, table coordinates, etc.).

### Evidence model (what NER outputs must reference)

The inference outputs (claims and/or property values) should carry evidence pointers that can be resolved back to the source:

EvidenceRef -> chunkId + atom ranges/IDs -> atom anchors -> (source entity id + snapshot/file locators)

This lets HASH:
- render excerpts in UI,
- later add precise highlighting (PDF bbox) without changing the conceptual model,
- run grounding evals that are meaningful.

## File-based entity inference: steps and what differs from web-based inference

At a conceptual level, the NER chain itself is the same regardless of source type:

Shared (web + file):
- Type conditioning (provided entity type schemas),
- Chunking (workflow-owned),
- Entity discovery (summaries),
- Optional claim extraction (NER++),
- Entity proposal (typed properties/links),
- Validation/repair (bounded),
- Return structured proposals with evidence refs.

Differs by source:
- Acquisition and extraction:
  - web: fetch + snapshot + extract text atoms anchored to DOM/snapshot
  - file: convert/OCR/extract text atoms anchored to pages (and potentially geometry)
- Provenance anchor types:
  - web anchors reference snapshot + DOM locators and/or text-quote anchors
  - file anchors reference file entity + pages (and later char ranges/bboxes)

The boundary is therefore: "entity inference consumes an ExtractedCorpus", and upstream is responsible for producing that corpus from any source type.

## Observability and evaluation

### Observability (tracing)

Requirement: for any entity inference invocation, a developer should be able to open a trace and see:
- the workflow run and each step as spans,
- nested model/tool calls,
- step-level token and latency attribution,
- request-scoped HASH identifiers as trace attributes (to join back to Temporal/Graph).

Mastra should own LLM calls to maximize trace fidelity and reduce duplication of provider telemetry logic.

### Evaluation (quality)

Adopt Mastra eval primitives to:
- run step-level scorers in CI on a curated suite (seeded from existing `.ai.test.ts` cases),
- optionally score sampled production traces,
- attribute regressions to specific steps and prompts/models.

Initial scorers should prioritize:
- schema compliance (deterministic),
- evidence/grounding heuristics (enabled by the evidence model),
- structural validity of claims (if claims are produced).

## Rollout strategy (high level)

- Tracing-first MVP: integrate Mastra with a minimal workflow and correlate traces with Temporal steps.
- Incremental workflow adoption: start with a bounded entity inference chain on extracted content.
- Shadow mode: run Mastra in parallel to existing inference and compare outputs/metrics without persisting changes.
- Cutover: gated per flow/action behind configuration flags with straightforward rollback.

## Risks and mitigations

- Provenance complexity: start with coarse anchors (page number + quote; snapshot + quote) and upgrade to precise highlights later.
- Contract drift between HASH and the Mastra service: define a shared contract package or versioned schema; add compatibility tests.
- Ops overhead of an additional service: keep embedded execution as a fallback option; ensure request correlation works in both modes.
- Non-determinism and merge safety: keep entity matching/merge policy deterministic and outside Mastra initially; evaluate any migration separately.

## Open questions (to resolve before implementation)

- What is the minimal provenance UX we commit to in the first release (excerpt-only vs precise PDF highlighting)?
- Are claims persisted as first-class Graph entities in the initial rollout, or returned as data and persisted later?
- What user-facing visibility is in-scope for the first milestone (progress UI, step previews, cost estimates), and what access controls apply?
- What observability backend do we standardize on for traces and eval results (Langfuse vs other OTEL-compatible tooling)?
- What is the expected deployment topology for the Mastra service (sidecar vs internal service vs shared platform)?

## Appendix: reference documents

- `architecture-overview.md`
- `architecture-deepdive-1.md`
- `architecture-deepdive-2.md`
- `architecture-deepdive-3.md`
- `mastra-evaluation.md`
- `mastra-ner-workflow-spec.md` (lower-level implementation sketch; not the RFC)
- `mastra-reflections.md`
- `rfc/ai-features-captures.md`
- `rfc/file-based-entity-inference-addendum.md`
- `rfc/writing-sample-a.md`
- `rfc/writing-sample-b.md`
