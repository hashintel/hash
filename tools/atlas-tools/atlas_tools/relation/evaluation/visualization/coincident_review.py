"""Review every Coincident queue row with complete card and vote evidence."""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import ClassVar

from rich.text import Text
from textual.app import App, ComposeResult
from textual.binding import Binding, BindingType
from textual.containers import Vertical, VerticalScroll
from textual.widgets import Footer, Header, ProgressBar, Static

from atlas_tools.relation.evaluation.domain.api import (
    CardHash,
    CoincidentReviewAction,
    JudgeFamilyId,
    RelationId,
    VoteVerdict,
)


@dataclass(frozen=True, slots=True, kw_only=True)
class CoincidentVoteReviewEvidence:
    """Carry the human-readable adjudication evidence for one judge vote."""

    family_id: JudgeFamilyId
    verdict: VoteVerdict
    repeat_index: int
    reason: str

    def __post_init__(self) -> None:
        if not self.family_id:
            raise ValueError("vote family ID must not be empty")
        if self.repeat_index < 0:
            raise ValueError("vote repeat index must not be negative")


@dataclass(frozen=True, slots=True, kw_only=True)
class CoincidentReviewViewRow:
    """Carry one Coincident queue entry into the terminal-only review UI."""

    relation_id: RelationId
    card_hash: CardHash
    card_text: str
    coincident_families: tuple[JudgeFamilyId, ...]
    coincident_votes: int
    proximal_votes: int
    overlay_votes: int
    unclear_votes: int
    abstentions: int
    votes: tuple[CoincidentVoteReviewEvidence, ...]

    def __post_init__(self) -> None:
        if not self.relation_id or not self.card_hash:
            raise ValueError("review row identity must not be empty")
        if not self.coincident_families or not self.votes:
            raise ValueError("Coincident review rows require complete vote evidence")
        tallies = (
            self.coincident_votes,
            self.proximal_votes,
            self.overlay_votes,
            self.unclear_votes,
            self.abstentions,
        )
        if min(tallies) < 0:
            raise ValueError("review row tallies must not be negative")
        if sum(tallies) != len(self.votes):
            raise ValueError("review row tallies must count every attached vote")
        if self.coincident_votes == 0:
            raise ValueError("Coincident review rows require a Coincident vote")


@dataclass(frozen=True, slots=True, kw_only=True)
class CoincidentReviewDecision:
    """Record the operator's Coincident-evidence decision for one queued card."""

    relation_id: RelationId
    card_hash: CardHash
    action: CoincidentReviewAction


class CoincidentReviewApp(App[tuple[CoincidentReviewDecision, ...]]):
    """Review Coincident evidence without reading or writing application artifacts."""

    TITLE = "Atlas relation review"
    SUB_TITLE = "Obligatory Coincident queue"
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

    #progress-line, #relation-line, #tally-line, #families-line, .section-label {
        height: auto;
        min-height: 1;
        width: 100%;
    }

    #progress-line, #relation-line, .section-label {
        text-style: bold;
    }

    #tally-line, #families-line, #action-line {
        color: $text-muted;
    }

    #review-progress {
        height: 1;
        width: 100%;
        margin-bottom: 1;
    }

    #card-scroll, #vote-scroll {
        width: 100%;
        padding: 0 2;
        background: $surface;
    }

    #card-scroll {
        height: 2fr;
        min-height: 3;
    }

    #vote-scroll {
        height: 3fr;
        min-height: 4;
    }

    #card-text, #vote-text {
        height: auto;
        width: 100%;
    }

    .section-label {
        margin-top: 1;
    }

    #action-line {
        height: auto;
        min-height: 1;
        width: 100%;
        margin-top: 1;
    }
    """
    BINDINGS: ClassVar[list[BindingType]] = [
        Binding("c", "choose_confirmed", "Confirm C"),
        Binding("r", "choose_rejected", "Reject C"),
        Binding("x", "choose_excluded", "Excluded"),
        Binding("u", "undo", "Undo/back"),
        Binding("q", "cancel", "Cancel"),
    ]

    def __init__(self, rows: Iterable[CoincidentReviewViewRow]) -> None:
        super().__init__()
        self._rows = tuple(rows)
        if not self._rows:
            raise ValueError("Coincident review requires at least one row")
        self._index = 0
        self._decisions: list[CoincidentReviewDecision] = []

    def compose(self) -> ComposeResult:
        yield Header()
        with Vertical(id="body"):
            yield Static("", id="progress-line", markup=False)
            yield ProgressBar(total=len(self._rows), show_eta=False, id="review-progress")
            yield Static("", id="relation-line", markup=False)
            yield Static("", id="tally-line", markup=False)
            yield Static("", id="families-line", markup=False)
            yield Static("Exact card text", classes="section-label", markup=False)
            with VerticalScroll(id="card-scroll"):
                yield Static("", id="card-text", markup=False)
            yield Static("Complete judge vote evidence", classes="section-label", markup=False)
            with VerticalScroll(id="vote-scroll"):
                yield Static("", id="vote-text", markup=False)
            yield Static(
                "c Confirm C - retain the complete original C/P/O soft label\n"
                "r Reject C - remove Coincident votes; retain P/O evidence\n"
                "x Excluded - keep prediction coverage with zero supervised weight\n"
                "u undo/back   q cancel",
                id="action-line",
                markup=False,
            )
        yield Footer(show_command_palette=False, compact=True)

    def on_mount(self) -> None:
        self._render_current_row()

    @staticmethod
    def _render_vote_evidence(row: CoincidentReviewViewRow) -> Text:
        rendered = Text()
        for index, vote in enumerate(row.votes, start=1):
            if index > 1:
                rendered.append("\n\n")
            rendered.append(f"Vote {index:,} of {len(row.votes):,}", style="bold")
            rendered.append("  •  Family  ", style="dim")
            rendered.append(vote.family_id)
            rendered.append("  •  Verdict  ", style="dim")
            rendered.append(vote.verdict, style="bold")
            rendered.append("  •  Repeat  ", style="dim")
            rendered.append(str(vote.repeat_index))
            rendered.append("\n")
            rendered.append(vote.reason or "(No judge reason recorded.)")
        return rendered

    def _render_current_row(self) -> None:
        row = self._rows[self._index]
        reviewed = len(self._decisions)

        progress = Text()
        progress.append(f"Queue row {self._index + 1:,} of {len(self._rows):,}", style="bold")
        progress.append(f"  •  {reviewed:,} reviewed", style="dim")
        self.query_one("#progress-line", Static).update(progress, layout=False)
        self.query_one("#review-progress", ProgressBar).update(progress=reviewed)

        identity = Text("Relation ID  ", style="dim")
        identity.append(row.relation_id, style="bold")
        identity.append("  •  Card hash  ", style="dim")
        identity.append(row.card_hash)
        self.query_one("#relation-line", Static).update(identity, layout=False)

        tally = Text("Complete tally  ", style="bold")
        tally.append(f"C {row.coincident_votes:,}  •  P {row.proximal_votes:,}")
        tally.append(f"  •  O {row.overlay_votes:,}  •  U {row.unclear_votes:,}")
        tally.append(f"  •  ABSTAIN {row.abstentions:,}")
        self.query_one("#tally-line", Static).update(tally, layout=False)

        families = Text("Coincident families  ", style="bold")
        families.append(", ".join(row.coincident_families))
        self.query_one("#families-line", Static).update(families, layout=False)
        self.query_one("#card-text", Static).update(row.card_text)
        self.query_one("#vote-text", Static).update(self._render_vote_evidence(row))
        for selector in ("#card-scroll", "#vote-scroll"):
            self.query_one(selector, VerticalScroll).scroll_home(
                animate=False,
                force=True,
                immediate=True,
            )

    def _choose(self, action: CoincidentReviewAction) -> None:
        row = self._rows[self._index]
        self._decisions.append(
            CoincidentReviewDecision(
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

    def action_choose_confirmed(self) -> None:
        self._choose("confirmed")

    def action_choose_rejected(self) -> None:
        row = self._rows[self._index]
        if row.proximal_votes + row.overlay_votes == 0:
            self.notify(
                "Rejecting C would leave no placement evidence; "
                "full placement adjudication is required.",
                severity="error",
            )
            return
        self._choose("rejected")

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


def run_coincident_review(
    rows: Iterable[CoincidentReviewViewRow],
) -> tuple[CoincidentReviewDecision, ...] | None:
    """Run an interactive review, returning ordered decisions or ``None`` on cancel."""
    review_rows = tuple(rows)
    if not review_rows:
        return ()
    return CoincidentReviewApp(review_rows).run()
