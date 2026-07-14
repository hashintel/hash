"""Plan both production-grid phases from immutable baseline evidence.

Phase A fills baseline S1xF1 cells not imported from the pilot. Phase B buys
repeat indices 1 and 2 for cards whose baseline row is non-unanimous, contains
a coincident verdict, or contains an abstention. Both phases preserve relation
order inside each family stream and interleave those streams round-robin.
"""

from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from typing import Self

from atlas_tools.relation.evaluation.domain.api import (
    QUALIFICATION_BUNDLE,
    VERDICTS,
    GridJudge,
    GridRunConfig,
    RelationId,
    Sha256Hex,
    VoteTask,
    VoteVerdict,
)
from atlas_tools.relation.evaluation.modes._card import ordered_unique_cards
from atlas_tools.relation.evaluation.modes._stream import round_robin

BASELINE_REPEAT_INDEX = 0
REFINEMENT_REPEAT_INDICES = (1, 2)
_VOTE_VERDICTS = frozenset((*VERDICTS, "ABSTAIN"))


class IncompleteBaselineError(ValueError):
    """A baseline row lacks evidence required to decide Phase B."""


@dataclass(frozen=True, slots=True)
class GridCard:
    """A production card identified by the exact content presented to judges."""

    relation_id: RelationId
    card_hash: Sha256Hex


def grid_task(
    *,
    config: GridRunConfig,
    judge: GridJudge,
    card: GridCard,
    repeat_index: int,
    prompt_pack_hash: Sha256Hex,
) -> VoteTask:
    """Build one grid task from the seat's resolved effort."""
    return VoteTask(
        judge=judge,
        bundle_id=QUALIFICATION_BUNDLE,
        relation_id=card.relation_id,
        card_hash=card.card_hash,
        effort=config.judge_effort(judge),
        repeat_index=repeat_index,
        prompt_pack_hash=prompt_pack_hash,
        rubric_version=config.rubric_version,
    )


def refinement_trigger(verdicts: Sequence[VoteVerdict]) -> bool:
    """Decide whether a complete baseline row requires two repeat passes.

    The row must contain at least one verdict. Unknown verdict strings are
    rejected rather than silently changing the refinement population.
    """
    if not verdicts:
        raise ValueError("a baseline row must contain at least one verdict")
    invalid = sorted(set(verdicts) - _VOTE_VERDICTS)
    if invalid:
        raise ValueError(f"baseline row contains invalid verdicts: {invalid}")
    return "ABSTAIN" in verdicts or "coincident" in verdicts or len(set(verdicts)) != 1


@dataclass(frozen=True, slots=True)
class GridPhaseAPlan:
    """The fresh baseline cells left after exact pilot-vote import.

    Imported IDs must belong to this baseline. This catches a mismatched pilot
    at the planning boundary instead of quietly omitting or buying unrelated
    work.
    """

    config: GridRunConfig
    cards: tuple[GridCard, ...]
    prompt_pack_hash: Sha256Hex
    imported_vote_ids: frozenset[Sha256Hex] = frozenset()

    def __post_init__(self) -> None:
        ordered = ordered_unique_cards(self.cards)
        object.__setattr__(self, "cards", ordered)
        unknown = set(self.imported_vote_ids)
        if unknown:
            for judge in self.config.judges:
                for card in ordered:
                    task = grid_task(
                        config=self.config,
                        judge=judge,
                        card=card,
                        repeat_index=BASELINE_REPEAT_INDEX,
                        prompt_pack_hash=self.prompt_pack_hash,
                    )
                    unknown.discard(task.vote_id)
                if not unknown:
                    break
        if unknown:
            preview = ", ".join(sorted(unknown)[:3])
            raise ValueError(f"imported vote IDs are outside the grid baseline: {preview}")

    @property
    def expected_votes(self) -> int:
        """Return the number of baseline cells that still require a request."""
        baseline = len(self.config.judges) * len(self.cards)
        return baseline - len(self.imported_vote_ids)

    def tasks(self) -> Iterator[VoteTask]:
        """Yield fresh baseline cells in stable family round-robin order."""
        streams = (self._judge_tasks(judge) for judge in self.config.judges)
        yield from round_robin(streams)

    def _judge_tasks(self, judge: GridJudge) -> Iterator[VoteTask]:
        for card in self.cards:
            task = grid_task(
                config=self.config,
                judge=judge,
                card=card,
                repeat_index=BASELINE_REPEAT_INDEX,
                prompt_pack_hash=self.prompt_pack_hash,
            )
            if task.vote_id not in self.imported_vote_ids:
                yield task


@dataclass(frozen=True, slots=True)
class GridPhaseBPlan:
    """Two repeat passes for every card selected from complete baseline rows."""

    config: GridRunConfig
    cards: tuple[GridCard, ...]
    prompt_pack_hash: Sha256Hex

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "cards",
            ordered_unique_cards(self.cards, allow_empty=True),
        )

    @classmethod
    def from_baseline(
        cls,
        *,
        config: GridRunConfig,
        cards: tuple[GridCard, ...],
        prompt_pack_hash: Sha256Hex,
        verdicts_by_vote_id: Mapping[Sha256Hex, VoteVerdict],
    ) -> Self:
        """Select refined cards from a complete imported-plus-fresh baseline.

        Raises [`IncompleteBaselineError`] as soon as one planned cell has no
        verdict. Entries outside the baseline are ignored so a resumed run may
        pass a journal that already contains refinement votes.
        """
        ordered = ordered_unique_cards(cards)
        refined: list[GridCard] = []
        for card in ordered:
            verdicts: list[VoteVerdict] = []
            for judge in config.judges:
                task = grid_task(
                    config=config,
                    judge=judge,
                    card=card,
                    repeat_index=BASELINE_REPEAT_INDEX,
                    prompt_pack_hash=prompt_pack_hash,
                )
                try:
                    verdicts.append(verdicts_by_vote_id[task.vote_id])
                except KeyError:
                    raise IncompleteBaselineError(
                        f"card {card.relation_id} lacks a baseline verdict for {judge.family_id}"
                    ) from None
            if refinement_trigger(verdicts):
                refined.append(card)
        return cls(config=config, cards=tuple(refined), prompt_pack_hash=prompt_pack_hash)

    @property
    def expected_votes(self) -> int:
        """Return the exact number of refinement votes in this phase."""
        return len(self.config.judges) * len(self.cards) * len(REFINEMENT_REPEAT_INDICES)

    def tasks(self) -> Iterator[VoteTask]:
        """Yield repeat tasks in stable family round-robin order."""
        streams = (self._judge_tasks(judge) for judge in self.config.judges)
        yield from round_robin(streams)

    def _judge_tasks(self, judge: GridJudge) -> Iterator[VoteTask]:
        for card in self.cards:
            for repeat_index in REFINEMENT_REPEAT_INDICES:
                yield grid_task(
                    config=self.config,
                    judge=judge,
                    card=card,
                    repeat_index=repeat_index,
                    prompt_pack_hash=self.prompt_pack_hash,
                )


@dataclass(frozen=True, slots=True)
class GridPlan:
    """A replayable cumulative plan containing Phase A and optional Phase B."""

    phase_a: GridPhaseAPlan
    phase_b: GridPhaseBPlan | None = None

    def __post_init__(self) -> None:
        if self.phase_b is None:
            return
        if self.phase_b.config != self.phase_a.config:
            raise ValueError("grid phases must use the same run config")
        if self.phase_b.prompt_pack_hash != self.phase_a.prompt_pack_hash:
            raise ValueError("grid phases must use the same prompt pack")

    @property
    def expected_votes(self) -> int:
        """Return the number of fresh tasks across every available phase."""
        phase_b_votes = self.phase_b.expected_votes if self.phase_b is not None else 0
        return self.phase_a.expected_votes + phase_b_votes

    def tasks(self) -> Iterator[VoteTask]:
        """Yield Phase A completely before yielding Phase B."""
        yield from self.phase_a.tasks()
        if self.phase_b is not None:
            yield from self.phase_b.tasks()
