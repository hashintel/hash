# Capture-store contract closure and verification-oracle integrity

## Problem Statement

Two seams currently make stronger claims than their implementations support.

The capture store has separate rule sets at command application, persisted parsing, and lifecycle transition time. A command can therefore return success for a snapshot the next read rejects, accept list-shaped data that is later treated as a set, or create an open conflict that no legal command can close.

The verification layer similarly infers executable facts from source text. Substrings and regular expressions claim that a gap closed, CI ran a gate, a substrate test is hermetic, or a path is a valid build output. These proxies can pass while the behavior they stand for is absent.

```text
current

command branches ──> partial validators ──> snapshot ──> persistence
                                      parser ──> different validators
open conflict ──> supersession/retraction ──> no legal close

source text ──> substring/regex proxy ──> claimed runtime fact
asset path ──> invented filename grammar ──> 200 or broad-catch 404
```

## Solution

Give each contract one owner and make negative results precise.

Capture-store commands and persisted snapshots will share evidence and issue invariants. Conflict references will be unique, active sets; a conflicting issue must begin resolvable. While it remains open, supersession and retraction of its referenced captures will fail loudly, preserving the selected lifecycle rule that the conflict must be resolved first.

Known-gap closure will become explicit rather than inferred: the proof commit deletes the gap entry. CI checks will match the actual declared commands, substrate imports will use an explicit reviewed inventory, and asset serving will validate only safety properties while accepting the producer's legal filename space. Expected absence errors become 404 or “not resolvable”; unexpected errors propagate.

```text
desired

                 ┌─ command boundaries
shared invariants├─ persisted parser
                 └─ lifecycle guards ──> always-readable, reachable snapshot

explicit gap ledger ──> proof commit deletes entry
workflow structure ──> exact gate command
reviewed integration inventory ──> permitted substrate entry points
safe path segments + real filesystem result ──> precise HTTP status
```

## Commits

1. Replace inferred known-gap closure with an explicit open-gap ledger whose entries are deleted in the same commit as their behavioral proof.
2. Make CI-gate checks match exact active commands and replace the faux-provider marker comment with an explicit reviewed inventory of permitted substrate integration entry points.
3. Make negative verification precise: only module-not-found means physically unresolvable; every other resolver failure remains loud.
4. Align production asset serving with the build producer: accept every safe extension-bearing path, return existing bytes directly, and translate only expected missing-path errors to 404.
5. Move evidence-range ordering into the shared evidence contract so capture proposals, event commands, and persisted snapshots enforce the same rule.
6. Route issue creation through the canonical issue contract, require unique references, and compare conflict resolutions by exact set equality.
7. Require every newly opened conflicting issue to reference at least two unique active captures.
8. Add the explicit open-conflict transition guard: supersession and retraction refuse captures referenced by an unresolved conflict, returning the blocking issue identities.
9. Lock the closure property with public-boundary tests: every successful command result round-trips through persisted parsing, and refused local-store commands leave the prior readable snapshot intact.

## Decisions

- **Modules modified:** capture-store domain model, local capture-store persistence tests, known-gap ledger, workspace boundary gates, production asset handler.
- **Interface change:** the capture-store refusal union gains a refusal for captures blocked by unresolved conflicts.
- **Schema contract:** issue references are non-empty unique sets; conflicting issues additionally require two or more active captures.
- **Lifecycle contract:** open conflicts pin their referenced captures until a user-cited resolution closes the issue. No compatibility bridge is retained under the prototype/free-rewrite posture.
- **Verification contract:** known-gap closure is an explicit repository action, not a source-text inference.
- **Dependency decision:** no new dependency is needed.
- **Topology files:** none exist in the affected directories.

## Testing Decisions

- Drive capture-store behavior through its public command function, then parse every successful snapshot through the public persisted-state parser.
- Add table-driven refusal cases for malformed issues, duplicate references, reversed evidence spans, under-populated conflicts, inactive references, and capture changes blocked by an open conflict.
- Keep one local-store round-trip proving an invalid command cannot corrupt the previously readable file.
- Drive asset behavior through the real Hono route over real temporary files, including producer-valid punctuation and an unexpected filesystem failure.
- Test workflow and substrate inventories as exact declared data, not nearby prose tokens.
- Existing capture-store, local persistence, asset-route, and boundary suites provide the prior art; no paid model run or network oracle is required.

## Out of Scope

- Unused dependency cleanup in package manifests.
- Baseline-runner expert truncation handling.
- Documentation spelling, stale comments, and the stale Gherkin worked-example phrase.
- Bun minimum-release-age policy.
- Advisory-scan performance tuning and the redundant asset-byte copy except where the asset-boundary commit naturally removes it.
- Alternative conflict semantics such as historical resolution, dynamic head-following, or a new “moot” event.
- Replacing every regular expression or static architecture sentinel; only the review-confirmed proxies are included.
