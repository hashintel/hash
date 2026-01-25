# Entity Path Pushability Mapping

This document maps Entity struct paths to their database sources and indicates whether filters on those paths can be pushed down to Postgres.

## Pushability Categories

1. **Direct** - Maps to a single column or JSONB path. Any operation can be pushed.
2. **Composite** - Maps to multiple columns in the same table. Only specific operations (e.g., `==`, `!=`) can be pushed, and require the compiler to expand into column-wise comparisons. Arbitrary operations (e.g., field access, arithmetic) cannot be pushed.
3. **Not Pushable** - Contains synthesized data or spans multiple tables in ways that prevent pushing.

## Database Schema Overview

Entry point: `entity_temporal_metadata`

```
entity_temporal_metadata
├── web_id, entity_uuid, draft_id  ──FK──▶  entity_ids (web_id, entity_uuid, provenance)
├── entity_edition_id  ──FK──▶  entity_editions (properties, property_metadata, archived, provenance, confidence)
│                               └──▶  entity_is_of_type (entity_type_ontology_id, inheritance_depth)
├── decision_time
└── transaction_time

entity_edge (for link entities)
├── source_web_id, source_entity_uuid
├── target_web_id, target_entity_uuid
├── kind, direction
├── provenance (JSONB)
└── confidence
```

## Path Mappings

### Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Direct - pushable to Postgres |
| 🔀 | Composite - pushable for comparisons only, requires compiler expansion |
| ❌ | Not pushable - must evaluate in interpreter |
| 🔗 | Requires JOIN |
| 📦 | JSONB column (supports path queries) |

---

### `properties`

| Path | DB Source | Pushable |
|------|-----------|----------|
| `properties` | `entity_editions.properties` 📦 | ✅ |
| `properties.*` | `entity_editions.properties->...` | ✅ |

---

### `metadata.record_id`

| Path | DB Source | Pushable |
|------|-----------|----------|
| `metadata.record_id` | Composite: 4 columns in `entity_temporal_metadata` | 🔀 |
| `metadata.record_id.entity_id` | Composite: 3 columns (`web_id`, `entity_uuid`, `draft_id`) | 🔀 |
| `metadata.record_id.entity_id.web_id` | `entity_temporal_metadata.web_id` | ✅ |
| `metadata.record_id.entity_id.entity_uuid` | `entity_temporal_metadata.entity_uuid` | ✅ |
| `metadata.record_id.entity_id.draft_id` | `entity_temporal_metadata.draft_id` | ✅ |
| `metadata.record_id.edition_id` | `entity_temporal_metadata.entity_edition_id` | ✅ |

---

### `metadata.temporal_versioning`

| Path | DB Source | Pushable |
|------|-----------|----------|
| `metadata.temporal_versioning` | Composite: 2 columns in `entity_temporal_metadata` | 🔀 |
| `metadata.temporal_versioning.decision_time` | `entity_temporal_metadata.decision_time` | ✅ |
| `metadata.temporal_versioning.transaction_time` | `entity_temporal_metadata.transaction_time` | ✅ |

---

### `metadata.entity_type_ids`

| Path | DB Source | Pushable |
|------|-----------|----------|
| `metadata.entity_type_ids` | `entity_is_of_type` 🔗 | ✅ |

---

### `metadata.archived`

| Path | DB Source | Pushable |
|------|-----------|----------|
| `metadata.archived` | `entity_editions.archived` | ✅ |

---

### `metadata.confidence`

| Path | DB Source | Pushable |
|------|-----------|----------|
| `metadata.confidence` | `entity_editions.confidence` | ✅ |

---

### `metadata.provenance`

| Path | DB Source | Pushable |
|------|-----------|----------|
| `metadata.provenance` | Composite of `inferred` + `edition` | ❌ |
| `metadata.provenance.inferred` | `entity_ids.provenance` 📦 | ✅ |
| `metadata.provenance.inferred.created_by_id` | `entity_ids.provenance->'createdById'` | ✅ |
| `metadata.provenance.inferred.created_at_transaction_time` | `entity_ids.provenance->'createdAtTransactionTime'` | ✅ |
| `metadata.provenance.inferred.created_at_decision_time` | `entity_ids.provenance->'createdAtDecisionTime'` | ✅ |
| `metadata.provenance.inferred.first_non_draft_created_at_transaction_time` | `entity_ids.provenance->'firstNonDraftCreatedAtTransactionTime'` | ✅ |
| `metadata.provenance.inferred.first_non_draft_created_at_decision_time` | `entity_ids.provenance->'firstNonDraftCreatedAtDecisionTime'` | ✅ |
| `metadata.provenance.edition` | `entity_editions.provenance` 📦 | ✅ |
| `metadata.provenance.edition.created_by_id` | `entity_editions.provenance->'createdById'` | ✅ |
| `metadata.provenance.edition.archived_by_id` | `entity_editions.provenance->'archivedById'` | ✅ |
| `metadata.provenance.edition.provided` | `entity_editions.provenance->'provided'` | ✅ |
| `metadata.provenance.edition.provided.*` | `entity_editions.provenance->'provided'->...` | ✅ |

---

### `metadata.properties` (property metadata)

| Path | DB Source | Pushable |
|------|-----------|----------|
| `metadata.properties` | `entity_editions.property_metadata` 📦 | ✅ |
| `metadata.properties.*` | `entity_editions.property_metadata->...` | ✅ |

---

### `link_data`

| Path | DB Source | Pushable |
|------|-----------|----------|
| `link_data` | Composite from `entity_edge` + synthesized fields | ❌ |
| `link_data.left_entity_id` | Composite (includes synthesized `draft_id = None`) | ❌ |
| `link_data.left_entity_id.web_id` | `entity_edge.target_web_id` (via `entity_has_left_entity` view) 🔗 | ✅ |
| `link_data.left_entity_id.entity_uuid` | `entity_edge.target_entity_uuid` (via view) 🔗 | ✅ |
| `link_data.left_entity_id.draft_id` | **Synthesized** (always `None`) | ❌ |
| `link_data.right_entity_id` | Composite (includes synthesized `draft_id = None`) | ❌ |
| `link_data.right_entity_id.web_id` | `entity_edge.target_web_id` (via `entity_has_right_entity` view) 🔗 | ✅ |
| `link_data.right_entity_id.entity_uuid` | `entity_edge.target_entity_uuid` (via view) 🔗 | ✅ |
| `link_data.right_entity_id.draft_id` | **Synthesized** (always `None`) | ❌ |
| `link_data.left_entity_confidence` | `entity_edge.confidence` 🔗 | ✅ |
| `link_data.left_entity_provenance` | `entity_edge.provenance` 📦 🔗 | ✅ |
| `link_data.right_entity_confidence` | `entity_edge.confidence` 🔗 | ✅ |
| `link_data.right_entity_provenance` | `entity_edge.provenance` 📦 🔗 | ✅ |

---

### Whole Entity

| Path | DB Source | Pushable |
|------|-----------|----------|
| `entity` (entire struct) | Aggregated from multiple tables + synthesized fields | ❌ |

---

## Summary: Non-Pushable Paths

These paths cannot be pushed to Postgres and must be evaluated in the interpreter:

1. **`entity`** - The whole entity is an aggregate of multiple tables
2. **`metadata.provenance`** - Composite spanning multiple tables (`entity_ids` + `entity_editions`)
3. **`link_data`** - Contains synthesized `draft_id` fields
4. **`link_data.left_entity_id`** - Contains synthesized `draft_id = None`
5. **`link_data.right_entity_id`** - Contains synthesized `draft_id = None`
6. **`link_data.*.draft_id`** - Not stored in `entity_edge` table

## Summary: Composite Pushable Paths

These paths can be pushed for comparison operations (`==`, `!=`) only, requiring the compiler to expand into column-wise comparisons:

1. **`metadata.record_id`** - 4 columns in `entity_temporal_metadata`
2. **`metadata.record_id.entity_id`** - 3 columns (`web_id`, `entity_uuid`, `draft_id`)
3. **`metadata.temporal_versioning`** - 2 columns (`decision_time`, `transaction_time`)

Note: Arbitrary operations (field projection, arithmetic, etc.) on composite paths are NOT pushable.

## Summary: Directly Pushable Paths

These paths map 1:1 to database columns or JSONB paths and support any operation:

- `properties` and all sub-paths (JSONB)
- `metadata.record_id.entity_id.web_id`
- `metadata.record_id.entity_id.entity_uuid`
- `metadata.record_id.entity_id.draft_id`
- `metadata.record_id.edition_id`
- `metadata.temporal_versioning.decision_time`
- `metadata.temporal_versioning.transaction_time`
- `metadata.entity_type_ids` (via JOIN)
- `metadata.archived`
- `metadata.confidence`
- `metadata.provenance.inferred` and all sub-paths (JSONB)
- `metadata.provenance.edition` and all sub-paths (JSONB)
- `metadata.properties` and all sub-paths (JSONB)
- `link_data.left_entity_id.web_id` (via JOIN)
- `link_data.left_entity_id.entity_uuid` (via JOIN)
- `link_data.right_entity_id.web_id` (via JOIN)
- `link_data.right_entity_id.entity_uuid` (via JOIN)
- `link_data.left_entity_confidence` (via JOIN)
- `link_data.left_entity_provenance` and sub-paths (JSONB, via JOIN)
- `link_data.right_entity_confidence` (via JOIN)
- `link_data.right_entity_provenance` and sub-paths (JSONB, via JOIN)
