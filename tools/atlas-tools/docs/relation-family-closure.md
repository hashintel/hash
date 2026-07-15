# Relation family closure

This document specifies a deterministic classifier cohort derived from
identity-bearing relation lineage.

The closure prevents a relation and any overlapping lineage from appearing in
both the training and validation partitions of classifier cross-validation. It
is a classifier input, not an evaluation-card annotation. The paid pilot, the
production grid, soft-label aggregation, and embedding acquisition consume the
verified card deck without this artifact. Classifier fitting must fail before
optimization when the closure is absent, incomplete, stale, or invalid.

This is the normative contract implemented by `atlas_tools.relation.lineage`,
`atlas_tools.relation.family_closure`, the HASH and Wikidata card producers, and
the classifier pipeline. It does not authorize inferring families from rendered
card prose or publishing a closure from artifacts that lack the required source
lineage and provenance.

## Normative language

The words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY describe requirements in
this document. A producer that violates a MUST or MUST NOT requirement cannot
publish a relation family closure.

## Mental model

A relation lineage is a directed graph. Each node is an exact, source-qualified
relation identity. An `extends` edge points from a specialized relation to one
of its direct parents. A node may have more than one direct parent.

A classifier cohort is a connected component of the overlap graph after the
declared root exclusions have been applied. The overlap graph treats accepted
`extends` and inverse edges as undirected because either direction is enough to
make a train/test split dependent.

Connected components are the only overlap-safe partition. Consider a relation
that extends two parents. Assigning it to either parent's family alone leaves
the other lineage split across folds. Assigning the relation to both families
does not form a partition. The transitive connected component is the smallest
partition that keeps every accepted overlap edge inside one fold.

This closure is a lineage cohort, not a claim that every component member is
semantically interchangeable. A broad component is valid evidence that the
current fold count or evaluation design may need adjustment. It MUST NOT be
split with a fan-out threshold or a hand-authored exception merely to improve
fold balance.

## Pipeline boundary

The closure has the following ownership boundary:

- `evaluate` in pilot mode does not read or require the closure.
- `evaluate` in grid mode does not read or require the closure.
- `aggregate` preserves card identity and vote evidence without requiring the
  closure.
- `embed` acquires vectors for exact card identities without requiring the
  closure.
- `fit` requires one verified closure that covers the complete joined soft-label
  and embedding cohort.
- A classifier bundle records the exact closure artifact used for fold
  assignment.

No paid vote or embedding request may be invalidated solely because lineage is
backfilled later. A card-text change still changes `card_hash` and therefore
requires a new exact closure binding before classifier fitting.

## Source lineage contract

Each relation source MUST publish identity-bearing lineage before a combined
closure can be derived. Rendered ancestor labels, descriptions, and inverse
display names are presentation data and MUST NOT become graph edges.

The source artifact has two files:

- `lineage.jsonl` contains one schema-v1 node per source relation in the closed
  lineage universe.
- `lineage.manifest.json` binds the node bytes to the source snapshot and the
  source-specific extraction policy.

The source manifest has schema version `1` and records the source namespace,
producer, snapshot identity, exact leaf card artifact ID, lineage content hash,
raw identity-bearing input hashes, node and edge counts, and the closed edge
kind policy. The leaf card artifact ID MUST equal the corresponding leaf source
recorded by the concat manifest. The snapshot identity MUST be the same typed
snapshot used to produce both artifacts. A matching namespace or creation time
alone is insufficient.

The lineage universe includes dependency-only parents that have no card in the
selected deck. This makes every edge resolvable and preserves paths through an
unselected parent. A node has this logical shape:

```json
{
  "schema_version": 1,
  "relation_id": "wikidata:P156",
  "extends": ["wikidata:P155"],
  "inverse_edges": [
    {
      "relation_id": "wikidata:P155",
      "kind": "wikidata-p1696"
    }
  ]
}
```

The example only illustrates the schema shape. A producer MUST emit facts from
its source data; it MUST NOT treat the identifiers above as a reviewed factual
assignment.

The fields have these contracts:

- `schema_version` is exactly `1`.
- `relation_id` is a valid source-qualified relation ID.
- `extends` contains only direct parent IDs. It is sorted by relation ID and
  contains no duplicates or self-reference.
- `inverse_edges` contains only identity-bearing inverse facts admitted by the
  manifest policy. It is sorted by `(kind, relation_id)` and contains no
  duplicate pair within one node and no self-reference. Mirrored source facts
  on two nodes are permitted and normalize to one undirected union edge.
- Every referenced ID has exactly one node in the same closed lineage universe.

Nodes are written in ascending `relation_id` order. A producer validates this
order rather than silently sorting a malformed source artifact during closure
publication.

An empty `extends` or `inverse_edges` array is meaningful and MUST be emitted.
Absence of an edge and failure to extract an edge are different states. A
source manifest MUST record a complete extraction or fail publication.

### HASH SemType lineage

The HASH producer MUST preserve the exact versioned IDs and depths from the
resolved SemType schema long enough to emit direct `extends` edges. A direct
parent is an identity whose resolved `allOf` entry has depth `1`; depth `0` is
the relation itself. The producer MUST normalize that versioned identity to the
same stable base-URL identity used by the corresponding relation card.

`https://blockprotocol.org/@blockprotocol/types/entity-type/link/` is the
universal SemType Link root. Its direct lineage edge remains in `lineage.jsonl`
for source audit and DAG validation, but the closure policy MUST exclude edges
whose parent is that exact root from component union. Otherwise every SemType
link would become one classifier cohort and the grouping would encode only the
universal type-system root.

The source schema's inverse title and inverse plural title are display strings.
They never identify another relation and MUST NOT produce inverse edges. A
future SemType field may produce an inverse edge only if it carries the exact
source relation identity and is assigned a new closed `kind` value.

### Wikidata property lineage

The Wikidata producer MUST emit direct P1647 property IDs from the snapshot-pinned
property documents. It MUST NOT emit the transitive P1647 closure as though each
ancestor were a direct parent. The transitive closure may remain a card-rendering
input, but it is not the source lineage record.

An actual inverse property ID may produce an inverse edge. In schema v1,
`wikidata-p1696` is the admitted kind for an exact P1696 property ID. A P1696
self-reference is valid source evidence that a property is symmetric, but it is
a no-op for component union and MUST NOT be projected as a schema-v1 lineage
self-edge. Inverse labels and descriptions never produce edges. Whether a P2302
inverse constraint whose P2306 qualifier names an exact property is admitted is
an explicit open question; it MUST NOT be silently treated as P1696.

### Why `taxonomy.parquet` is not lineage

`taxonomy.parquet` describes Wikidata item-class ancestry through P279. Its
nodes are QIDs used to stratify relation examples by endpoint entity type. The
classifier closure groups relation types, whose Wikidata identities are PIDs
and whose SemType identities are URLs.

The taxonomy therefore provides neither direct property `extends` edges nor
inverse relation identities. It also cannot bind a lineage decision to an exact
`(relation_id, card_hash)` pair. Using it would conflate endpoint entity classes
with relation lineage and MUST be rejected.

## Graph validation

Publication validates the complete lineage graph before computing any family.
Validation is fail closed and applies in this order:

1. Verify each source manifest and every declared content hash.
2. Parse every row strictly under its declared schema version.
3. Reject duplicate nodes, duplicate facts within a node, self-edges, unsorted
   nodes, and unsorted edge lists.
4. Reject an edge whose target node is absent.
5. Reject a relation ID whose namespace disagrees with the source declaration.
6. Reject a cross-namespace edge unless the schema version and manifest policy
   explicitly admit that edge class.
7. Prove that the directed `extends` graph is a DAG. Multiple inheritance is
   valid; every directed cycle is an error.
8. Verify the concat deck and prove exact deck-to-node coverage.
9. Verify that every root exclusion names an existing node and is admitted by
   the closed policy version.

Inverse edges do not participate in DAG validation because inverse is an
undirected identity relationship. They do participate in duplicate,
self-reference, missing-node, namespace, and policy validation.

Cycles MUST NOT be collapsed into a component as a recovery strategy. A cycle
means either the source snapshot or the extraction contract is inconsistent,
and silently accepting it would erase the distinction between hierarchy and
corrupt input.

## Component algorithm

After graph validation, the producer computes families as follows:

1. Create one disjoint-set node for every lineage node.
2. For every `extends` edge, skip union only when its parent is in the exact
   policy-owned root exclusion set. Union the child and parent otherwise.
3. For every admitted inverse edge, union both identities.
4. Project each disjoint-set component onto the verified deck relations.
5. Discard projected components with no deck relation.
6. Assign every deck relation in a projected component the same deterministic
   family ID.

No heuristic similarity edge is permitted in schema v1. Titles, descriptions,
embeddings, shared endpoint classes, URL slugs, edit distance, and model output
are not source lineage.

## Output contract

The published directory contains:

- `families.jsonl`, with one row for every verified deck card;
- `families.manifest.json`, with the complete input and algorithm provenance.

Each `families.jsonl` row has this shape:

```json
{
  "schema_version": 1,
  "relation_id": "wikidata:P156",
  "card_hash": "<64 lowercase hexadecimal characters>",
  "family_id": "lineage-v1:<64 lowercase hexadecimal characters>"
}
```

Rows are sorted by `relation_id`. Coverage is exact: every concat card appears
once with its current `card_hash`, and no relation outside the deck appears.

The family ID is computed as:

```text
"lineage-v1:" + sha256(canonical_json({
  "algorithm": "relation-lineage-components-v1",
  "relations": <sorted deck relation IDs in this projected component>
}))
```

`canonical_json` means UTF-8 JSON with sorted object keys, compact separators,
and no insignificant whitespace or trailing newline. Relation IDs retain their
exact serialized spelling.

Card hashes are intentionally absent from the family ID. A card rerender that
does not change lineage retains the same family identity, while the assignment
row and manifest still reject the stale card binding.

The manifest has schema version `1` and records at least:

- producer name and artifact creation time;
- `relation-lineage-components-v1` as the closed algorithm ID;
- the exact root exclusions and admitted inverse edge kinds;
- the concat card and manifest hashes;
- every source lineage file and manifest hash;
- the `families.jsonl` content hash;
- card, lineage-node, direct-edge, excluded-edge, inverse-edge, component, and
  largest-component counts;
- the canonicalization and ordering rules;
- an artifact ID derived from the schema, algorithm policy, input hashes, and
  output content hash.

The artifact ID MUST change when any input byte, edge policy, root exclusion,
schema version, algorithm version, or output byte changes.

## Atomic publication

The destination must not already exist. Publication writes a new sibling
temporary directory, flushes each content file before its manifest, flushes the
directory entry, and renames the complete directory into place only after all
validation and hashing succeeds.

An exception, cancellation, hash drift, or destination race leaves no published
artifact. Existing destinations are immutable and are never repaired in place.

## Classifier binding

Classifier fitting joins soft labels, embeddings, and family rows by exact
`relation_id`. It then requires all three inputs to carry the same `card_hash`
for every relation. Missing, extra, duplicate, or stale family rows fail before
fold assignment or optimizer construction.

The fit command MUST NOT use `relation_id` as a singleton fallback and MUST NOT
read an optional `family_id` copied into a card or soft-label row. The verified
closure is the sole family authority.

The classifier bundle records:

- the closure artifact ID and `families.jsonl` hash;
- the closure schema, algorithm, and edge-policy IDs;
- the deterministic relation-to-fold assignment;
- the configured fold count and seed.

Loading or reporting a classifier bundle revalidates this binding. A bundle
without closure provenance is not valid grouped-CV evidence and requires a
refit; it does not invalidate the paid votes, soft labels, or embeddings from
which it was derived.

## Errors

Closure publication fails without output when any of these conditions holds:

- a source or concat manifest is missing, malformed, or hash-inconsistent;
- a schema, algorithm, edge kind, or root exclusion is unsupported;
- a row has an invalid relation identity or field type;
- a node, edge, or deck binding is duplicated;
- an edge is self-referential, unsorted, cross-source without policy, or points
  to a missing node;
- the directed `extends` graph contains a cycle;
- a root exclusion is missing from the lineage universe;
- the deck has a missing lineage node, a stale card hash, or an unexpected
  family row;
- a family ID or artifact hash differs from its deterministic recomputation;
- the destination exists or appears during publication;
- an input changes between verification and publication.

Classifier fitting reports the closure error before allocating fit arrays or
running an optimizer.

## Complexity

Let `n` be the number of lineage nodes, `e` the number of accepted direct and
inverse edges, and `c` the number of deck cards.

DAG validation and component construction run in `O(n + e)` time after parsing.
Disjoint-set operations take `O((n + e) * alpha(n))` time, where `alpha` is the
inverse Ackermann function. Canonical ordering takes `O((n + e) log(n + e))`
time in the general case, and output ordering takes `O(c log c)` time. The
operation uses `O(n + e + c)` additional memory.

The transform performs local file I/O only. It makes no provider, embedding,
Wikidata, HASH database, or other network request.

## Backfill and migration

Existing paid evidence is preserved through this sequence:

1. Keep the pilot, grid, soft-label, and embedding artifacts unchanged.
2. Extend each source adapter to publish identity-bearing direct lineage next
   to newly generated card artifacts.
3. For the exact v4 Wikidata snapshot, backfill direct P1647 and admitted
   inverse IDs only from the snapshot-pinned raw property documents. If the
   original request cache is the source snapshot, rerun `extract-properties`
   with both `--cache-dir` and `--cache-only`; a missing or transient cache entry
   stops the backfill instead of fetching current Wikidata data. An older
   records directory without `lineage-records.jsonl` cannot recover direct
   P1647 facts through `render-cards`. If richer relationship metadata changes
   newly rendered card prose, use `wikidata backfill-lineage` to bind those
   source facts to the exact evaluated card bytes. It may upgrade missing typed
   source/snapshot declarations in a copied legacy manifest, but it MUST NOT
   assign a new card hash to an old judgment.
4. For the existing HASH deck, recover direct SemType identities only from the
   exact source snapshot that produced the cards. Pass the evaluated manifest's
   `details.snapshot_at` to `hash-cards extract-cards --snapshot-at`; the query
   uses that bitemporal instant instead of the current transaction timestamp.
   The rendered `Ancestors` section and old `link-types.jsonl` phrases are
   insufficient because they omit source IDs and depths.
5. Publish source lineage artifacts and then the combined closure into new
   immutable directories.
6. Fit a new classifier with the verified closure. Reuse the unchanged soft
   labels and embeddings after their exact relation and card hashes pass the
   classifier join.
7. Treat earlier classifier bundles without closure provenance as unverified
   cross-validation outputs and replace them. Do not rerun paid evaluation or
   embeddings solely for this migration.

If the exact HASH source snapshot cannot be recovered, the backfill stops. A
human-authored guess or label match is not a lineage artifact.

## Rejected alternatives

- A user-authored semantic family overlay is not source lineage and cannot
  prove overlap closure.
- One family per relation allows known parent, child, sibling, or inverse
  overlap to cross folds.
- Greedy parent assignment breaks under multiple inheritance because one node
  can overlap more than one proposed family.
- Rendered ancestor or inverse text loses identity and can match multiple or
  renamed relations.
- P31 classes and `taxonomy.parquet` describe entity kinds rather than relation
  lineage.
- Splitting a large component by size, fan-out, or fold balance weakens the
  leakage guarantee.

## Open questions

The following choices require an explicit schema or policy revision before
they can affect a published closure:

- Whether an exact Wikidata P2302/P2306 inverse constraint is trusted as an
  inverse edge alongside P1696.
- Whether any source-specific generic root other than the universal SemType
  Link root should be excluded from union.
- Which exact persisted HASH snapshot can reproduce the current resolved
  SemType direct-parent IDs and depths.
- Whether cross-namespace lineage edges are needed and which source owns their
  provenance.
- Whether a largest component makes five-fold validation statistically
  unsuitable. The remedy is a documented evaluation-protocol change, not a
  split component.
- Whether future source schemas need identity-bearing sibling edges beyond
  direct lineage and inverse identity.
