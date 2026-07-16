# M0 relation-type selection

HASH entities may have more than one direct entity type. For a link entity,
more than one direct type may itself be the Block Protocol Link type or inherit
from it. SALT M0 requires exactly one relation-policy domain per link, so the
direct PostgreSQL extractor applies a deterministic compatibility rule.

## Selection rule

For each current, non-draft, non-archived link edition whose two endpoints are
also in the sampled corpus, the extractor:

1. reads direct types only (`inheritance_depth = 0`);
2. retains types equal to, or inheriting from, the Block Protocol Link type;
3. parses and deduplicates their canonical `VersionedUrl` values;
4. sorts them by canonical `VersionedUrl` order; and
5. selects the first value.

The selected type alone determines the relation-policy ordinal, classifier
input, strength, and geometry semantics. SALT does not multiply, average, or
otherwise combine policies from the remaining candidates.

An entity with no direct type resolving to Link is not a relation candidate.
It may remain a normal representation row.

## Provenance

The extraction hashes the complete ordered candidate list for every selected
link, not only the winner. The fit receipt reports
`ambiguous_link_type_count`, and the knowledge/extraction provenance hashes
change if any candidate or deterministic selection changes.

This makes the deviation visible and replayable, but it does not assert that
the first URL is the domain-correct semantic choice.

## Caveat and migration

Canonical URL order is a compatibility fallback, not ontology intent.
Producers should avoid assigning multiple link-resolving direct types when
their relation semantics differ.

A future profile should replace this rule with an explicit store-authored
primary relation type or a versioned multi-policy composition contract. Such a
change affects relation semantics and extraction identity, so it requires a new
profile/hash domain rather than a silent implementation change.
