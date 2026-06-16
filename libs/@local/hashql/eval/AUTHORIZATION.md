# Authorization patching for compiled queries

Design spec for applying actor-specific authorization to actor-agnostic compiled
queries. Patching happens before the orchestrator receives the artifacts; the
execution engine stays oblivious to authorization decisions.

## Invariant

Compilation is actor-agnostic. The compiler produces the same `PreparedQueries`
regardless of who asks. Authorization is a runtime concern: the policy decision
matrix arrives per request, and the compiled artifacts are cloned and patched
before entering the orchestrator.

The orchestrator does not change. It receives already-patched artifacts and
executes them as it always has.

## Flow

```
Compile
   |
   v
PreparedQueries (shared, immutable, actor-agnostic)
   |
   | clone (per request)
   v
PreparedQueries (owned)
   |
   | authorization::graft(&mut self, &PolicyComponents, &AuthorizationSettings)
   v
PreparedQueries (patched: statement changes + auxiliary params)
   |
   v
Orchestrator::new(client, &patched_queries, context)
   |
   | fulfill_in: encode parameters + auxiliary_parameters, execute
   v
Postgres
```

## Scope: parity with the current API

The first implementation mirrors what `PolicyComponents` +
`Filter::for_policies` + `SelectCompiler::add_filter` do today in the old
`query_entities` path. Same policy decisions, clean compile/runtime split.

## Two concerns, one graft

The graft performs two independent modifications to each `PreparedQuery`:

1. **Entity admission** (WHERE conditions): which rows survive.
2. **Property masking** (expression replacement): which property keys survive
   within a row.

Both are actor-specific, both modify the `SelectStatement`, and both belong
in the graft phase.

---

## Entity admission

### Condition shapes

All admission conditions are top-level WHERE predicates or correlated EXISTS
subqueries. No FROM tree mutation for admission, no alias allocation.

| Policy condition          | SQL shape                                                |
| ------------------------- | -------------------------------------------------------- |
| Entity UUID permit/forbid | `<base>.entity_uuid = $N` or `= ANY($N::uuid[])`         |
| Web ID permit/forbid      | `<base>.web_id = $N` or `= ANY($N::uuid[])`              |
| CreatedByPrincipal        | Correlated EXISTS on `entity_editions`                   |
| IsOfType                  | Correlated EXISTS on `entity_is_of_type_ids` with UNNEST |
| IsOfBaseType              | Correlated EXISTS on `entity_is_of_type_ids`             |

### Base table conditions

Entity UUID and web ID reference columns on the base table
(`entity_temporal_metadata`). These are plain WHERE predicates:

```sql
-- permits (OR'd)
<base>.entity_uuid = ANY($N::uuid[])
<base>.web_id = ANY($N::uuid[])

-- forbids (negated)
NOT (<base>.entity_uuid = ANY($N::uuid[]))
```

### CreatedByPrincipal

Provenance lives on `entity_editions`. Always expressed as a correlated EXISTS,
regardless of whether entity_editions is joined in the compiled query.
PostgreSQL may optimize the correlated EXISTS into a semijoin that shares
work with an existing join, though this is not guaranteed.

```sql
EXISTS (
    SELECT 1
    FROM entity_editions ee_auth
    WHERE ee_auth.entity_edition_id = <base>.entity_edition_id
      AND ee_auth.provenance->>'createdById' = $N::text
)
```

The actor ID uses `ActorEntityUuid::public_actor()` for anonymous actors,
matching the existing `for_resource_filter` behavior.

### IsOfType (paired arrays)

`entity_is_of_type_ids` stores `base_urls` (`text[]`) and `versions`
(`bigint[]`) as parallel arrays. Independent overlap on the two arrays loses
the pairing invariant (stored pairs `(A,1),(B,2)` would falsely match query
`(A,2)`). Correct form uses UNNEST:

```sql
EXISTS (
    SELECT 1
    FROM entity_is_of_type_ids eit
      CROSS JOIN LATERAL UNNEST(eit.base_urls, eit.versions) AS u(b, v)
    WHERE eit.entity_edition_id = <base>.entity_edition_id
      AND u.b = $N_base::text
      AND u.v = $N_version::int8
)
```

### IsOfBaseType

Base URL alone is sufficient; no UNNEST needed:

```sql
EXISTS (
    SELECT 1
    FROM entity_is_of_type_ids eit
    WHERE eit.entity_edition_id = <base>.entity_edition_id
      AND $N_base::text = ANY(eit.base_urls)
)
```

### Combination algebra

Same as `Filter::for_policies`:

```
blank forbid             -> WHERE FALSE  (deny all, short circuit)
blank permit, no forbids -> no conditions (allow all)
blank permit + forbids   -> WHERE NOT (f1 OR f2 OR ...)
permits only             -> WHERE (p1 OR p2 OR ... OR uuid_batch OR web_batch)
permits + forbids        -> WHERE (permits) AND NOT (forbids)
no permits               -> WHERE FALSE  (deny all)
```

### Instance admin bypass

When `policy_components.is_instance_admin()` is true, no admission conditions
are added and no property masking is applied. The graft is a no-op.

---

## Property masking

### Compilation: entity_editions as a subquery

`entity_editions` is always joined as a subquery with explicit projections,
regardless of whether masking will be applied. This is a general mechanism, not
authorization-specific:

```sql
INNER JOIN (
    SELECT entity_edition_id, archived, confidence, provenance,
           properties AS properties,
           property_metadata AS property_metadata
    FROM entity_editions
) AS ee ON ee.entity_edition_id = base.entity_edition_id
```

The `properties` and `property_metadata` projections are identity by default.
Each is a `SelectExpression::Expression` with a known alias. This gives any
runtime pass a stable injection point: scan the subquery's SELECT list, find
the entry by alias, replace the inner expression.

If entity_editions is not joined (the query does not touch properties,
provenance, confidence, or other edition fields), the subquery does not exist
and there is nothing to mask.

### Graft: expression replacement

The graft locates the entity_editions subquery in the FROM tree using
`JoinMetadata::entity_editions`. It scans the subquery's SELECT list for
entries with alias `properties` and `property_metadata`, and replaces their
inner expressions:

```
Before:  properties AS properties
After:   properties - $N::text[] AS properties

Before:  property_metadata AS property_metadata
After:   property_metadata - $N::text[] AS property_metadata
```

The replacement expression can be anything: a simple
`properties - $N::text[]` for unconditional masking, or a more complex
CASE WHEN expression for conditional per-type masking (matching the existing
`PropertyProtectionFilter` behavior that builds type-dependent mask arrays).
The injection mechanism is general; the graft builds whatever expression the
policy requires.

The alias is unchanged, so all downstream references (`ee.properties`,
filter expressions using `ee.properties->>'path'`) transparently get the
masked version.

### Composability

This approach is general. The subquery form is always present when
entity_editions is joined. Any pass (authorization, future masking, etc.) can
scan the SELECT list and replace expressions. The mechanism is not coupled to
authorization.

---

## Auxiliary parameters

Authorization values (UUIDs, web IDs, mask keys, base URLs, version strings)
are runtime data with no relation to the compiler's parameter system
(`ParameterValue<'heap>`). They do not belong in `Parameters`.

`PreparedQuery` carries a sidepiece:

```rust
pub struct PreparedQuery<'heap, A: Allocator> {
    pub vertex_type: VertexType,
    pub parameters: Parameters<'heap, A>,
    pub statement: SelectStatement,
    pub columns: Vec<ColumnDescriptor, A>,
    pub join_metadata: JoinMetadata,

    /// Opaque parameter values appended after compiled parameters during
    /// encoding. Added by the authorization graft. The orchestrator does
    /// not interpret them.
    ///
    /// These are `'static` owned values (Uuid, String, Vec<Uuid>, etc.).
    /// At encoding time the orchestrator chains borrowed references to
    /// these after the compiled parameters. They are not moved into the
    /// compiled parameter vector (which uses a different allocator and
    /// lifetime).
    pub auxiliary_parameters: Vec<Box<dyn ToSql + Sync>>,
}
```

### Index discipline

Compiled parameters occupy `$1..$K` (where `K = parameters.len()`).
Auxiliary parameters occupy `$(K+1)..$(K+M)`. Expressions generated by the
graft use absolute indices starting from `K+1`.

The graft is responsible for index correctness: each `Expression::Parameter(n)`
it emits must have a corresponding entry in `auxiliary_parameters` at position
`n - K - 1`. A mismatch is a bug in the graft, not a user error.

### Encoding

The orchestrator chains borrowed references: compiled params first, then
auxiliary. The auxiliary values stay in their `Vec<Box<dyn ToSql + Sync>>`
and are not moved into the compiled parameter vector (different allocator,
different lifetime):

```rust
// Compiled parameters (existing)
let mut encoded = Vec::with_capacity_in(query.parameters.len(), alloc.clone());
for param in query.parameters.iter() {
    encoded.push(encode_parameter_in(param, ...)?);
}

// Chain borrowed references: compiled, then auxiliary
let compiled = encoded.iter().map(|p| &**p as &(dyn ToSql + Sync));
let auxiliary = query.auxiliary_parameters.iter().map(|p| &**p as &(dyn ToSql + Sync));

let response = client
    .query_raw(&statement, compiled.chain(auxiliary))
    .await?;
```

The orchestrator does not know what auxiliary parameters mean. It just
chains them.

---

## Construction: PolicyComponents to SQL

The `authorization` module provides:

```rust
/// Grafts authorization conditions and property masking onto compiled
/// queries.
///
/// The caller is responsible for cloning `PreparedQueries` before calling
/// this. The function mutates the clone in place.
pub fn graft(
    queries: &mut PreparedQueries<'_, impl Allocator>,
    policy: &PolicyComponents,
    settings: &AuthorizationSettings,
)
```

`AuthorizationSettings` carries the filter protection config (which property
keys to mask, per entity type or globally).

### Internal steps

1. **Pre-analyze** the policy (once per graft, reused across queries):
   - Iterate `policy.extract_filter_policies(ActionName::ViewEntity)`
   - Separate permits and forbids
   - Collect optimizable UUID/web batches (mirrors `OptimizationData`)
   - Normalize actor ID for provenance

2. **Per query**, build admission conditions:
   - Read `param_offset = query.parameters.len()`
   - Lower each policy decision to `Expression` nodes referencing `$N`
     from the offset
   - Collect corresponding `Box<dyn ToSql + Sync>` values
   - Combine with the permit/forbid algebra
   - Push into `statement.where_expression`
   - Store values in `auxiliary_parameters`

3. **Per query**, apply property mask (if entity_editions is joined):
   - Locate the entity_editions subquery via `join_metadata`
   - Scan its SELECT list for `properties` / `property_metadata` aliases
   - Build the mask expression (simple `column - $N::text[]` for
     unconditional, or CASE WHEN for conditional per-type masking)
   - Replace the inner expressions
   - Add auxiliary parameters for any runtime values in the mask

---

## JoinMetadata

Captured from `Projections` after compilation:

```rust
pub struct JoinMetadata {
    /// Base table alias (entity_temporal_metadata). Always present.
    pub base_alias: Alias,
    /// entity_editions alias, if the query joins it. The graft uses this
    /// to locate the entity_editions subquery for property masking.
    pub entity_editions: Option<Alias>,
}
```

`Projections` exposes a `snapshot()` method:

```rust
impl Projections {
    pub fn snapshot(&self) -> JoinMetadata {
        JoinMetadata {
            base_alias: self.base_alias,
            entity_editions: self.entity_editions,
        }
    }
}
```

---

## Changes to existing code

### `PostgresCompiler`

Remove `property_mask: Option<Expression>` and the `with_property_mask` builder
method. The mask moves entirely to the graft phase.

Remove the compile-time masking logic in `compile_graph_read_entity` that wraps
property expressions with `Expression::subtract`.

### `Projections::build_entity_editions`

Change from joining the raw `entity_editions` table to joining a subquery with
explicit column projections. The `properties` and `property_metadata` columns
are projected as identity expressions with named aliases.

### `PreparedQuery`

Add `join_metadata: JoinMetadata` and `auxiliary_parameters: Vec<Box<dyn ToSql

- Sync>>`fields. Initialize`auxiliary_parameters` to empty at compile time.

### Orchestrator encoding

Append `query.auxiliary_parameters` after compiled parameters in the encoding
loop.

---

## File layout

```
libs/@local/hashql/eval/src/postgres/
    authorization.rs        -- graft(), AuthorizationSettings,
                               policy analysis, condition builders
    mod.rs                  -- PreparedQuery gains join_metadata and
                               auxiliary_parameters; remove
                               property_mask from PostgresCompiler
    projections.rs          -- Projections::snapshot() -> JoinMetadata;
                               build_entity_editions produces subquery
    parameters.rs           -- unchanged

libs/@local/hashql/eval/src/orchestrator/
    request/graph_read.rs   -- encoding loop appends auxiliary_parameters
    mod.rs                  -- unchanged
```

---

## Cloning

`Box<dyn ToSql + Sync>` is not cloneable, so `PreparedQuery` cannot derive
`Clone`. Provide a `clone_for_graft()` method that clones the actor-agnostic
fields (`statement`, `parameters`, `columns`, `join_metadata`, `vertex_type`)
and initializes `auxiliary_parameters` to empty. This is the intended clone
path: callers clone the shared artifact, then graft onto the clone.

Do not silently clone a grafted query in a way that drops auxiliary
parameters.

---

## Not in scope

- Direct-type admission semantics from auth.md. This spec provides the
  grafting mechanism; the admission semantics produce the conditions.
- Property-level masking via MIR labels (the information-flow pass from
  auth.md). Future work on top of this mechanism.
- Filter protection / enumeration attack mitigation beyond property masking.
- Multi-backend authorization.
- Reusing the compiled LATERAL aggregate for type filtering (structurally
  different purpose).
