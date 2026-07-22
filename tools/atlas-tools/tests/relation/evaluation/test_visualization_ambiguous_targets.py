"""Exercise the interactive all-ambiguous target review workflow."""

import asyncio

from textual.widgets import Static

from atlas_tools.relation.evaluation.visualization.api import (
    AmbiguousTargetDecision,
    AmbiguousTargetReviewApp,
    AmbiguousTargetReviewRow,
    run_ambiguous_target_review,
)

_ROWS = (
    AmbiguousTargetReviewRow(
        relation_id="relation/a",
        card_hash="hash-a",
        card_text="First complete card.\nIts second line remains visible.",
        unclear_votes=7,
        abstentions=2,
    ),
    AmbiguousTargetReviewRow(
        relation_id="relation/b",
        card_hash="hash-b",
        card_text="Second complete card.",
        unclear_votes=5,
        abstentions=4,
    ),
    AmbiguousTargetReviewRow(
        relation_id="relation/c",
        card_hash="hash-c",
        card_text="Third complete card.",
        unclear_votes=6,
        abstentions=3,
    ),
    AmbiguousTargetReviewRow(
        relation_id="relation/d",
        card_hash="hash-d",
        card_text="Fourth complete card.",
        unclear_votes=8,
        abstentions=1,
    ),
)


def _rendered_text(app: AmbiguousTargetReviewApp, selector: str) -> str:
    return str(app.query_one(selector, Static).render())


def test_pilot_maps_actions_completes_in_input_order_and_undoes() -> None:
    app = AmbiguousTargetReviewApp(_ROWS)

    async def scenario() -> None:
        async with app.run_test(size=(100, 24)) as pilot:
            await pilot.pause()
            assert "Target 1 of 4" in _rendered_text(app, "#progress-line")
            assert "relation/a" in _rendered_text(app, "#relation-line")
            assert "hash-a" in _rendered_text(app, "#relation-line")
            assert "7 unclear votes" in _rendered_text(app, "#tally-line")
            assert "2 abstentions" in _rendered_text(app, "#tally-line")
            assert _ROWS[0].card_text == _rendered_text(app, "#card-text")
            assert "c Coincident - one referent" in _rendered_text(app, "#action-line")
            assert "q cancel" in _rendered_text(app, "#action-line")

            await pilot.press("c")
            await pilot.press("p")
            await pilot.press("u")
            assert "Target 2 of 4" in _rendered_text(app, "#progress-line")
            assert "1 reviewed" in _rendered_text(app, "#progress-line")
            assert "relation/b" in _rendered_text(app, "#relation-line")

            await pilot.press("o")
            await pilot.press("p")
            await pilot.press("x")

    asyncio.run(scenario())

    assert app.return_value == (
        AmbiguousTargetDecision(
            relation_id="relation/a",
            card_hash="hash-a",
            action="coincident",
        ),
        AmbiguousTargetDecision(
            relation_id="relation/b",
            card_hash="hash-b",
            action="overlay",
        ),
        AmbiguousTargetDecision(
            relation_id="relation/c",
            card_hash="hash-c",
            action="proximal",
        ),
        AmbiguousTargetDecision(
            relation_id="relation/d",
            card_hash="hash-d",
            action="excluded",
        ),
    )


def test_pilot_cancel_returns_none_after_partial_review() -> None:
    app = AmbiguousTargetReviewApp(_ROWS)

    async def scenario() -> None:
        async with app.run_test(size=(100, 24)) as pilot:
            await pilot.press("c")
            assert "relation/b" in _rendered_text(app, "#relation-line")
            await pilot.press("q")

    asyncio.run(scenario())

    assert app.return_value is None


def test_empty_review_completes_without_starting_textual() -> None:
    assert run_ambiguous_target_review(()) == ()
