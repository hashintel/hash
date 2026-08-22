"""Re-derive the dynamic grid plan from its durable baseline prefix."""

from collections.abc import Sequence

from atlas_tools.relation.evaluation.application.preparation import PreparedGrid
from atlas_tools.relation.evaluation.domain.api import Vote, VoteId, VoteVerdict
from atlas_tools.relation.evaluation.modes.api import (
    HOLDOUTS,
    GridCanaryPlan,
    GridPhaseBPlan,
    GridPlan,
)


def derive_grid_plan(
    prepared: PreparedGrid,
    fresh_votes: Sequence[Vote],
) -> GridPlan:
    """Return Phase A alone or the exact refinement plan it determines.

    Phase B is defined only after every fresh Phase A vote has committed.
    Imported pilot votes fill the baseline cells omitted from Phase A. Extra
    fresh votes are refinement evidence and cannot change the derived task set.
    """
    phase_a = prepared.phase_a
    if len(fresh_votes) < phase_a.expected_votes:
        return GridPlan(phase_a=phase_a)

    verdicts: dict[VoteId, VoteVerdict] = {
        vote.vote_id: vote.verdict for vote in prepared.pilot_import.votes
    }
    for vote in fresh_votes[: phase_a.expected_votes]:
        if vote.vote_id in verdicts:
            raise ValueError(f"fresh baseline duplicates imported vote {vote.vote_id}")
        verdicts[vote.vote_id] = vote.verdict
    phase_b = GridPhaseBPlan.from_baseline(
        config=prepared.config,
        cards=phase_a.cards,
        prompt_pack_hash=prepared.prompt_pack.content_hash,
        verdicts_by_vote_id=verdicts,
    )
    holdout_ids = frozenset(holdout.relation_id for holdout in HOLDOUTS)
    canary_cards = tuple(card for card in phase_a.cards if card.relation_id in holdout_ids)
    if len(canary_cards) != len(holdout_ids):
        raise ValueError("grid plan does not contain every fixed holdout canary")
    canary = GridCanaryPlan(
        config=prepared.config,
        cards=canary_cards,
        prompt_pack_hash=prepared.prompt_pack.content_hash,
    )
    return GridPlan(phase_a=phase_a, phase_b=phase_b, canary=canary)


def split_grid_votes(
    plan: GridPlan,
    votes: Sequence[Vote],
) -> tuple[tuple[Vote, ...], tuple[Vote, ...]]:
    """Separate production cells from appended fresh holdout canaries."""
    if len(votes) != plan.expected_votes:
        raise ValueError(
            f"grid journal contains {len(votes)} votes for a {plan.expected_votes}-vote plan"
        )
    rows = tuple(votes)
    return rows[: plan.analysis_votes], rows[plan.analysis_votes :]
