"""Exercise the interactive Coincident queue review workflow."""

import asyncio

from textual.widgets import Static

from atlas_tools.relation.evaluation.domain.api import CardHash, JudgeFamilyId
from atlas_tools.relation.evaluation.visualization.api import (
    CoincidentReviewApp,
    CoincidentReviewDecision,
    CoincidentReviewViewRow,
    CoincidentVoteReviewEvidence,
    run_coincident_review,
)

_FAMILY_A = JudgeFamilyId("judge/a")
_FAMILY_B = JudgeFamilyId("judge/b")


def _row(index: int) -> CoincidentReviewViewRow:
    return CoincidentReviewViewRow(
        relation_id=f"test:relation-{index}",
        card_hash=CardHash(str(index) * 64),
        card_text=f"Exact card {index}.\nThe complete second line remains visible.",
        coincident_families=(_FAMILY_A,),
        coincident_votes=1,
        proximal_votes=1,
        overlay_votes=0,
        unclear_votes=1,
        abstentions=0,
        votes=(
            CoincidentVoteReviewEvidence(
                family_id=_FAMILY_A,
                verdict="coincident",
                repeat_index=0,
                reason=f"Coincident reason {index} with exact evidence.",
            ),
            CoincidentVoteReviewEvidence(
                family_id=_FAMILY_B,
                verdict="proximal",
                repeat_index=1,
                reason=f"Proximal reason {index} with exact evidence.",
            ),
            CoincidentVoteReviewEvidence(
                family_id=_FAMILY_B,
                verdict="unclear",
                repeat_index=2,
                reason=f"Unclear reason {index} with exact evidence.",
            ),
        ),
    )


_ROWS = tuple(_row(index) for index in range(1, 5))


def _rendered_text(app: CoincidentReviewApp, selector: str) -> str:
    return str(app.query_one(selector, Static).render())


def test_pilot_renders_complete_evidence_maps_actions_and_undoes() -> None:
    app = CoincidentReviewApp(_ROWS)

    async def scenario() -> None:
        async with app.run_test(size=(120, 36)) as pilot:
            await pilot.pause()
            assert "Queue row 1 of 4" in _rendered_text(app, "#progress-line")
            assert _ROWS[0].relation_id in _rendered_text(app, "#relation-line")
            assert _ROWS[0].card_hash in _rendered_text(app, "#relation-line")
            tally = _rendered_text(app, "#tally-line")
            assert "C 1" in tally
            assert "P 1" in tally
            assert "O 0" in tally
            assert "U 1" in tally
            assert "ABSTAIN 0" in tally
            assert "judge/a" in _rendered_text(app, "#families-line")
            assert _ROWS[0].card_text == _rendered_text(app, "#card-text")
            votes = _rendered_text(app, "#vote-text")
            for evidence in _ROWS[0].votes:
                assert evidence.family_id in votes
                assert evidence.verdict in votes
                assert f"Repeat  {evidence.repeat_index}" in votes
                assert evidence.reason in votes
            assert "Vote 3 of 3" in votes
            assert "r Reject C - remove Coincident votes" in _rendered_text(app, "#action-line")

            await pilot.press("c")
            await pilot.press("r")
            await pilot.press("u")
            assert "Queue row 2 of 4" in _rendered_text(app, "#progress-line")
            assert "1 reviewed" in _rendered_text(app, "#progress-line")

            await pilot.press("r")
            await pilot.press("c")
            await pilot.press("x")

    asyncio.run(scenario())

    assert app.return_value == (
        CoincidentReviewDecision(
            relation_id=_ROWS[0].relation_id,
            card_hash=_ROWS[0].card_hash,
            action="confirmed",
        ),
        CoincidentReviewDecision(
            relation_id=_ROWS[1].relation_id,
            card_hash=_ROWS[1].card_hash,
            action="rejected",
        ),
        CoincidentReviewDecision(
            relation_id=_ROWS[2].relation_id,
            card_hash=_ROWS[2].card_hash,
            action="confirmed",
        ),
        CoincidentReviewDecision(
            relation_id=_ROWS[3].relation_id,
            card_hash=_ROWS[3].card_hash,
            action="excluded",
        ),
    )


def test_pilot_cancel_returns_none_after_partial_review() -> None:
    app = CoincidentReviewApp(_ROWS)

    async def scenario() -> None:
        async with app.run_test(size=(120, 36)) as pilot:
            await pilot.press("c")
            assert _ROWS[1].relation_id in _rendered_text(app, "#relation-line")
            await pilot.press("q")

    asyncio.run(scenario())

    assert app.return_value is None


def test_rejecting_all_coincident_evidence_requires_full_adjudication() -> None:
    row = CoincidentReviewViewRow(
        relation_id="test:all-coincident",
        card_hash=CardHash("f" * 64),
        card_text="All Coincident evidence.",
        coincident_families=(_FAMILY_A,),
        coincident_votes=1,
        proximal_votes=0,
        overlay_votes=0,
        unclear_votes=0,
        abstentions=0,
        votes=(
            CoincidentVoteReviewEvidence(
                family_id=_FAMILY_A,
                verdict="coincident",
                repeat_index=0,
                reason="Only Coincident evidence remains.",
            ),
        ),
    )
    app = CoincidentReviewApp((row,))

    async def scenario() -> None:
        async with app.run_test(size=(120, 36)) as pilot:
            await pilot.press("r")
            assert app.return_value is None
            assert "0 reviewed" in _rendered_text(app, "#progress-line")
            await pilot.press("x")

    asyncio.run(scenario())
    assert app.return_value == (
        CoincidentReviewDecision(
            relation_id=row.relation_id,
            card_hash=row.card_hash,
            action="excluded",
        ),
    )


def test_empty_review_completes_without_starting_textual() -> None:
    assert run_coincident_review(()) == ()
