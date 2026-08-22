"""Render grid status as a responsive Textual operator dashboard."""

import sys
from collections.abc import Callable
from datetime import datetime
from typing import ClassVar

from rich.console import Console, Group
from rich.table import Table
from rich.text import Text
from textual import work
from textual.app import App, ComposeResult
from textual.binding import Binding, BindingType
from textual.containers import Vertical
from textual.timer import Timer
from textual.widgets import DataTable, Footer, Header, ProgressBar, Static
from textual.worker import Worker, WorkerState

from atlas_tools.relation.evaluation.visualization.model import (
    GridFamilyStatus,
    GridPhaseStatus,
    GridStatusSnapshot,
)

type SnapshotLoader = Callable[[], GridStatusSnapshot]

_ACTIVITY_STYLES = {
    "ready": "blue",
    "running": "green",
    "paused": "yellow",
    "blocked": "red",
    "complete": "green",
}
_PHASE_LABELS = {
    "baseline": "Baseline",
    "refinement": "Refinement",
    "canaries": "Canaries",
    "finalizing": "Finalizing",
    "complete": "Complete",
}
_COLUMN_KEYS = (
    "family",
    "complete",
    "durable",
    "progress",
    "rate",
    "eta",
    "spend",
    "failed",
    "open",
    "last",
)


def _duration(seconds: float | None) -> str:
    if seconds is None:
        return "--"
    rounded = max(0, int(seconds))
    days, remainder = divmod(rounded, 86_400)
    hours, remainder = divmod(remainder, 3_600)
    minutes, seconds = divmod(remainder, 60)
    if days:
        return f"{days}d {hours:02d}h"
    if hours:
        return f"{hours}h {minutes:02d}m"
    if minutes:
        return f"{minutes}m {seconds:02d}s"
    return f"{seconds}s"


def _age(sampled_at: datetime, activity_at: datetime | None) -> str:
    if activity_at is None:
        return "--"
    return _duration(max((sampled_at - activity_at).total_seconds(), 0.0))


def _bar(completed: int, total: int, *, width: int = 10, projected: bool = False) -> Text:
    progress = completed / total if total else 1.0
    filled = min(width, max(0, round(progress * width)))
    style = "yellow" if projected else ("green" if completed >= total else "cyan")
    bar = Text()
    bar.append("█" * filled, style=style)
    bar.append("░" * (width - filled), style="dim")
    return bar


def _run_line(snapshot: GridStatusSnapshot, *, refresh_paused: bool = False) -> Text:
    line = Text()
    line.append(snapshot.activity.upper(), style=f"bold {_ACTIVITY_STYLES[snapshot.activity]}")
    line.append(f"  {_PHASE_LABELS[snapshot.phase]}", style="bold")
    line.append(f"  •  {snapshot.run_path}", style="dim")
    line.append(f"  •  sampled {snapshot.sampled_at.astimezone():%H:%M:%S}", style="dim")
    if refresh_paused:
        line.append("  •  refresh paused", style="bold yellow")
    return line


def _summary_line(snapshot: GridStatusSnapshot) -> Text:
    finish = (
        snapshot.projected_finish_at.astimezone().strftime("%H:%M")
        if snapshot.projected_finish_at is not None
        else "--"
    )
    cost_suffix = "" if snapshot.cost_complete else "+ unknown"
    line = Text()
    line.append(
        f"{snapshot.completed:,}/{snapshot.total:,} votes complete",
        style="bold",
    )
    line.append(f" ({snapshot.committed:,} durably committed)", style="dim")
    line.append(f"  {snapshot.progress:6.1%}")
    line.append(f"  •  slowest ETA {_duration(snapshot.eta_seconds)}")
    line.append(f"  •  finish ~{finish}")
    line.append(f"  •  spend ${snapshot.known_spend_usd:,.2f}{cost_suffix}")
    line.append(f"  •  elapsed {_duration(snapshot.elapsed_seconds)}")
    return line


def _phase_line(snapshot: GridStatusSnapshot) -> Text:
    line = Text()
    for index, phase in enumerate(snapshot.phases):
        if index:
            line.append("    ")
        label = _PHASE_LABELS[phase.name]
        suffix = " projected" if phase.projected else ""
        style = "yellow" if phase.projected else ("green" if phase.completed >= phase.total else "")
        line.append(
            f"{label} {phase.completed:,}/{phase.total:,} votes{suffix}",
            style=style,
        )
        if phase.committed != phase.completed:
            line.append(f" • {phase.committed:,} durable", style="dim")
    return line


def _activity_line(snapshot: GridStatusSnapshot) -> Text:
    line = Text(style="dim")
    line.append(f"{snapshot.physical_attempts:,} physical requests")
    line.append(f"  •  {snapshot.repair_attempts:,} repair requests")
    line.append(f"  •  {snapshot.failed_attempts:,} failed/rejected")
    line.append(f"  •  {snapshot.open_votes:,} open votes")
    line.append(f"  •  {snapshot.in_flight:,} in flight")
    line.append("\n")
    line.append(f"{snapshot.awaiting_commit:,} completed awaiting ordered commit")
    line.append(f"  •  last activity {_age(snapshot.sampled_at, snapshot.last_activity_at)} ago")
    line.append("\n")

    refinement = next(phase for phase in snapshot.phases if phase.name == "refinement")
    family_count = len(snapshot.families)
    denominator = snapshot.refined_cards * family_count
    repeat_count = (
        refinement.total // denominator
        if denominator and refinement.total % denominator == 0
        else None
    )
    if repeat_count is not None:
        card_label = "card" if snapshot.refined_cards == 1 else "cards"
        family_label = "family" if family_count == 1 else "families"
        repeat_label = "repeat" if repeat_count == 1 else "repeats"
        target_kind = "projected refined" if snapshot.target_kind == "projected" else "refined"
        line.append(
            f"{snapshot.refined_cards:,} {target_kind} {card_label} × "  # noqa: RUF001
            f"{family_count:,} {family_label} × {repeat_count:,} {repeat_label} = "  # noqa: RUF001
            f"{refinement.total:,} refinement votes"
        )
    else:
        line.append(f"{refinement.total:,} refinement votes")
    if snapshot.target_kind == "projected":
        line.append(
            f"  •  target uses {snapshot.trigger_rate:.0%} card estimate",
            style="yellow",
        )
    else:
        line.append(f"  •  {snapshot.realized_trigger_rate:.1%} of pool refined")
    return line


def _family_cells(family: GridFamilyStatus, sampled_at: datetime) -> tuple[Text, ...]:
    progress = _bar(family.completed, family.total)
    progress.append(f" {family.progress:5.1%}")
    spend = Text(f"${family.known_spend_usd:,.2f}")
    if not family.cost_complete:
        spend.append("+", style="yellow")
    failures = Text(str(family.failed_attempts))
    if family.failed_attempts:
        failures.stylize("red")
    open_votes = Text(str(family.open_votes))
    if family.open_votes:
        open_votes.stylize("yellow")
    return (
        Text(family.family_id),
        Text(f"{family.completed:,}/{family.total:,}"),
        Text(f"{family.committed:,}"),
        progress,
        Text(f"{family.rate_per_minute:,.1f}/m" if family.rate_per_minute else "--"),
        Text(_duration(family.eta_seconds)),
        spend,
        failures,
        open_votes,
        Text(_age(sampled_at, family.last_activity_at)),
    )


def _phase_table(phases: tuple[GridPhaseStatus, ...]) -> Table:
    table = Table.grid(expand=True)
    table.add_column(ratio=1)
    table.add_column(ratio=1)
    table.add_column(ratio=1)
    cells: list[Text] = []
    for phase in phases:
        cell = Text(f"{_PHASE_LABELS[phase.name]}  {phase.completed:,}/{phase.total:,}  ")
        cell.append_text(_bar(phase.completed, phase.total, width=8, projected=phase.projected))
        if phase.committed != phase.completed:
            cell.append(f"  {phase.committed:,} durable", style="dim")
        if phase.projected:
            cell.append("  projected", style="yellow")
        cells.append(cell)
    table.add_row(*cells)
    return table


def build_grid_status_renderable(snapshot: GridStatusSnapshot) -> Group:
    """Build the static projection used by ``--once`` and non-TTY output."""
    title = Text(f"Relation grid status  •  {snapshot.run_name}", style="bold")
    families = Table(expand=True, box=None, pad_edge=False)
    families.add_column("Family", ratio=3, no_wrap=True)
    families.add_column("Complete", justify="right", no_wrap=True)
    families.add_column("Durable", justify="right", no_wrap=True)
    families.add_column("Progress", no_wrap=True)
    families.add_column("Rate", justify="right", no_wrap=True)
    families.add_column("ETA", justify="right", no_wrap=True)
    families.add_column("Spend", justify="right", no_wrap=True)
    families.add_column("Failed", justify="right", no_wrap=True)
    families.add_column("Open", justify="right", no_wrap=True)
    families.add_column("Last", justify="right", no_wrap=True)
    for family in snapshot.families:
        families.add_row(*_family_cells(family, snapshot.sampled_at))
    return Group(
        title,
        _run_line(snapshot),
        _summary_line(snapshot),
        _phase_table(snapshot.phases),
        Text(),
        families,
        Text(),
        _activity_line(snapshot),
    )


class GridStatusApp(App[None]):
    """Continuously visualize one grid run without mutating its artifacts."""

    TITLE = "Atlas relation grid"
    SUB_TITLE = "Loading status"
    CSS = """
    Screen {
        overflow: hidden;
    }

    Header, Footer {
        background: $panel;
    }

    #body {
        height: 1fr;
        padding: 0 1;
    }

    #run-line, #summary-line, #phase-line {
        height: 1;
        width: 100%;
    }

    #activity-line {
        height: 3;
        width: 100%;
    }

    #run-line, #phase-line, #activity-line {
        color: $text-muted;
    }

    #summary-line {
        text-style: bold;
    }

    #overall-progress {
        height: 1;
        width: 100%;
        margin-bottom: 1;
    }

    #family-table {
        height: 1fr;
        width: 100%;
        min-height: 4;
    }

    #error-line {
        display: none;
        height: auto;
        max-height: 3;
        padding: 0 1;
        color: $error;
        background: $surface;
        text-style: bold;
    }

    #error-line.visible {
        display: block;
    }
    """
    BINDINGS: ClassVar[list[BindingType]] = [
        Binding("q", "quit", "Quit"),
        Binding("r", "refresh_now", "Refresh"),
        Binding("space", "toggle_pause", "Pause"),
    ]

    def __init__(self, loader: SnapshotLoader, *, refresh_seconds: float = 2.0) -> None:
        super().__init__()
        self._loader = loader
        self._refresh_seconds = refresh_seconds
        self._refresh_worker: Worker[GridStatusSnapshot] | None = None
        self._refresh_timer: Timer | None = None
        self._snapshot: GridStatusSnapshot | None = None
        self._row_keys: set[str] = set()
        self._paused = False

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with Vertical(id="body"):
            yield Static("Waiting for the first durable sample...", id="run-line", markup=False)
            yield Static("", id="summary-line", markup=False)
            yield ProgressBar(total=None, show_eta=False, id="overall-progress")
            yield Static("", id="phase-line", markup=False)
            yield DataTable(
                id="family-table",
                cursor_type="row",
                zebra_stripes=True,
                show_row_labels=False,
            )
            yield Static("", id="error-line", markup=False)
            yield Static("", id="activity-line", markup=False)
        yield Footer(show_command_palette=False, compact=True)

    def on_mount(self) -> None:
        table = self.query_one("#family-table", DataTable)
        for label, width, key in (
            ("Family", 29, "family"),
            ("Complete", 12, "complete"),
            ("Durable", 9, "durable"),
            ("Progress", 18, "progress"),
            ("Rate", 9, "rate"),
            ("ETA", 10, "eta"),
            ("Spend", 10, "spend"),
            ("Failed", 8, "failed"),
            ("Open", 7, "open"),
            ("Last", 9, "last"),
        ):
            table.add_column(label, width=width, key=key)
        self._request_refresh()
        self._refresh_timer = self.set_interval(self._refresh_seconds, self._request_refresh)

    def _request_refresh(self) -> None:
        if self._refresh_worker is None or self._refresh_worker.is_finished:
            self._refresh_worker = self._read_snapshot()

    @work(thread=True, name="grid-status-refresh", group="grid-status", exit_on_error=False)
    def _read_snapshot(self) -> GridStatusSnapshot:
        return self._loader()

    def on_worker_state_changed(self, event: Worker.StateChanged) -> None:
        if event.worker is not self._refresh_worker:
            return
        if event.state is WorkerState.SUCCESS:
            snapshot = event.worker.result
            if isinstance(snapshot, GridStatusSnapshot):
                self._snapshot = snapshot
                self._render_snapshot(snapshot)
                error = self.query_one("#error-line", Static)
                error.update("", layout=False)
                error.remove_class("visible")
        elif event.state is WorkerState.ERROR:
            error = event.worker.error
            line = self.query_one("#error-line", Static)
            line.update(f"Refresh failed: {error or 'unknown error'}")
            line.add_class("visible")

    def _render_snapshot(self, snapshot: GridStatusSnapshot) -> None:
        self.sub_title = snapshot.run_name
        self.query_one("#run-line", Static).update(
            _run_line(snapshot, refresh_paused=self._paused),
            layout=False,
        )
        self.query_one("#summary-line", Static).update(_summary_line(snapshot), layout=False)
        self.query_one("#phase-line", Static).update(_phase_line(snapshot), layout=False)
        self.query_one("#activity-line", Static).update(_activity_line(snapshot), layout=False)
        self.query_one("#overall-progress", ProgressBar).update(
            total=snapshot.total,
            progress=snapshot.completed,
        )

        table = self.query_one("#family-table", DataTable)
        current_keys = {family.family_id for family in snapshot.families}
        for stale_key in self._row_keys - current_keys:
            table.remove_row(stale_key)
        for family in snapshot.families:
            cells = _family_cells(family, snapshot.sampled_at)
            if family.family_id not in self._row_keys:
                table.add_row(*cells, key=family.family_id)
                continue
            for column, cell in zip(_COLUMN_KEYS, cells, strict=True):
                table.update_cell(family.family_id, column, cell)
        self._row_keys = current_keys

    def action_refresh_now(self) -> None:
        self._request_refresh()

    def action_toggle_pause(self) -> None:
        timer = self._refresh_timer
        if timer is None:
            return
        self._paused = not self._paused
        if self._paused:
            timer.pause()
        else:
            timer.resume()
        if self._snapshot is not None:
            self.query_one("#run-line", Static).update(
                _run_line(self._snapshot, refresh_paused=self._paused),
                layout=False,
            )


def run_grid_status(
    loader: SnapshotLoader,
    *,
    refresh_seconds: float = 2.0,
    once: bool = False,
    console: Console | None = None,
) -> None:
    """Run the interactive dashboard or print one sample outside a TTY."""
    if once or not (sys.stdin.isatty() and sys.stdout.isatty()):
        output = console if console is not None else Console()
        output.print(build_grid_status_renderable(loader()))
        return
    GridStatusApp(loader, refresh_seconds=refresh_seconds).run()
