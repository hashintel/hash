"""Stratified example selection for relation cards (W2a).

Turns the raw example pool (``ExampleRow``s from the offset ladder) into
the bounded, diverse example set a card renders. The selection is a pure
deterministic function of (pool, constraints, taxonomy, seed, pid) — no
wall clock, no network — so a warm-cache rerun reproduces every card
byte-for-byte.

Pipeline:

1. **Candidates.** Pool rows are collapsed into distinct (subject QID,
   object QID) pairs. The example query multiplies rows (one per P31 type
   of the subject), so a candidate carries the order-preserving UNION of
   its subject types. ``wdt:`` in the query already restricts the pool to
   truthy (best-rank) statements.
2. **Strata.** The strata are the property's subject-type constraint
   classes, in declaration order — the same list the card renders under
   ``Source types:``. A candidate belongs to the first constraint class
   that subsumes any of its subject types under the REFLEXIVE local P279
   closure (:class:`~atlas_tools.wikidata.taxonomy.Taxonomy`); without the
   closure most candidates match nothing (Mariupol's P31 is "urban
   hromada", not "municipality").
3. **``other`` / untyped.** Typed candidates matching no constraint class
   land in an explicit ``other`` bucket. ``other`` is DIAGNOSTIC +
   FALLBACK-ONLY: it is counted (a persistently large ``other`` means the
   constraint list is stale — the caller logs a warning above
   :data:`OTHER_WARNING_FRACTION`) and its candidates reach the card only
   when EVERY constraint stratum is empty. Granting ``other`` a regular
   slot would put constraint-VIOLATING pairs back on cards — the
   live-verified reversed P6 statement class of bug the subject-type
   filter exists to stop. Untyped candidates (no P31 at all — the
   reversed-statement signature) are always dropped under stratification.
4. **Slots.** Example budget ``count``: one slot per non-empty stratum
   first (declaration order), remaining slots round-robin in
   volume-descending order. Empty strata are skipped silently (a
   constraint class with no usage is ontology aspiration, not extension).
5. **Within-stratum order.** Deterministic seeded preference order:
   the weighted HEAD first (argmax of ``log1p(subject sitelinks) +
   log1p(object sitelinks)``, ties to earliest arrival), then one UNIFORM
   draw (so the famous/obscure contrast survives), then weighted draws
   without replacement. Selection walks that order, skipping any candidate
   whose subject or object was already used ANYWHERE on the card (one
   Erdoğan); shortfalls from dedup are redistributed to the other strata.

Properties without subject-type constraints (or runs without a taxonomy)
select from a single unstratified pool with the same weighted order and
dedup; their examples carry ``stratum=None`` and render without a stratum
prefix.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass, field

import numpy as np

from atlas_tools.wikidata.model import Example, Pid, pid_number
from atlas_tools.wikidata.sparql import ExampleRow
from atlas_tools.wikidata.taxonomy import Taxonomy

# `other` fraction of typed candidates above which the caller should log a
# stale-constraint-list warning.
OTHER_WARNING_FRACTION = 0.25


@dataclass(frozen=True)
class Candidate:
    """One distinct (subject, object) statement pair from the pool."""

    subject_qid: str
    object_qid: str
    subject_label: str
    object_label: str
    subject_types: tuple[str, ...]  # order-preserving union across pool rows
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
    types: list[str]
    subject_sitelinks: int
    object_sitelinks: int

    def merge(self, row: ExampleRow) -> None:
        if row.subject_type and row.subject_type not in self.types:
            self.types.append(row.subject_type)
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
                types=[row.subject_type] if row.subject_type else [],
                subject_sitelinks=row.subject_sitelinks,
                object_sitelinks=row.object_sitelinks,
            )
        else:
            entry.merge(row)

    # dicts preserve insertion order = pool arrival order.
    return [entry.candidate() for entry in by_pair.values()]


def assign_stratum(
    candidate: Candidate,
    constraint_classes: tuple[Pid, ...],
    taxonomy: Taxonomy,
) -> Pid | None:
    """First declaration-order constraint class subsuming any subject type
    (reflexive P279 closure); ``None`` = the ``other`` bucket."""
    closures = [
        taxonomy.closure(Pid(subject_type))
        for subject_type in candidate.subject_types
        if subject_type
    ]

    for constraint_class in constraint_classes:
        if any(constraint_class in closure for closure in closures):
            return constraint_class

    return None


def _preference_order(
    pool: Sequence[Candidate], rng: np.random.Generator
) -> list[Candidate]:
    """Weighted head, one uniform draw, then weighted draws w/o replacement."""
    if len(pool) <= 1:
        return list(pool)

    head_index = max(range(len(pool)), key=lambda i: (pool[i].weight, -i))
    rest = [candidate for i, candidate in enumerate(pool) if i != head_index]
    order = [pool[head_index]]

    # The contrast slot: uniform, so obscure candidates stay reachable.
    order.append(rest.pop(int(rng.integers(len(rest)))))

    while rest:
        weights = np.array([candidate.weight for candidate in rest])
        total = float(weights.sum())

        if total <= 0.0:
            index = int(rng.integers(len(rest)))
        else:
            index = int(rng.choice(len(rest), p=weights / total))

        order.append(rest.pop(index))

    return order


@dataclass(frozen=True)
class ExampleSelection:
    """Selected examples plus the diagnostics the manifests record."""

    examples: list[Example]
    candidates: int  # distinct candidate pairs in the pool
    untyped_dropped: int  # candidates with no P31 (reversed-statement guard)
    other_candidates: int  # typed candidates matching no constraint class
    other_used: bool  # the all-strata-empty fallback engaged

    @property
    def other_fraction(self) -> float:
        typed = self.candidates - self.untyped_dropped
        return self.other_candidates / typed if typed else 0.0


@dataclass
class _Stratum:
    """Selection state for one stratum (or the unstratified pool)."""

    key: Pid | None
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

            if (
                candidate.subject_token in used_tokens
                or candidate.object_token in used_tokens
            ):
                continue

            used_tokens.add(candidate.subject_token)
            used_tokens.add(candidate.object_token)
            self.picks.append(candidate)

            return True

        return False


def _select_from_strata(strata: list[_Stratum], count: int) -> None:
    """Fill ``picks`` in place: guaranteed slots, volume round-robin, and
    redistribution of dedup shortfalls."""
    used_tokens: set[str] = set()
    budget = count

    # One slot per non-empty stratum, declaration order.
    slots = dict.fromkeys(range(len(strata)), 0)
    for index in range(len(strata)):
        if budget == 0:
            break
        slots[index] = 1
        budget -= 1

    # Remaining slots: rounds in volume-descending order.
    volume_order = sorted(
        range(len(strata)), key=lambda index: (-strata[index].volume, index)
    )
    while budget > 0:
        progressed = False
        for index in volume_order:
            if budget == 0:
                break
            if slots[index] < strata[index].volume:
                slots[index] += 1
                budget -= 1
                progressed = True
        if not progressed:
            break

    # Draw the allocated slots (declaration order: earlier strata win
    # dedup conflicts), then redistribute shortfalls by volume order.
    for index, stratum in enumerate(strata):
        for _ in range(slots[index]):
            if not stratum.take(used_tokens):
                break

    total = sum(len(stratum.picks) for stratum in strata)
    while total < count:
        progressed = False

        for index in volume_order:
            if total == count:
                break

            if strata[index].take(used_tokens):
                total += 1
                progressed = True

        if not progressed:
            break


def _example(candidate: Candidate, stratum: Pid | None) -> Example:
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
    constraint_classes: tuple[Pid, ...],
    taxonomy: Taxonomy | None,
    count: int,
    seed: int,
    pid: str,
) -> ExampleSelection:
    """The full selection (see module docstring).

    Stratification engages only when the property declares subject-type
    constraints AND a taxonomy is available; otherwise the whole pool is
    one unstratified stratum and nothing is dropped. RNG streams are
    ``default_rng([seed, pid number, stratum index])`` — stable per
    stratum, independent of the other strata's pool sizes.
    """
    candidates = collect_candidates(rows)

    def rng_for(stratum_index: int) -> np.random.Generator:
        return np.random.default_rng([seed, pid_number(pid), stratum_index])

    if not constraint_classes or taxonomy is None:
        pool = _Stratum(key=None, order=_preference_order(candidates, rng_for(0)))
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
    pools: dict[Pid, list[Candidate]] = {key: [] for key in constraint_classes}
    for candidate in candidates:
        if not candidate.subject_types:
            untyped.append(candidate)
            continue

        stratum_key = assign_stratum(candidate, constraint_classes, taxonomy)
        if stratum_key is None:
            other.append(candidate)
        else:
            pools[stratum_key].append(candidate)

    if all(not pool for pool in pools.values()):
        # Every declared stratum is empty: the constraint list does not
        # describe actual usage at all. Fall back to the `other` pool
        # (unstratified) rather than emitting an example-less card.
        pool = _Stratum(key=None, order=_preference_order(other, rng_for(0)))
        _select_from_strata([pool], count)
        return ExampleSelection(
            examples=[_example(candidate, None) for candidate in pool.picks],
            candidates=len(candidates),
            untyped_dropped=len(untyped),
            other_candidates=len(other),
            other_used=bool(pool.picks),
        )

    strata = [
        _Stratum(
            key=key,
            order=_preference_order(pools[key], rng_for(index)),
        )
        for index, key in enumerate(constraint_classes)
        if pools[key]  # empty strata are skipped silently
    ]
    _select_from_strata(strata, count)

    return ExampleSelection(
        examples=[
            _example(candidate, stratum.key)
            for stratum in strata
            for candidate in stratum.picks
        ],
        candidates=len(candidates),
        untyped_dropped=len(untyped),
        other_candidates=len(other),
        other_used=False,
    )
