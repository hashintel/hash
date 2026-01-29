# Architecture Deep Dive 2: `inferSummariesThenClaimsFromText` (“NER++”)

This deep dive explains HASH’s **claim extraction** pipeline: how we go from raw text → *entities* → *claims about those entities* → structured `ProposedEntity` objects.

Think of it like:
- **NER** = “cast list”: identify the named things that matter.
- **Claims** = “fact cards”: short, atomic sentences about each cast member.
- **Entity proposal** = “compile”: convert fact cards into typed properties + link entities.

## Source of truth (files)

- Orchestrator: `apps/hash-ai-worker-ts/src/activities/flow-activities/shared/infer-summaries-then-claims-from-text.ts`
- Stage 1 (NER): `apps/hash-ai-worker-ts/src/activities/flow-activities/shared/infer-summaries-then-claims-from-text/get-entity-summaries-from-text.ts`
- Stage 2 (claims): `apps/hash-ai-worker-ts/src/activities/flow-activities/shared/infer-summaries-then-claims-from-text/infer-entity-claims-from-text-agent.ts`
- Claim type: `apps/hash-ai-worker-ts/src/activities/flow-activities/shared/claims.ts`
- Claims → ProposedEntities: `apps/hash-ai-worker-ts/src/activities/flow-activities/shared/propose-entities-from-claims.ts`
- Dedup claims (deterministic + Graph side-effects): `apps/hash-ai-worker-ts/src/activities/flow-activities/research-entities-action/shared/deduplicate-claims.ts`

Primary call site:
- `apps/hash-ai-worker-ts/src/activities/flow-activities/research-entities-action/link-follower-agent.ts`

## Pipeline diagram

```mermaid
flowchart TD
  A[Text + Goal + EntityTypes] --> B[getEntitySummariesFromText]
  B -->|LocalEntitySummary[]| C[inferSummariesThenClaimsFromText]
  C --> D[inferEntityClaimsFromTextAgent
  per entity]
  D -->|Claim[] + Claim entities created in Graph| E[deduplicateClaims]
  E --> F[proposeEntitiesFromClaims
  (LLM → structured ProposedEntity)]
  F --> G[persistEntities]
```

## Stage 1: `getEntitySummariesFromText` (NER)

**Inputs** (key ones)
- `text`
- `relevantEntitiesPrompt` (the “goal”)
- `dereferencedEntityTypes` (a list of known type schemas)
- `existingSummaries` (to avoid re-discovering entities)

**LLM behavior**
- Uses tool-call `registerEntitySummaries` and a *very thorough* system prompt.
- Model can *suggest* new types by name, but:

**Deterministic behavior (important constraint)**
- Any entity whose `type` is **not exactly** one of the provided `$id` entityTypeIds is currently **ignored**.
  - (`@todo`: handle new suggested types)
- For each accepted summary, a new `localId` is minted via `entityIdFromComponents(webId, uuid)`.

**Output**
- `LocalEntitySummary[]` where each has `{ localId, name, summary, entityTypeIds }`.

## Stage 2: `inferEntityClaimsFromTextAgent` (claim extraction)

This is the “NER++” part: for each entity summary, infer **atomic** facts.

**Inputs** (conceptually)
- `subjectEntities`: the entities we want claims *about*
- `potentialObjectEntities`: other entities that can be referenced as claim objects
- `dereferencedEntityType` + `linkEntityTypesById`: constrain what relationships are interesting
- `text`, `title`, `url`, `contentType`, `goal`

**LLM behavior**
- Uses tool-call `submitClaims`.
- Claims must be of the form **`<subject> <predicate> <object>`**, with extra context in `prepositionalPhrases`.

**Deterministic validation & retry**
- Drops claims with:
  - `subjectEntityLocalId = null`
  - `valueNotFound = true` (handles “helpful but empty” claims)
  - unknown subject/object IDs
  - claim text that doesn’t include the subject name (and object name when object specified)
- Retries invalid claims up to `retryMax = 3`; thereafter returns whatever valid claims exist.

**Graph side-effect** (critical)
- For each accepted claim, it **creates a Claim entity** in the Graph via `HashEntity.create<ClaimEntity>`.
  - This means claims can be persisted even if downstream steps later fail/cancel.

## Claim shape (runtime contract)

A `Claim` is:
- `claimId: EntityId` (also the Graph entity id)
- `subjectEntityLocalId: EntityId`
- `objectEntityLocalId?: EntityId | null`
- `text: string`
- `prepositionalPhrases: string[]`
- optional `sources: SourceProvenance[]`

Example (informal):
- text: `"Satya Nadella is CEO of Microsoft"`
- prepositionalPhrases: `["since 2014"]`
- subjectEntityLocalId = Satya
- objectEntityLocalId = Microsoft

## How claims become `ProposedEntity` (the “compile” step)

Within `researchEntitiesAction`’s coordinating flow:
1. New claims are merged into state and **deduplicated** (`deduplicateClaims`)
   - duplicates = same subject + same object (or none) + same text (case-insensitive)
   - merges sources + prepositional phrases into the canonical claim
   - archives duplicate claim entities in Graph
   - updates any in-memory `ProposedEntity.claims.{isSubjectOf,isObjectOf}` lists to reference canonical claim ids
2. The system calls `proposeEntitiesFromClaims`:
   - partitions claims into “claims where entity is subject” vs “entity is object”
   - calls `proposeEntityFromClaimsAgent` (LLM) to map claims → typed properties + outgoing links
   - returns `ProposedEntity` plus optional outgoing **link entities** when there are plausible targets

## Notes / footguns

- Entities with multiple types are not fully supported yet (`@todo H-2241`).
- Unknown “suggested types” from Stage 1 are ignored today.
- Claim extraction is explicitly designed to avoid “unknown/not present” claims.

## Tests worth reading

- `.../infer-summaries-then-claims-from-text.ai.test.ts`
- `.../infer-entity-claims-from-text.ai.test.ts`
- `.../get-entity-summaries-from-text.ai.test.ts`

