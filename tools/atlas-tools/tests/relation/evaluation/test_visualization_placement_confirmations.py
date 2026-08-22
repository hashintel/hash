import asyncio

from textual.widgets import Static

from atlas_tools.relation.evaluation.visualization.api import (
    PlacementConfirmationApp,
    PlacementConfirmationDecision,
    PlacementConfirmationReviewRow,
    run_placement_confirmation,
)

_ROWS = (
    PlacementConfirmationReviewRow(
        relation_id="relation/a",
        card_hash="hash-a",
        card_text="First complete card.\nIts second line remains visible.",
        coincident_votes=0,
        proximal_votes=4,
        overlay_votes=1,
    ),
    PlacementConfirmationReviewRow(
        relation_id="relation/b",
        card_hash="hash-b",
        card_text="Second card.",
        coincident_votes=2,
        proximal_votes=0,
        overlay_votes=3,
    ),
    PlacementConfirmationReviewRow(
        relation_id="relation/c",
        card_hash="hash-c",
        card_text="Third card.",
        coincident_votes=0,
        proximal_votes=0,
        overlay_votes=5,
    ),
)


def _rendered_text(app: PlacementConfirmationApp, selector: str) -> str:
    return str(app.query_one(selector, Static).render())


def test_pilot_confirms_skips_and_undoes_in_input_order() -> None:
    app = PlacementConfirmationApp(_ROWS)

    async def scenario() -> None:
        async with app.run_test(size=(100, 24)) as pilot:
            await pilot.pause()
            assert "Card 1 of 3" in _rendered_text(app, "#progress-line")
            assert "relation/a" in _rendered_text(app, "#relation-line")
            assert "P 4" in _rendered_text(app, "#tally-line")
            await pilot.press("p")
            assert "relation/b" in _rendered_text(app, "#relation-line")
            await pilot.press("s")
            assert "relation/c" in _rendered_text(app, "#relation-line")
            await pilot.press("u")
            assert "relation/b" in _rendered_text(app, "#relation-line")
            await pilot.press("x")
            await pilot.press("o")

    asyncio.run(scenario())
    assert app.return_value == (
        PlacementConfirmationDecision(
            relation_id="relation/a",
            card_hash="hash-a",
            action="proximal",
        ),
        PlacementConfirmationDecision(
            relation_id="relation/b",
            card_hash="hash-b",
            action="excluded",
        ),
        PlacementConfirmationDecision(
            relation_id="relation/c",
            card_hash="hash-c",
            action="overlay",
        ),
    )


def test_pilot_done_keeps_partial_decisions_and_cancel_discards() -> None:
    app = PlacementConfirmationApp(_ROWS)

    async def scenario() -> None:
        async with app.run_test(size=(100, 24)) as pilot:
            await pilot.press("c")
            await pilot.press("d")

    asyncio.run(scenario())
    assert app.return_value == (
        PlacementConfirmationDecision(
            relation_id="relation/a",
            card_hash="hash-a",
            action="coincident",
        ),
    )

    cancelled = PlacementConfirmationApp(_ROWS)

    async def cancel_scenario() -> None:
        async with cancelled.run_test(size=(100, 24)) as pilot:
            await pilot.press("p")
            await pilot.press("q")

    asyncio.run(cancel_scenario())
    assert cancelled.return_value is None


def test_empty_confirmation_completes_without_starting_textual() -> None:
    assert run_placement_confirmation(()) == ()
