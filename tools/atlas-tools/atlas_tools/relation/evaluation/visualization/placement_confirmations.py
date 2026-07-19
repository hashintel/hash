"""Confirm unambiguous placement classes in a voluntary Textual card workflow."""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import ClassVar

from rich.text import Text
from textual.app import App, ComposeResult
from textual.binding import Binding, BindingType
from textual.containers import Vertical, VerticalScroll
from textual.widgets import Footer, Header, ProgressBar, Static

from atlas_tools.relation.evaluation.domain.api import HumanPlacementAction

type PlacementConfirmationChoice = HumanPlacementAction


@dataclass(frozen=True, slots=True, kw_only=True)
class PlacementConfirmationReviewRow:
    """Carry one positive-evidence card into the terminal-only confirmation UI."""

    relation_id: str
    card_hash: str
    card_text: str
    coincident_votes: int
    proximal_votes: int
    overlay_votes: int

    def __post_init__(self) -> None:
        if not self.relation_id or not self.card_hash:
            raise ValueError("confirmation row identity must not be empty")
        if min(self.coincident_votes, self.proximal_votes, self.overlay_votes) < 0:
            raise ValueError("confirmation row tallies must not be negative")
        if self.coincident_votes + self.proximal_votes + self.overlay_votes == 0:
            raise ValueError("confirmation rows require placement-vote evidence")


@dataclass(frozen=True, slots=True, kw_only=True)
class PlacementConfirmationDecision:
    """Record the operator's confirmed relation action for one card."""

    relation_id: str
    card_hash: str
    action: PlacementConfirmationChoice


class PlacementConfirmationApp(App[tuple[PlacementConfirmationDecision, ...] | None]):
    """Confirm placements without reading or writing application artifacts.

    Every card may be confirmed, excluded, or skipped; ``d`` finishes early and
    keeps the decisions made so far. Confirmation is voluntary, so partial
    coverage is a valid, publishable outcome; only ``q`` discards everything.
    """

    TITLE = "Atlas relation review"
    SUB_TITLE = "Voluntary placement confirmation"
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
        Binding("s", "skip", "Skip"),
        Binding("u", "undo", "Undo/back"),
        Binding("d", "done", "Done"),
        Binding("q", "cancel", "Cancel"),
    ]

    def __init__(self, rows: Iterable[PlacementConfirmationReviewRow]) -> None:
        super().__init__()
        self._rows = tuple(rows)
        if not self._rows:
            raise ValueError("placement confirmation requires at least one row")
        self._index = 0
        self._decisions: list[PlacementConfirmationDecision | None] = []

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
                "s skip   u undo/back   d done (keep decisions)   q cancel (discard)",
                id="action-line",
                markup=False,
            )
        yield Footer(show_command_palette=False, compact=True)

    def on_mount(self) -> None:
        self._render_current_row()

    def _confirmed(self) -> tuple[PlacementConfirmationDecision, ...]:
        return tuple(decision for decision in self._decisions if decision is not None)

    def _render_current_row(self) -> None:
        row = self._rows[self._index]
        confirmed = len(self._confirmed())

        progress = Text()
        progress.append(f"Card {self._index + 1:,} of {len(self._rows):,}", style="bold")
        progress.append(f"  •  {confirmed:,} confirmed", style="dim")
        self.query_one("#progress-line", Static).update(progress, layout=False)
        self.query_one("#review-progress", ProgressBar).update(progress=len(self._decisions))

        identity = Text("Relation ID  ", style="dim")
        identity.append(row.relation_id, style="bold")
        identity.append("  •  Card hash  ", style="dim")
        identity.append(row.card_hash)
        self.query_one("#relation-line", Static).update(identity, layout=False)

        tally = Text("Synthetic placement tally  ", style="bold")
        tally.append(f"C {row.coincident_votes:,}")
        tally.append(f"  •  P {row.proximal_votes:,}")
        tally.append(f"  •  O {row.overlay_votes:,}")
        self.query_one("#tally-line", Static).update(tally, layout=False)
        self.query_one("#card-text", Static).update(row.card_text)
        self.query_one("#card-scroll", VerticalScroll).scroll_home(
            animate=False,
            force=True,
            immediate=True,
        )

    def _advance(self, decision: PlacementConfirmationDecision | None) -> None:
        self._decisions.append(decision)
        if len(self._decisions) == len(self._rows):
            self.exit(self._confirmed())
            return
        self._index += 1
        self._render_current_row()

    def _choose(self, action: PlacementConfirmationChoice) -> None:
        row = self._rows[self._index]
        self._advance(
            PlacementConfirmationDecision(
                relation_id=row.relation_id,
                card_hash=row.card_hash,
                action=action,
            )
        )

    def action_choose_coincident(self) -> None:
        self._choose("coincident")

    def action_choose_proximal(self) -> None:
        self._choose("proximal")

    def action_choose_overlay(self) -> None:
        self._choose("overlay")

    def action_choose_excluded(self) -> None:
        self._choose("excluded")

    def action_skip(self) -> None:
        self._advance(None)

    def action_undo(self) -> None:
        if not self._decisions:
            return
        self._decisions.pop()
        self._index -= 1
        self._render_current_row()

    def action_done(self) -> None:
        self.exit(self._confirmed())

    def action_cancel(self) -> None:
        self.exit(None)


def run_placement_confirmation(
    rows: Iterable[PlacementConfirmationReviewRow],
) -> tuple[PlacementConfirmationDecision, ...] | None:
    """Run an interactive confirmation, returning decisions or ``None`` on cancel."""
    review_rows = tuple(rows)
    if not review_rows:
        return ()
    return PlacementConfirmationApp(review_rows).run()
