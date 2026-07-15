import asyncio
from datetime import UTC, datetime, timedelta
from threading import Event

from rich.console import Console
from textual.geometry import Size
from textual.widgets import DataTable

from atlas_tools.relation.evaluation.visualization.api import (
    GridFamilyStatus,
    GridPhaseStatus,
    GridStatusApp,
    GridStatusSnapshot,
    RunActivity,
    build_grid_status_renderable,
)

_NOW = datetime(2026, 7, 15, 12, tzinfo=UTC)


def _snapshot(
    *,
    completed: int,
    committed: int | None = None,
    activity: RunActivity = "running",
) -> GridStatusSnapshot:
    durable = completed if committed is None else committed
    family = GridFamilyStatus(
        family_id="judge/a",
        completed=completed,
        committed=durable,
        total=4,
        rate_per_minute=6.0,
        eta_seconds=(4 - completed) * 10.0 if completed < 4 else None,
        known_spend_usd=1.25,
        cost_complete=True,
        attempts=completed,
        repair_attempts=0,
        failed_attempts=0,
        open_votes=0,
        last_activity_at=_NOW - timedelta(seconds=5),
    )
    phases = (
        GridPhaseStatus(
            name="baseline",
            completed=min(completed, 1),
            committed=min(durable, 1),
            total=1,
        ),
        GridPhaseStatus(
            name="refinement",
            completed=min(max(completed - 1, 0), 2),
            committed=min(max(durable - 1, 0), 2),
            total=2,
        ),
        GridPhaseStatus(
            name="canaries",
            completed=max(completed - 3, 0),
            committed=max(durable - 3, 0),
            total=1,
        ),
    )
    eta = family.eta_seconds
    return GridStatusSnapshot(
        run_name="grid-v2",
        run_path="runs/grid-v2",
        sampled_at=_NOW,
        activity=activity,
        phase="baseline" if completed < 1 else "refinement",
        target_kind="exact",
        trigger_rate=0.4,
        pool_cards=2,
        refined_cards=1,
        completed=completed,
        committed=durable,
        total=4,
        imported_votes=2,
        phases=phases,
        families=(family,),
        known_spend_usd=1.25,
        cost_complete=True,
        physical_attempts=completed,
        repair_attempts=0,
        failed_attempts=0,
        awaiting_commit=completed - durable,
        open_votes=0,
        in_flight=1,
        elapsed_seconds=60.0,
        eta_seconds=eta,
        projected_finish_at=_NOW + timedelta(seconds=eta) if eta else None,
        last_activity_at=_NOW - timedelta(seconds=5),
    )


def test_static_status_render_contains_operator_signals() -> None:
    console = Console(record=True, width=160)
    console.print(build_grid_status_renderable(_snapshot(completed=2, committed=1)))
    output = console.export_text()

    assert "Relation grid status" in output
    assert "RUNNING" in output
    assert "judge/a" in output
    assert "slowest ETA" in output
    assert "2/4 votes complete" in output
    assert "1 durably committed" in output
    assert "completed awaiting ordered commit" in output
    assert "1 refined card × 1 family × 2 repeats = 2 refinement votes" in output  # noqa: RUF001
    assert "Durable" in output
    assert "Failed" in output
    assert "extra" not in output.casefold()
    assert "$1.25" in output


def test_textual_status_renders_while_initial_sample_is_pending() -> None:
    release = Event()

    def load() -> GridStatusSnapshot:
        if not release.wait(timeout=5):
            raise TimeoutError("fixture did not release the status loader")
        return _snapshot(completed=1)

    app = GridStatusApp(load, refresh_seconds=3_600)

    async def scenario() -> None:
        async with app.run_test(size=(120, 28)) as pilot:
            await pilot.pause()
            table = app.query_one("#family-table", DataTable)
            assert table.row_count == 0
            release.set()
            await app.workers.wait_for_complete()
            await pilot.pause()
            assert table.row_count == 1

    asyncio.run(scenario())


def test_textual_status_refreshes_pauses_and_resizes() -> None:
    samples = iter((_snapshot(completed=1), _snapshot(completed=2)))
    app = GridStatusApp(lambda: next(samples), refresh_seconds=3_600)

    async def scenario() -> None:
        async with app.run_test(size=(120, 28)) as pilot:
            await app.workers.wait_for_complete()
            await pilot.pause()
            table = app.query_one("#family-table", DataTable)
            assert str(table.get_cell("judge/a", "complete")) == "1/4"

            await pilot.press("space")
            assert app._paused
            await pilot.press("r")
            await app.workers.wait_for_complete()
            await pilot.pause()
            assert str(table.get_cell("judge/a", "complete")) == "2/4"
            assert str(table.get_cell("judge/a", "durable")) == "2"

            await pilot.resize_terminal(72, 18)
            assert app.size == Size(72, 18)
            assert table.size.height > 0

    asyncio.run(scenario())
