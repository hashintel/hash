"""Deterministic, datasource-neutral relation-example selection.

Adapters remain responsible for acquiring candidates, deciding which
candidates are semantically eligible, and assigning them to ordered strata.
This module handles the mechanics shared by relation-card sources:

1. order each stratum by recognizability while interleaving subgroups;
2. guarantee every non-empty stratum a slot, then deal capped rounds;
3. relax the cap when otherwise-unused budget remains;
4. reject candidates that reuse either endpoint or an adapter-defined
   conflict token anywhere on the card; and
5. redistribute slots lost to endpoint conflicts.

Input order is the final deterministic tie-break throughout. Selected
examples are returned grouped in stratum declaration order, matching the
order used by the canonical card renderer.
"""

from collections.abc import Hashable, Sequence
from dataclasses import dataclass, field

DEFAULT_STRATUM_SLOT_CAP = 3


@dataclass(frozen=True)
class ExampleCandidate[PayloadT]:
    """One adapter-owned candidate annotated for common selection."""

    payload: PayloadT
    subject_token: str
    object_token: str
    subgroup: Hashable
    recognizability: float
    # Adapters use these for text-level conflicts that endpoint identity does
    # not capture, such as duplicate rendered pairs across separate tenants.
    additional_conflict_tokens: frozenset[str] = frozenset()


@dataclass(frozen=True)
class ExampleStratum[StratumT, PayloadT]:
    """An ordered semantic stratum and its eligible candidate pool."""

    key: StratumT
    candidates: tuple[ExampleCandidate[PayloadT], ...]


@dataclass(frozen=True)
class SelectedExample[StratumT, PayloadT]:
    """An adapter payload selected for one semantic stratum."""

    stratum: StratumT
    payload: PayloadT


def _scale_diverse_order[PayloadT](
    pool: Sequence[ExampleCandidate[PayloadT]],
) -> list[ExampleCandidate[PayloadT]]:
    """Put the strongest candidate first, interleaving subgroups thereafter."""
    groups: dict[Hashable, list[tuple[int, ExampleCandidate[PayloadT]]]] = {}
    for arrival, candidate in enumerate(pool):
        groups.setdefault(candidate.subgroup, []).append((arrival, candidate))

    for members in groups.values():
        members.sort(key=lambda member: (-member[1].recognizability, member[0]))

    ranked_groups = sorted(
        groups.values(),
        key=lambda members: (-members[0][1].recognizability, members[0][0]),
    )

    order: list[ExampleCandidate[PayloadT]] = []
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


@dataclass
class _Stratum[StratumT, PayloadT]:
    key: StratumT
    order: list[ExampleCandidate[PayloadT]]
    pointer: int = 0
    picks: list[ExampleCandidate[PayloadT]] = field(default_factory=list)

    @property
    def volume(self) -> int:
        return len(self.order)

    def take(self, used_tokens: set[str]) -> bool:
        """Advance past endpoint conflicts and take one candidate, if possible."""
        while self.pointer < len(self.order):
            candidate = self.order[self.pointer]
            self.pointer += 1
            conflict_tokens = {
                candidate.subject_token,
                candidate.object_token,
                *candidate.additional_conflict_tokens,
            }

            if not used_tokens.isdisjoint(conflict_tokens):
                continue

            used_tokens.update(conflict_tokens)
            self.picks.append(candidate)
            return True

        return False


def _allocate_slots[StratumT, PayloadT](
    strata: Sequence[_Stratum[StratumT, PayloadT]],
    count: int,
    slot_cap: int,
) -> dict[int, int]:
    """Allocate guaranteed, capped, then relaxed slots in stratum order."""
    budget = count
    slots = dict.fromkeys(range(len(strata)), 0)
    for index in range(len(strata)):
        if budget == 0:
            break
        slots[index] = 1
        budget -= 1

    for ceiling in (slot_cap, None):
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


def _redistribute_shortfall[StratumT, PayloadT](
    strata: Sequence[_Stratum[StratumT, PayloadT]],
    count: int,
    used_tokens: set[str],
) -> None:
    """Refill endpoint-dedup shortfalls round-robin across all strata."""
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


def _select_from_strata[StratumT, PayloadT](
    strata: Sequence[_Stratum[StratumT, PayloadT]],
    count: int,
    slot_cap: int,
) -> None:
    used_tokens: set[str] = set()
    slots = _allocate_slots(strata, count, slot_cap)

    for index, stratum in enumerate(strata):
        for _ in range(slots[index]):
            if not stratum.take(used_tokens):
                break

    _redistribute_shortfall(strata, count, used_tokens)


def select_diverse_examples[StratumT, PayloadT](
    strata: Sequence[ExampleStratum[StratumT, PayloadT]],
    *,
    count: int,
    slot_cap: int = DEFAULT_STRATUM_SLOT_CAP,
) -> tuple[SelectedExample[StratumT, PayloadT], ...]:
    """Select a bounded, diverse, endpoint-disjoint example set.

    Empty strata do not consume guaranteed slots. ``count`` may be zero;
    negative counts and non-positive caps are rejected as configuration errors.
    """
    if count < 0:
        raise ValueError("example count must be non-negative")
    if slot_cap < 1:
        raise ValueError("example stratum slot cap must be positive")

    selection_state = [
        _Stratum(key=stratum.key, order=_scale_diverse_order(stratum.candidates))
        for stratum in strata
        if stratum.candidates
    ]
    _select_from_strata(selection_state, count, slot_cap)

    return tuple(
        SelectedExample(stratum=stratum.key, payload=candidate.payload)
        for stratum in selection_state
        for candidate in stratum.picks
    )
