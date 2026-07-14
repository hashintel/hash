"""Plan the factorial pilot as a replayable, bounded-memory task stream.

The plan traverses the complete 3 by 3 prompt bundle grid for every card and
judge. Repeat and higher-effort arms follow the S1xF1 baseline before the
remaining bundles. Judge streams are interleaved round-robin, so the order is
stable while consecutive scheduling rounds cover every active family.
"""

from collections.abc import Iterator
from dataclasses import dataclass

from atlas_tools.relation.evaluation.domain.api import (
    BUNDLES,
    QUALIFICATION_BUNDLE,
    BundleId,
    CardHash,
    JudgeConfig,
    PilotRunConfig,
    PromptPackHash,
    ReasoningEffort,
    RelationId,
    VoteTask,
)
from atlas_tools.relation.evaluation.modes._card import ordered_unique_cards
from atlas_tools.relation.evaluation.modes._stream import round_robin


@dataclass(frozen=True, slots=True)
class PilotCard:
    """A sampled card and its fixed holdout membership."""

    relation_id: RelationId
    card_hash: CardHash
    is_holdout: bool


@dataclass(frozen=True, slots=True)
class PilotPlan:
    """A deterministic pilot plan that can be traversed more than once.

    Cards are normalized to ascending relation ID order. Duplicate relation
    IDs are rejected because they would create duplicate logical vote IDs.
    Calling [`tasks`][PilotPlan.tasks] allocates only one iterator per judge in
    addition to the immutable card tuple.
    """

    config: PilotRunConfig
    cards: tuple[PilotCard, ...]
    prompt_pack_hash: PromptPackHash

    def __post_init__(self) -> None:
        object.__setattr__(self, "cards", ordered_unique_cards(self.cards))

    @property
    def expected_votes(self) -> int:
        """Return the exact number of logical votes yielded by each traversal."""
        card_count = len(self.cards)
        non_holdout_count = sum(not card.is_holdout for card in self.cards)
        baseline = len(self.config.judges) * len(BUNDLES) * card_count
        repeats = len(self.config.judges) * self.config.repeat_count * non_holdout_count
        effort = sum(card_count for judge in self.config.judges if judge.higher_effort is not None)
        return baseline + repeats + effort

    def tasks(self) -> Iterator[VoteTask]:
        """Yield the stable round-robin task order from its beginning."""
        streams = (self._judge_tasks(judge) for judge in self.config.judges)
        yield from round_robin(streams)

    def _judge_tasks(self, judge: JudgeConfig) -> Iterator[VoteTask]:
        for bundle in BUNDLES:
            for card in self.cards:
                yield self._task(
                    judge=judge,
                    bundle=bundle,
                    card=card,
                    effort=self.config.baseline_effort,
                    repeat_index=0,
                )
            if bundle != QUALIFICATION_BUNDLE:
                continue
            for repeat_index in range(1, self.config.repeat_count + 1):
                for card in self.cards:
                    if not card.is_holdout:
                        yield self._task(
                            judge=judge,
                            bundle=bundle,
                            card=card,
                            effort=self.config.baseline_effort,
                            repeat_index=repeat_index,
                        )
            if judge.higher_effort is not None:
                for card in self.cards:
                    yield self._task(
                        judge=judge,
                        bundle=bundle,
                        card=card,
                        effort=judge.higher_effort,
                        repeat_index=0,
                    )

    def _task(
        self,
        *,
        judge: JudgeConfig,
        bundle: BundleId,
        card: PilotCard,
        effort: ReasoningEffort,
        repeat_index: int,
    ) -> VoteTask:
        return VoteTask(
            judge=judge,
            bundle_id=bundle,
            relation_id=card.relation_id,
            card_hash=card.card_hash,
            effort=effort,
            repeat_index=repeat_index,
            prompt_pack_hash=self.prompt_pack_hash,
            rubric_version=self.config.rubric_version,
        )
