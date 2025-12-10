# NER Workflow - Named Entity Recognition & Extraction

This directory contains a simple NER (Named Entity Recognition) workflow, which extracts structured entities from text documents. It relates to the ner-workflow.ts file, one level up

```sh
apps/hash-ai-agent/src/mastra/workflows/
├── ner-workflow.ts          # (empty - main workflow entry point)
└── ner-workflow/
    ├── README.md            # Architecture documentation
    └── types.ts             # Type definitions
```

## Overview

This is a simplified implementation of the entity extraction pipeline originally found in `apps/hash-ai-worker-ts`. The key simplifications:

1. **Text input only** - Assumes documents are pre-processed to plain text/markdown
2. **Decoupled from Graph API** - Uses fixtures/interfaces for entity type resolution
3. **Deterministic orchestration** - LLM decides *what*, Mastra workflow decides *when*

## Input Contract

```typescript
type NERWorkflowInput = {
  text: string;                    // Pre-processed text content
  source?: {                       // Metadata for provenance
    uri?: string;
    name?: string;
    loadedAt?: string;
  };
  entityTypeIds: string[];         // Entity types to extract
  researchGoal: string;            // Context for the LLM
};
```

## Pipeline Architecture

```sh
INPUT: Text + EntityTypeIds + ResearchGoal
                │
                ▼
┌───────────────────────────────────────────────────────────┐
│ STEP 1: Resolve Entity Types                       [TOOL] │
│ Input:  entityTypeIds[]                                   │
│ Output: DereferencedEntityType[] (with property schemas)  │
└───────────────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────┐
│ STEP 2: Extract Entity Mentions                   [AGENT] │
│ Input:  text, entityTypes[], researchGoal                 │
│ Output: EntityMention[]                                   │
│   - name, entityTypeId, textSpan, summary                 │
└───────────────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────┐
│ STEP 3: Extract Observations                      [AGENT] │
│ Input:  text, entityMentions[], entityTypes[]             │
│ Output: Observation[]                                     │
│   - subjectMentionId, text, textSpan, propertyHint        │
└───────────────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────┐
│ STEP 4: Deduplicate Entities                       [TOOL] │
│ Input:  entityMentions[], observations[]                  │
│ Output: DeduplicatedEntity[]                              │
│   - localId, canonicalName, mentionIds, observationIds    │
└───────────────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────┐
│ STEP 5: Propose Entities (Fill Properties)        [AGENT] │
│ Input:  deduplicatedEntity, observations[], entityType    │
│ Output: ProposedEntity[]                                  │
│   - properties, propertyMetadata with provenance          │
└───────────────────────────────────────────────────────────┘
                │
                ▼
OUTPUT: ProposedEntity[] + Observation[] + Stats
```

## Tool vs Agent Classification

| Step                       | Type      | Rationale                                     |
| -------------------------- | --------- | --------------------------------------------- |
| 1. Resolve Entity Types    | **Tool**  | Deterministic fetch/transform                 |
| 2. Extract Entity Mentions | **Agent** | Requires LLM reasoning to identify entities   |
| 3. Extract Observations    | **Agent** | Requires LLM reasoning to extract facts       |
| 4. Deduplicate Entities    | **Tool**  | Start deterministic, add LLM later if needed  |
| 5. Propose Entities        | **Agent** | Requires LLM to map observations → properties |

## Key Design Decisions

### 1. TextSpan Provenance

Unlike the original system which only tracked source URLs, we add character-level provenance:

```typescript
type TextSpan = {
  start: number;  // Character offset
  end: number;    // Character offset (exclusive)
};
```

This allows linking observations back to exact positions in the source document.

### 2. Observations vs Claims

We use "Observation" instead of "Claim" to better match document parsing semantics. An observation is a fact extracted from text with provenance.

### 3. Mention-Level Tracking

`EntityMention` is a first-class concept to track where entities appear before deduplication. Multiple mentions may refer to the same entity.

## Files

- `types.ts` - Core type definitions
- `steps/` - Individual workflow steps (tools and agents)
- `index.ts` - Main workflow export

## Migration Notes

This replaces functionality from:
- `apps/hash-ai-worker-ts/src/activities/flow-activities/research-entities-action/`
- Specifically the entity summary and claim extraction flows

Key differences from the original:
1. No Temporal dependency - uses Mastra workflows
2. No Graph API dependency - uses fixtures/interfaces
3. Simpler prompts - each agent does ONE thing
4. Explicit provenance - TextSpan for document positions
