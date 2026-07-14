"""Re-derive the dynamic grid plan from its durable baseline prefix."""

from collections.abc import Sequence

from atlas_tools.relation.evaluation.application.preparation import PreparedGrid
from atlas_tools.relation.evaluation.domain.api import Sha256Hex, Vote, VoteVerdict
from atlas_tools.relation.evaluation.modes.api import GridPhaseBPlan, GridPlan


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

    verdicts: dict[Sha256Hex, VoteVerdict] = {
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
    return GridPlan(phase_a=phase_a, phase_b=phase_b)
