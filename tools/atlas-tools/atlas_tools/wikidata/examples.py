"""Stratified example selection for relation cards.

Turns the raw example pool (``ExampleRow``s from the offset ladder) into
the bounded, diverse example set a card renders. The selection is a pure
deterministic function of (pool, constraints, taxonomy, seed, pid): no
wall clock, no network. A warm-cache rerun therefore reproduces every card
byte-for-byte.

Pipeline:

1. **Candidates.** Pool rows are collapsed into distinct (subject QID,
   object QID) pairs. The example query multiplies rows (one per P31 type
   of the subject), so a candidate carries the order-preserving union of
   its subject types. ``wdt:`` in the query already restricts the pool to
   truthy (best-rank) statements.
2. **Strata.** The strata are the property's subject-type constraint
   classes, which is the same list the card renders under ``Source
   types:``. A candidate belongs to the nearest constraint class that
   subsumes any of its subject types under the reflexive local P279
   closure (:class:`~atlas_tools.wikidata.taxonomy.Taxonomy`); without
   the closure most candidates match nothing (Mariupol's P31 is "urban
   hromada", not "municipality"). Nearness is minimum P279 hop distance,
   with the smallest downward closure and then declaration order breaking
   ties (:func:`assign_stratum` documents why the order matters: closure
   size alone mis-files municipalities under "government" through Wikidata's
   local-government subclass chains, and distance alone cannot separate a
   class from its own superclass at equal depth). Per-property co-match
   counts are kept as tangle evidence (:data:`STRATUM_OVERLAP_WARNING_FRACTION`).
3. **``other`` / untyped.** Typed candidates matching no constraint class
   land in an explicit ``other`` bucket, which is diagnostic and
   fallback-only: it is counted (a persistently large ``other`` means the
   constraint list is stale, and the caller logs a warning above
   :data:`OTHER_WARNING_FRACTION`) and its candidates reach the card only
   when every constraint stratum is empty. Granting ``other`` a regular
   slot would put constraint-violating pairs back on cards, which is
   exactly the live-verified reversed-P6-statement class of bug the
   subject-type filter exists to stop. Untyped candidates (no P31 at all,
   the reversed-statement signature) are always dropped under
   stratification.
4. **Slots.** Example budget ``count``: one slot per non-empty stratum
   first (declaration order), then plain round-robin for the remainder
   with a per-stratum cap of :data:`STRATUM_SLOT_CAP`. The cap is a
   fairness device, not a ceiling: once every stratum is capped or
   exhausted, remaining budget fills from whatever is left, so a
   single-stratum property still fills its whole card. Empty strata are
   skipped silently (a constraint class with no usage is ontology
   aspiration, not extension).
5. **Within-stratum order.** Fully deterministic, no randomness. The
   head is the most recognizable pair (argmax of ``log1p(subject
   sitelinks) + log1p(object sitelinks)``, ties to earliest arrival):
   selection beats reweighting, because in extensions where villages
   outnumber countries ten-thousand to one a log-weighted random draw
   still returns villages almost every time. The remaining candidates
   follow in scale-diverse order: grouped by direct P31 class, groups
   interleaved round-robin (most recognizable group first, weight
   descending inside each group), so a dominant stratum spends its extra
   slots on one country, one municipality, one commune rather than three
   draws from the same sub-population. Selection walks that order,
   skipping any candidate whose subject or object was already used
   anywhere on the card, so each entity appears at most once per card;
   shortfalls from dedup refill from the other strata.

Properties without subject-type constraints (or runs without a taxonomy)
select from a single unstratified pool with the same head-then-diversity
order and dedup; their examples carry ``stratum=None`` and render without
a stratum prefix.

The selection also reports the post-assignment stratum sizes. When one
stratum holds more than :data:`DOMINANT_STRATUM_FRACTION` of the assigned
candidates, the constraint ontology is coarser than the property's actual
extension (the caller logs it); the scale-diverse order is what keeps such
cards readable anyway.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass, field

from atlas_tools.wikidata.model import Example, Qid
from atlas_tools.wikidata.sparql import ExampleRow
from atlas_tools.wikidata.taxonomy import Taxonomy

# `other` fraction of typed candidates above which the caller should log a
# stale-constraint-list warning.
OTHER_WARNING_FRACTION = 0.25

# Remainder slots per stratum before the relaxation phase; keeps a dominant
# stratum from claiming the whole card while other strata hold candidates.
STRATUM_SLOT_CAP = 3

# Fraction of assigned candidates in one stratum above which the caller
# should log that the constraint ontology is coarser than the extension.
DOMINANT_STRATUM_FRACTION = 0.5

# Fraction of assigned candidates matching one specific PAIR of strata
# above which the caller should log a class-graph tangle. Local-government
# subclass chains pollute much of the civic ontology, so two constraint
# classes silently competing for the same members is a recurring shape
# worth surfacing property by property.
STRATUM_OVERLAP_WARNING_FRACTION = 0.3

# Dominance is only meaningful against at least one sibling stratum; a
# single-constraint property trivially holds its whole extension.
_MINIMUM_STRATA_FOR_DOMINANCE = 2


@dataclass(frozen=True)
class Candidate:
    """One distinct (subject, object) statement pair from the pool."""

    subject_qid: str
    object_qid: str
    subject_label: str
    object_label: str
    subject_types: tuple[Qid, ...]  # order-preserving union across pool rows
    subject_sitelinks: int
    object_sitelinks: int

    @property
    def weight(self) -> float:
        """Recognizability: log1p(subject sitelinks) + log1p(object sitelinks)."""
        return math.log1p(self.subject_sitelinks) + math.log1p(self.object_sitelinks)

    @property
    def subject_token(self) -> str:
        """Dedup identity of the subject (label-keyed for QID-less rows)."""
        return self.subject_qid or f"label:{self.subject_label}"

    @property
    def object_token(self) -> str:
        return self.object_qid or f"label:{self.object_label}"


@dataclass
class _PairAccumulator:
    """Mutable per-pair state while collapsing multiplied pool rows."""

    first_row: ExampleRow
    types: list[Qid]
    subject_sitelinks: int
    object_sitelinks: int

    def merge(self, row: ExampleRow) -> None:
        if row.subject_type and row.subject_type not in self.types:
            self.types.append(Qid(row.subject_type))
        self.subject_sitelinks = max(self.subject_sitelinks, row.subject_sitelinks)
        self.object_sitelinks = max(self.object_sitelinks, row.object_sitelinks)

    def candidate(self) -> Candidate:
        return Candidate(
            subject_qid=self.first_row.subject_qid,
            object_qid=self.first_row.object_qid,
            subject_label=self.first_row.subject_label,
            object_label=self.first_row.object_label,
            subject_types=tuple(self.types),
            subject_sitelinks=self.subject_sitelinks,
            object_sitelinks=self.object_sitelinks,
        )


def collect_candidates(rows: Sequence[ExampleRow]) -> list[Candidate]:
    """Collapse pool rows into distinct candidate pairs, arrival order.

    The example query emits one row per (P31 type of the subject); the
    candidate unions the types. Sitelink counts are identical across a
    pair's rows in a consistent snapshot; ``max`` guards mixed responses.
    """
    by_pair: dict[tuple[str, str], _PairAccumulator] = {}
    for row in rows:
        key = (
            row.subject_qid or f"label:{row.subject_label}",
            row.object_qid or f"label:{row.object_label}",
        )

        entry = by_pair.get(key)
        if entry is None:
            by_pair[key] = _PairAccumulator(
                first_row=row,
                # The parse boundary: pool rows carry plain strings, the
                # candidate carries branded (never-empty) class QIDs.
                types=[Qid(row.subject_type)] if row.subject_type else [],
                subject_sitelinks=row.subject_sitelinks,
                object_sitelinks=row.object_sitelinks,
            )
        else:
            entry.merge(row)

    # dicts preserve insertion order = pool arrival order.
    return [entry.candidate() for entry in by_pair.values()]


def matching_classes(
    candidate: Candidate,
    constraint_classes: tuple[Qid, ...],
    taxonomy: Taxonomy,
) -> dict[Qid, int]:
    """Map each constraint class subsuming the candidate to its hop distance.

    Subsumption uses the reflexive P279 closure; the distance is the
    minimum hop count over the candidate's subject types. An empty map
    means the ``other`` bucket.
    """
    distances: dict[Qid, int] = {}
    for constraint_class in constraint_classes:
        hops = [
            distance
            for subject_type in candidate.subject_types
            if (distance := taxonomy.hop_distance(subject_type, constraint_class)) is not None
        ]
        if hops:
            distances[constraint_class] = min(hops)
    return distances


def assign_stratum(
    candidate: Candidate,
    constraint_classes: tuple[Qid, ...],
    taxonomy: Taxonomy,
) -> Qid | None:
    """Assign the nearest, then most specific, constraint class.

    ``None`` means the ``other`` bucket. Constraint lists routinely
    contain overlapping classes at very different granularity and
    tangled class chains ("municipality" reaches both "political
    territorial entity" and, through local-government chains,
    "government"), so the tie-break is layered:

    1. minimum P279 hop distance from the candidate's subject types (the
       nearest class describes the candidate best; a commune is one or
       two hops from the territorial-entity chain but several from a
       government class whose closure merely happens to be small);
    2. smallest downward closure (most specific) among equally near
       classes, so a broad root never absorbs members of its own
       subclasses;
    3. declaration order for exact ties.
    """
    matches = matching_classes(candidate, constraint_classes, taxonomy)
    if not matches:
        return None
    return _choose_stratum(matches, constraint_classes, taxonomy)


def _choose_stratum(
    matches: dict[Qid, int],
    constraint_classes: tuple[Qid, ...],
    taxonomy: Taxonomy,
) -> Qid:
    """Pick from a non-empty match map: nearest, most specific, first declared."""
    return min(
        matches,
        key=lambda match: (
            matches[match],
            taxonomy.descendant_count(match),
            constraint_classes.index(match),
        ),
    )


def _stratum_order(pool: Sequence[Candidate]) -> list[Candidate]:
    """Order candidates scale-diverse: distinct P31 classes before repeats.

    Candidates are grouped by their primary direct P31 class, each group
    sorted by descending recognizability weight, and the groups are
    interleaved round-robin with the most recognizable group first. The
    global argmax-weight pair is therefore always the head (its group
    ranks first by construction), and consecutive slots land in distinct
    sub-populations of the stratum (one country, one municipality, one
    commune) before any sub-population repeats. Fully deterministic:
    ties break to earliest pool arrival.
    """
    groups: dict[str, list[tuple[int, Candidate]]] = {}
    for arrival, candidate in enumerate(pool):
        key = candidate.subject_types[0] if candidate.subject_types else ""
        groups.setdefault(key, []).append((arrival, candidate))

    for members in groups.values():
        members.sort(key=lambda member: (-member[1].weight, member[0]))

    ranked_groups = sorted(
        groups.values(),
        key=lambda members: (-members[0][1].weight, members[0][0]),
    )

    order: list[Candidate] = []
    depth = 0
    while True:
        advanced = False
        for members in ranked_groups:
            if depth < len(members):
                order.append(members[depth][1])
                advanced = True
        if not advanced:
            return order
        depth += 1


@dataclass(frozen=True)
class ExampleSelection:
    """Selected examples plus the diagnostics the manifests record."""

    examples: list[Example]
    candidates: int  # distinct candidate pairs in the pool
    untyped_dropped: int  # candidates with no P31 (reversed-statement guard)
    other_candidates: int  # typed candidates matching no constraint class
    other_used: bool  # the all-strata-empty fallback engaged
    # Post-assignment pool size per non-empty stratum, declaration order.
    stratum_candidates: dict[Qid, int] = field(default_factory=dict)
    # Candidates subsumed by BOTH classes of a stratum pair, keyed in
    # declaration order. Evidence of class-graph tangles, weighted by the
    # property's actual extension rather than by structural closure
    # overlap (which is dominated by near-root classes and priced in
    # millions of set members).
    stratum_overlaps: dict[tuple[Qid, Qid], int] = field(default_factory=dict)

    @property
    def other_fraction(self) -> float:
        typed = self.candidates - self.untyped_dropped
        return self.other_candidates / typed if typed else 0.0

    @property
    def dominant_stratum(self) -> tuple[Qid, float] | None:
        """Return the largest stratum and its candidate share, if it dominates.

        ``None`` unless at least two strata are non-empty and the largest
        holds more than :data:`DOMINANT_STRATUM_FRACTION` of the assigned
        candidates. A dominant stratum means the constraint ontology is
        coarser than the property's actual extension; a single-constraint
        property trivially holds everything, which is no signal at all.
        """
        if len(self.stratum_candidates) < _MINIMUM_STRATA_FOR_DOMINANCE:
            return None
        total = sum(self.stratum_candidates.values())
        largest = max(self.stratum_candidates, key=lambda key: self.stratum_candidates[key])
        fraction = self.stratum_candidates[largest] / total
        if fraction <= DOMINANT_STRATUM_FRACTION:
            return None
        return largest, fraction

    @property
    def tangled_strata(self) -> tuple[Qid, Qid, float] | None:
        """Return the most co-matched stratum pair and its candidate share.

        ``None`` unless some pair of constraint classes both subsume more
        than :data:`STRATUM_OVERLAP_WARNING_FRACTION` of the assigned
        candidates. Such a pair means the class graph funnels the same
        members through both classes and the hop-distance tie-break is
        doing load-bearing work there.
        """
        assigned = sum(self.stratum_candidates.values())
        if not assigned or not self.stratum_overlaps:
            return None
        pair = max(self.stratum_overlaps, key=lambda key: self.stratum_overlaps[key])
        fraction = self.stratum_overlaps[pair] / assigned
        if fraction <= STRATUM_OVERLAP_WARNING_FRACTION:
            return None
        first, second = pair
        return first, second, fraction


@dataclass
class _Stratum:
    """Selection state for one stratum (or the unstratified pool)."""

    key: Qid | None
    order: list[Candidate]
    pointer: int = 0
    picks: list[Candidate] = field(default_factory=list)

    @property
    def volume(self) -> int:
        return len(self.order)

    def take(self, used_tokens: set[str]) -> bool:
        """Advance past dedup conflicts and pick one candidate, if any."""
        while self.pointer < len(self.order):
            candidate = self.order[self.pointer]
            self.pointer += 1

            if candidate.subject_token in used_tokens or candidate.object_token in used_tokens:
                continue

            used_tokens.add(candidate.subject_token)
            used_tokens.add(candidate.object_token)
            self.picks.append(candidate)

            return True

        return False


def _allocate_slots(strata: Sequence[_Stratum], count: int) -> dict[int, int]:
    """Allocate the example budget: guaranteed slots, capped rounds, relaxation.

    Every non-empty stratum gets one guaranteed slot in declaration order.
    Remaining budget is dealt round-robin in declaration order, capped at
    :data:`STRATUM_SLOT_CAP` per stratum, so a stratum holding most of the
    extension cannot claim the whole card while other strata still have
    candidates. Budget left over once every stratum is capped or exhausted
    is dealt in a second, cap-free round-robin bounded only by pool size,
    so a single-stratum property still fills its card.
    """
    budget = count
    slots = dict.fromkeys(range(len(strata)), 0)
    for index in range(len(strata)):
        if budget == 0:
            break
        slots[index] = 1
        budget -= 1

    for ceiling in (STRATUM_SLOT_CAP, None):
        while budget > 0:
            progressed = False
            for index in range(len(strata)):
                if budget == 0:
                    break
                limit = (
                    strata[index].volume if ceiling is None else min(ceiling, strata[index].volume)
                )
                if slots[index] < limit:
                    slots[index] += 1
                    budget -= 1
                    progressed = True
            if not progressed:
                break

    return slots


def _redistribute_shortfall(strata: Sequence[_Stratum], count: int, used_tokens: set[str]) -> None:
    """Refill picks lost to dedup by drawing more from the other strata.

    Draws round-robin in declaration order until the budget is met or
    every stratum is exhausted; the slot cap does not apply to refills
    (a shortfall means capped fairness already failed to fill the card).
    """
    total = sum(len(stratum.picks) for stratum in strata)
    while total < count:
        progressed = False

        for stratum in strata:
            if total == count:
                break

            if stratum.take(used_tokens):
                total += 1
                progressed = True

        if not progressed:
            break


def _select_from_strata(strata: list[_Stratum], count: int) -> None:
    """Fill each stratum's ``picks`` in place.

    Guaranteed slots first, then volume round-robin, then redistribution
    of dedup shortfalls. Earlier strata draw first, so they win dedup
    conflicts (declaration order).
    """
    used_tokens: set[str] = set()
    slots = _allocate_slots(strata, count)

    for index, stratum in enumerate(strata):
        for _ in range(slots[index]):
            if not stratum.take(used_tokens):
                break

    _redistribute_shortfall(strata, count, used_tokens)


def _example(candidate: Candidate, stratum: Qid | None) -> Example:
    return Example(
        subject_qid=candidate.subject_qid,
        object_qid=candidate.object_qid,
        subject_label=candidate.subject_label,
        object_label=candidate.object_label,
        subject_type=candidate.subject_types[0] if candidate.subject_types else "",
        stratum=stratum,
    )


def select_examples(
    rows: Sequence[ExampleRow],
    *,
    constraint_classes: tuple[Qid, ...],
    taxonomy: Taxonomy | None,
    count: int,
) -> ExampleSelection:
    """Select the bounded example set for one property (see module docstring).

    Stratification engages only when the property declares subject-type
    constraints and a taxonomy is available; otherwise the whole pool is
    one unstratified stratum and nothing is dropped. The selection is a
    deterministic function of the pool and the constraints alone: no
    randomness, so identical inputs yield identical cards regardless of
    any configured seed.
    """
    candidates = collect_candidates(rows)

    if not constraint_classes or taxonomy is None:
        pool = _Stratum(key=None, order=_stratum_order(candidates))
        _select_from_strata([pool], count)
        return ExampleSelection(
            examples=[_example(candidate, None) for candidate in pool.picks],
            candidates=len(candidates),
            untyped_dropped=0,
            other_candidates=0,
            other_used=False,
        )

    untyped: list[Candidate] = []
    other: list[Candidate] = []
    pools: dict[Qid, list[Candidate]] = {key: [] for key in constraint_classes}
    overlaps: dict[tuple[Qid, Qid], int] = {}
    for candidate in candidates:
        if not candidate.subject_types:
            untyped.append(candidate)
            continue

        matches = matching_classes(candidate, constraint_classes, taxonomy)
        if not matches:
            other.append(candidate)
            continue

        pools[_choose_stratum(matches, constraint_classes, taxonomy)].append(candidate)
        matched = [key for key in constraint_classes if key in matches]
        for first_index, first in enumerate(matched):
            for second in matched[first_index + 1 :]:
                pair = (first, second)
                overlaps[pair] = overlaps.get(pair, 0) + 1

    if all(not pool for pool in pools.values()):
        # Every declared stratum is empty: the constraint list does not
        # describe actual usage at all. Fall back to the `other` pool
        # (unstratified) rather than emitting an example-less card.
        pool = _Stratum(key=None, order=_stratum_order(other))
        _select_from_strata([pool], count)
        return ExampleSelection(
            examples=[_example(candidate, None) for candidate in pool.picks],
            candidates=len(candidates),
            untyped_dropped=len(untyped),
            other_candidates=len(other),
            other_used=bool(pool.picks),
        )

    strata = [
        _Stratum(key=key, order=_stratum_order(pools[key]))
        for key in constraint_classes
        if pools[key]  # empty strata are skipped silently
    ]
    _select_from_strata(strata, count)

    return ExampleSelection(
        examples=[
            _example(candidate, stratum.key) for stratum in strata for candidate in stratum.picks
        ],
        candidates=len(candidates),
        untyped_dropped=len(untyped),
        other_candidates=len(other),
        other_used=False,
        stratum_candidates={key: len(pools[key]) for key in constraint_classes if pools[key]},
        stratum_overlaps=overlaps,
    )
