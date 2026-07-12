"""Progress reporting: phases/advances during extraction, stderr throttling."""

from __future__ import annotations

from dataclasses import dataclass, field

from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.progress import StderrProgress
from atlas_tools.wikidata.properties import extract_properties
from atlas_tools.wikidata.taxonomy import Taxonomy
from atlas_tools.wikidata.transport import FixtureTransport
from tests.wikidata.conftest import CONFIG_PATH, RESPONSES, TAXONOMY_PATH


@dataclass
class RecordingProgress:
    phases: list[tuple[str, int | None]] = field(default_factory=list)
    advances: dict[str, int] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)

    def phase(self, name: str, *, total: int | None = None) -> None:
        self.phases.append((name, total))

    def advance(self, count: int = 1) -> None:
        name = self.phases[-1][0]
        self.advances[name] = self.advances.get(name, 0) + count

    def note(self, message: str) -> None:
        self.notes.append(message)


def test_extraction_reports_every_phase_with_correct_totals(tmp_path):
    config = Config.load(CONFIG_PATH)
    progress = RecordingProgress()
    result = extract_properties(
        config,
        FixtureTransport(RESPONSES),
        taxonomy=Taxonomy.load(TAXONOMY_PATH),
        checkpoint_path=tmp_path / "checkpoint.json",
        progress=progress,
    )

    phase_names = [name for name, _ in progress.phases]
    assert phase_names == [
        "property inventory (SPARQL)",
        "property documents (wbgetentities)",
        "entity labels (wbgetentities)",
        "example ladder (per property)",
    ]

    # Declared totals match what actually happened.
    totals = dict(progress.phases)
    assert totals["example ladder (per property)"] == len(result.records)
    assert progress.advances["example ladder (per property)"] == len(result.records)
    for name in (
        "property documents (wbgetentities)",
        "entity labels (wbgetentities)",
    ):
        assert progress.advances[name] == totals[name]

    # The exhausted-ladder property is called out by PID.
    assert any("P9002" in note and "skipped" in note for note in progress.notes)
    # The reversed-statement guard announces the untyped candidates it
    # dropped (P361: Engine/Wheel, P50: Anonymous Manuscript).
    assert any("reversed-statement guard" in note for note in progress.notes)


def test_extraction_notes_checkpoint_resume(tmp_path):
    config = Config.load(CONFIG_PATH)
    taxonomy = Taxonomy.load(TAXONOMY_PATH)
    checkpoint_path = tmp_path / "checkpoint.json"
    extract_properties(
        config,
        FixtureTransport(RESPONSES),
        taxonomy=taxonomy,
        checkpoint_path=checkpoint_path,
    )

    progress = RecordingProgress()
    extract_properties(
        config,
        FixtureTransport(RESPONSES),
        taxonomy=taxonomy,
        checkpoint_path=checkpoint_path,
        progress=progress,
    )
    assert any("replayed from checkpoint" in note for note in progress.notes)


def test_stderr_progress_throttles_and_always_prints_completion():
    lines: list[str] = []
    clock_value = 0.0
    progress = StderrProgress(
        write=lines.append,
        clock=lambda: clock_value,
        min_interval_seconds=1.0,
    )

    progress.phase("work", total=100)
    for _ in range(99):
        progress.advance()  # clock frozen: only the first line survives
    assert lines == ["[00:00] work (100 items)", "[00:00]   work: 1/100"]

    clock_value = 61.0
    progress.advance()  # completion always prints, with mm:ss elapsed
    assert lines[-1] == "[01:01]   work: 100/100"


def test_stderr_progress_reports_interval_ticks():
    lines: list[str] = []
    clock_value = 0.0

    def clock() -> float:
        return clock_value

    progress = StderrProgress(write=lines.append, clock=clock)
    progress.phase("stream")  # no total
    progress.advance()
    clock_value = 2.0
    progress.advance()
    assert lines == [
        "[00:00] stream",
        "[00:00]   stream: 1",
        "[00:02]   stream: 2",
    ]
    progress.note("resuming at byte 42")
    assert lines[-1] == "[00:02]   resuming at byte 42"
