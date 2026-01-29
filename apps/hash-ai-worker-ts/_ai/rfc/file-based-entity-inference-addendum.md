# Addendum: File-Based Entity Inference Steps (What Matches Web Inference vs What Differs)

Status: Draft
Last updated: 2026-01-29

This addendum complements `rfc/mastra-ner-rfc.md`. It answers the Linear prompt:

> Define the steps required for file-based entity inference (highlight what will be the same as existing HASH web-based inference and what differs)

It is intentionally higher-level than a technical specification. The goal is to describe the end-to-end steps and boundaries in a way that stays stable even if implementation details change.

## Framing: what “file-based inference” means

"File-based entity inference" means extracting knowledge (entities, properties, relationships) from a file-backed source (e.g. PDF, DOCX, images) and persisting that knowledge into the HASH Graph with provenance that allows review (at minimum: "show the supporting excerpt"; later: "highlight the exact span").

The critical architectural point is that the NER/inference logic should not care whether content came from a PDF, a web page, or another source, as long as it receives:

- extracted text content, and
- sufficient provenance anchors to cite where that content came from in the stored source snapshot/artifact.

## End-to-end steps (file-based entity inference)

These are the steps that must exist conceptually. Some are already present in HASH today; some are the focus of Mastra adoption; some remain upstream/out of scope for the RFC.

### Step 0: Identify the source + enforce access controls

- Input: a reference to a file-backed source (typically a Graph `FileEntity` or similar).
- Work:
  - confirm actor/workspace permissions,
  - decide what provenance detail is allowed to be surfaced (excerpt-only vs highlight-level).
- Output: an authorized "inference request" with stable source identity.

### Step 1: Acquire and snapshot the source (durable identity)

- Work:
  - ensure the system has a stable snapshot of what was processed (bytes or a canonical stored representation),
  - assign stable identifiers (e.g. `fileEntityId`, `snapshotId`, content hash).
- Output: a durable snapshot reference that provenance can point to.

Note: for web-based inference, this is "snapshot the web page". For file-based inference, the file entity already largely plays this role, but we still need to be explicit about "which bytes/version did we process".

### Step 2: Extract text + anchors (turn source into referenceable content)

- Work:
  - run the appropriate extraction pipeline for the file type (text extraction, OCR, table extraction, etc.),
  - produce extracted text in a structured form that preserves "where each piece came from" (e.g. page numbers; later: character ranges or bounding boxes).
- Output: extracted content suitable for inference, plus provenance anchors sufficient to cite evidence later.

Key point: this step is upstream of Mastra-NER, but it must produce a provenance-friendly representation. Without anchors, downstream inference cannot produce reviewable evidence.

### Step 3: Chunk the extracted content for inference (task-dependent)

- Work:
  - choose chunk sizes and overlap suitable for the inference task (discovery vs claims vs property extraction),
  - optionally produce multiple chunk views (broad coverage vs targeted evidence windows).
- Output: chunked content ready for the inference chain.

Key point: chunking is owned by the inference workflow (Mastra) because it is an optimization surface we will iterate to improve quality/cost/latency.

### Step 4: Entity inference on extracted content (bounded chain)

- Work (conceptual):
  - entity discovery (candidate entities + types),
  - (optional) claim extraction / relationship candidates,
  - entity proposal (typed properties/links),
  - validation and bounded repair against the selected ontology schemas,
  - attach evidence pointers to every claim/property where possible.
- Output: proposed entities (and optionally claims), with evidence refs that can be resolved back to the stored snapshot/artifact.

This is the step targeted for Mastra adoption: structured steps, tracing, evals, and cleaner separation of retry/validation scaffolding from domain wiring.

### Step 5: Resolution, merge policy, and persistence (Graph as system of record)

- Work:
  - resolve candidates against existing Graph entities (shortlist + match decision),
  - apply deterministic merge policies (minimize unsafe overwrites),
  - persist entities/links, and persist claims if the pipeline uses them,
  - record usage/cost in the system of record (existing behavior).
- Output: persisted entities + links + provenance that can be queried and reviewed.

Key point: keep merge/persistence logic outside Mastra initially, because it is HASH-specific and safety-critical.

### Step 6: Surface outputs + provenance in UX

- Work:
  - show what the system inferred (entities, properties, relationships),
  - show provenance at the best-supported level (excerpt now; highlight later),
  - show per-step progress and diagnostics where permitted.

## What is the same as existing web-based inference vs what differs

### Same (conceptually shared)

These steps should be shared regardless of whether the source is "web page" or "file":

- Ontology/type conditioning: the inference chain is constrained by selected entity type schemas.
- Chunking as an inference concern: chunking is tuned for the inference task.
- The bounded inference chain: discovery -> proposal -> validation/repair -> evidence attachment.
- Persistence concerns: resolution/merge and Graph writes, plus usage accounting.
- Observability goal: a traceable, stepwise pipeline with evaluable outputs.

### Differs (primarily in acquisition + anchoring)

The major differences are upstream of inference:

- Source acquisition and snapshotting:
  - web: snapshot a page at a moment in time (assume snapshot storage),
  - file: the file entity and its version/snapshot is the durable identity.
- Extraction tooling:
  - web: HTML parsing/readability, DOM-derived anchors, possible text-quote anchors,
  - file: PDF/DOCX parsing, OCR as needed, page-based anchors (upgradeable to char ranges/bboxes).
- Provenance precision:
  - web: best-effort anchors may be "DOM path + quote" within a stored snapshot,
  - file: anchors can reliably include page numbers; precise highlight requires more extraction fidelity.

## Where Mastra fits (high-level)

Mastra is proposed to own Step 3 and Step 4 as a bounded, step-structured inference workflow:

- workflow steps correspond to inference stages (discovery, claims, proposal, validation),
- tracing spans correspond to these steps and their model/tool calls,
- eval scorers run per step and/or end-to-end.

Temporal remains responsible for the durability shell and for Step 0/1/2/5 integration points.

## Suggested “first implementation” slice for file-based inference

If we want a small, high-leverage MVP:

- start with file sources where extraction already exists (or is simplest),
- require provenance at "page number + excerpt" level initially,
- run Mastra inference on the extracted corpus with step-level traces,
- keep merge/persist in existing HASH codepaths.

This is enough to validate the primary win (observability + eval + workflow structure) before investing in more complex provenance (PDF bbox highlighting) and broader extraction orchestration.

