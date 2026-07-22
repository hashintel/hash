"""Review all-ambiguous classifier targets in a Textual card workflow."""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import ClassVar

from rich.text import Text
from textual.app import App, ComposeResult
from textual.binding import Binding, BindingType
from textual.containers import Vertical, VerticalScroll
from textual.widgets import Footer, Header, ProgressBar, Static

from atlas_tools.relation.evaluation.domain.api import HumanPlacementAction

type AmbiguousTargetAction = HumanPlacementAction


@dataclass(frozen=True, slots=True, kw_only=True)
class AmbiguousTargetReviewRow:
    """Carry one classifier target into the terminal-only review UI."""

    relation_id: str
    card_hash: str
    card_text: str
    unclear_votes: int
    abstentions: int

    def __post_init__(self) -> None:
        if not self.relation_id or not self.card_hash:
            raise ValueError("review row identity must not be empty")
        if min(self.unclear_votes, self.abstentions) < 0:
            raise ValueError("review row tallies must not be negative")


@dataclass(frozen=True, slots=True, kw_only=True)
class AmbiguousTargetDecision:
    """Record the operator's selected relation action for one card."""

    relation_id: str
    card_hash: str
    action: AmbiguousTargetAction


class AmbiguousTargetReviewApp(App[tuple[AmbiguousTargetDecision, ...]]):
    """Review ambiguous targets without reading or writing application artifacts."""

    TITLE = "Atlas relation review"
    SUB_TITLE = "All-ambiguous classifier targets"
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

    #progress-line, #relation-line, #tally-line {
        height: 1;
        width: 100%;
    }

    #progress-line, #relation-line {
        text-style: bold;
    }

    #tally-line, #action-line {
        color: $text-muted;
    }

    #review-progress {
        height: 1;
        width: 100%;
        margin-bottom: 1;
    }

    #card-scroll {
        height: 1fr;
        min-height: 4;
        width: 100%;
        padding: 1 2;
        background: $surface;
    }

    #card-text {
        height: auto;
        width: 100%;
    }

    #action-line {
        height: auto;
        min-height: 1;
        width: 100%;
        margin-top: 1;
    }
    """
    BINDINGS: ClassVar[list[BindingType]] = [
        Binding("c", "choose_coincident", "Coincident"),
        Binding("p", "choose_proximal", "Proximal"),
        Binding("o", "choose_overlay", "Overlay"),
        Binding("x", "choose_excluded", "Excluded"),
        Binding("u", "undo", "Undo/back"),
        Binding("q", "cancel", "Cancel"),
    ]

    def __init__(self, rows: Iterable[AmbiguousTargetReviewRow]) -> None:
        super().__init__()
        self._rows = tuple(rows)
        if not self._rows:
            raise ValueError("ambiguous target review requires at least one row")
        self._index = 0
        self._decisions: list[AmbiguousTargetDecision] = []

    def compose(self) -> ComposeResult:
        yield Header()
        with Vertical(id="body"):
            yield Static("", id="progress-line", markup=False)
            yield ProgressBar(
                total=len(self._rows),
                show_eta=False,
                id="review-progress",
            )
            yield Static("", id="relation-line", markup=False)
            yield Static("", id="tally-line", markup=False)
            with VerticalScroll(id="card-scroll"):
                yield Static("", id="card-text", markup=False)
            yield Static(
                "c Coincident - one referent; render one dot\n"
                "p Proximal - distinct entities whose typical instances should be near\n"
                "o Overlay - a genuine relation that should not move either endpoint\n"
                "x Excluded - no safe three-class placement target\n"
                "u undo/back   q cancel",
                id="action-line",
                markup=False,
            )
        yield Footer(show_command_palette=False, compact=True)

    def on_mount(self) -> None:
        self._render_current_row()

    def _render_current_row(self) -> None:
        row = self._rows[self._index]
        reviewed = len(self._decisions)

        progress = Text()
        progress.append(f"Target {self._index + 1:,} of {len(self._rows):,}", style="bold")
        progress.append(f"  •  {reviewed:,} reviewed", style="dim")
        self.query_one("#progress-line", Static).update(progress, layout=False)
        self.query_one("#review-progress", ProgressBar).update(progress=reviewed)

        identity = Text("Relation ID  ", style="dim")
        identity.append(row.relation_id, style="bold")
        identity.append("  •  Card hash  ", style="dim")
        identity.append(row.card_hash)
        self.query_one("#relation-line", Static).update(identity, layout=False)

        tally = Text("All-ambiguous tally  ", style="bold")
        tally.append(f"{row.unclear_votes:,} unclear votes")
        tally.append(f"  •  {row.abstentions:,} abstentions")
        self.query_one("#tally-line", Static).update(tally, layout=False)
        self.query_one("#card-text", Static).update(row.card_text)
        self.query_one("#card-scroll", VerticalScroll).scroll_home(
            animate=False,
            force=True,
            immediate=True,
        )

    def _choose(self, action: AmbiguousTargetAction) -> None:
        row = self._rows[self._index]
        self._decisions.append(
            AmbiguousTargetDecision(
                relation_id=row.relation_id,
                card_hash=row.card_hash,
                action=action,
            )
        )
        if len(self._decisions) == len(self._rows):
            self.exit(tuple(self._decisions))
            return
        self._index += 1
        self._render_current_row()

    def action_choose_coincident(self) -> None:
        self._choose("coincident")

    def action_choose_proximal(self) -> None:
        self._choose("proximal")

    def action_choose_overlay(self) -> None:
        self._choose("overlay")

    def action_choose_excluded(self) -> None:
        self._choose("excluded")

    def action_undo(self) -> None:
        if not self._decisions:
            return
        self._decisions.pop()
        self._index -= 1
        self._render_current_row()

    def action_cancel(self) -> None:
        self.exit(None)


def run_ambiguous_target_review(
    rows: Iterable[AmbiguousTargetReviewRow],
) -> tuple[AmbiguousTargetDecision, ...] | None:
    """Run an interactive review, returning ordered decisions or ``None`` on cancel."""
    review_rows = tuple(rows)
    if not review_rows:
        return ()
    return AmbiguousTargetReviewApp(review_rows).run()
