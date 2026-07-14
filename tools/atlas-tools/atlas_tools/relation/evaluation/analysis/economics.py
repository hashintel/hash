"""Account for imported, fresh, refinement, abstention, and cost evidence."""

import math
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Self

from pydantic import NonNegativeInt, PositiveInt, computed_field, model_validator

from atlas_tools.relation.evaluation.analysis._model import AnalysisModel
from atlas_tools.relation.evaluation.analysis.grid import GridAnalysis, GridVote
from atlas_tools.relation.evaluation.domain.api import (
    JudgeFamilyId,
    NonNegativeFiniteFloat,
    Probability,
    Vote,
)


@dataclass(slots=True)
class _FamilyAccumulator:
    imported_votes: int = 0
    fresh_baseline_votes: int = 0
    refinement_votes: int = 0
    canary_votes: int = 0
    abstentions: int = 0
    fresh_costs: list[float] = field(default_factory=list)
    cost_complete: bool = True

    def add(self, observed: GridVote) -> None:
        vote = observed.vote
        self.abstentions += vote.abstained
        if observed.source == "imported":
            self.imported_votes += 1
            return
        self.fresh_costs.append(vote.known_cost_usd)
        self.cost_complete = self.cost_complete and vote.cost_complete
        if vote.repeat_index == 0:
            self.fresh_baseline_votes += 1
        else:
            self.refinement_votes += 1

    def add_canary(self, vote: Vote) -> None:
        self.canary_votes += 1
        self.abstentions += vote.abstained
        self.fresh_costs.append(vote.known_cost_usd)
        self.cost_complete = self.cost_complete and vote.cost_complete


class FamilyEconomics(AnalysisModel):
    """One family's vote sources, abstentions, and fresh billing evidence."""

    family_id: JudgeFamilyId
    imported_votes: NonNegativeInt
    fresh_baseline_votes: NonNegativeInt
    refinement_votes: NonNegativeInt
    canary_votes: NonNegativeInt = 0
    abstentions: NonNegativeInt
    known_cost_usd: NonNegativeFiniteFloat
    cost_complete: bool

    @model_validator(mode="after")
    def check_counts(self) -> Self:
        if self.total_votes == 0:
            raise ValueError("family economics requires at least one logical vote")
        if self.abstentions > self.total_votes:
            raise ValueError("abstentions cannot exceed logical votes")
        return self

    @computed_field
    @property
    def total_votes(self) -> int:
        """Count imported and fresh logical votes."""
        return (
            self.imported_votes
            + self.fresh_baseline_votes
            + self.refinement_votes
            + self.canary_votes
        )

    @computed_field
    @property
    def abstention_rate(self) -> Probability:
        """Return abstentions divided by this family's logical votes."""
        return self.abstentions / self.total_votes


class VoteEconomics(AnalysisModel):
    """Run-level vote counts and fresh known cost, with family detail."""

    pool_cards: PositiveInt
    refined_cards: NonNegativeInt
    review_queue_cards: NonNegativeInt
    by_family: tuple[FamilyEconomics, ...]

    @computed_field
    @property
    def total_votes(self) -> int:
        """Count all logical votes across judge families."""
        return sum(row.total_votes for row in self.by_family)

    @computed_field
    @property
    def total_known_cost_usd(self) -> float:
        """Sum the known cost of fresh votes across judge families."""
        return math.fsum(row.known_cost_usd for row in self.by_family)

    @computed_field
    @property
    def cost_complete(self) -> bool:
        """Return whether every fresh vote has complete billing evidence."""
        return all(row.cost_complete for row in self.by_family)

    @computed_field
    @property
    def realized_trigger_rate(self) -> Probability:
        """Return the fraction of cards routed through refinement."""
        return self.refined_cards / self.pool_cards

    @model_validator(mode="after")
    def check_family_shape(self) -> Self:
        family_ids = tuple(row.family_id for row in self.by_family)
        if not family_ids:
            raise ValueError("vote economics requires at least one judge family")
        if family_ids != tuple(sorted(family_ids)) or len(family_ids) != len(set(family_ids)):
            raise ValueError("economics families must be unique and sorted")
        for row in self.by_family:
            if row.imported_votes + row.fresh_baseline_votes != self.pool_cards:
                raise ValueError("each family must have one baseline vote per pool card")
            if row.refinement_votes != 2 * self.refined_cards:
                raise ValueError("each family must have two votes per refined card")
        return self

    @model_validator(mode="after")
    def check_card_counts(self) -> Self:
        if self.refined_cards > self.pool_cards:
            raise ValueError("refined cards cannot exceed pool cards")
        if self.review_queue_cards > self.pool_cards:
            raise ValueError("review queue cards cannot exceed pool cards")
        return self


def vote_economics(
    analysis: GridAnalysis,
    *,
    canary_votes: Sequence[Vote] = (),
) -> VoteEconomics:
    """Aggregate counts and cost in one pass over reconciled cells.

    Imported pilot cost is excluded because the production run did not buy it.
    Every fresh vote contributes its known cost even when complete billing is
    unavailable, matching the executor's conservative accounting boundary.
    """
    accumulators = {family_id: _FamilyAccumulator() for family_id in analysis.family_ids}
    for card in analysis.cards:
        for family in card.families:
            accumulator = accumulators[family.family_id]
            for observed in family.votes():
                accumulator.add(observed)
    for vote in canary_votes:
        try:
            accumulator = accumulators[vote.family_id]
        except KeyError:
            raise ValueError(f"canary vote uses unseated family {vote.family_id}") from None
        accumulator.add_canary(vote)
    families = tuple(
        FamilyEconomics(
            family_id=family_id,
            imported_votes=accumulator.imported_votes,
            fresh_baseline_votes=accumulator.fresh_baseline_votes,
            refinement_votes=accumulator.refinement_votes,
            canary_votes=accumulator.canary_votes,
            abstentions=accumulator.abstentions,
            known_cost_usd=math.fsum(accumulator.fresh_costs),
            cost_complete=accumulator.cost_complete,
        )
        for family_id, accumulator in accumulators.items()
    )
    refined_cards = sum(card.refined for card in analysis.cards)
    return VoteEconomics(
        pool_cards=len(analysis.cards),
        refined_cards=refined_cards,
        review_queue_cards=sum(card.tally.coincident > 0 for card in analysis.cards),
        by_family=families,
    )
