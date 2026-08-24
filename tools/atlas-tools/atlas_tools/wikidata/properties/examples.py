"""Property example fallback ladder, selection, and checkpointing.

Example fallback ladder
-----------------------
Endpoints are tried in ``extraction.example_endpoint_ladder`` order (QLever
first by default, then WDQS); when every rung fails the property records a
skip. The outcome is a :data:`LadderOutcome`: a ``LadderSuccess`` tagged
with its source endpoint, or a ``LadderSkip``. ``example_fallbacks``
records every property that the first rung did not serve. An endpoint
fails for a property when any of its offset requests returns a non-200
status (``RequestsTransport`` has already retried with backoff by then).
Failures are cached like successes, so a warm-cache rerun makes zero
network calls even for failing properties.

The QLever-first ladder order is evidence-based: the deep-offset subquery
form (see sparql.py) times out structurally on WDQS/Blazegraph while
QLever answers it in sub-second time, and each WDQS timeout costs the full
client timeout per offset before the ladder can fall through.

Example selection lives in ``examples.py`` (stratified by subject-type
constraint class, sitelink-weighted, endpoint-deduplicated). Under
stratification, untyped candidates are dropped; the motivation is
live-verified: the long tail contains reversed statements, for example
Q100151929, a person with an empty P31, appearing as the subject of P6.
Typed candidates matching no constraint class land in the diagnostic
``other`` bucket. Properties without constraints keep every candidate,
typed or not.
"""

from collections.abc import Mapping, Sequence
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path

from pydantic import BaseModel, Field, ValidationError

from atlas_tools.common.progress import NO_PROGRESS, ProgressReporter
from atlas_tools.common.provenance import canonical_json_bytes, sha256_bytes
from atlas_tools.wikidata.config import Config, ExtractionConfig
from atlas_tools.wikidata.examples import OTHER_WARNING_FRACTION, select_examples
from atlas_tools.wikidata.model import ExampleSource, PropertyRecord
from atlas_tools.wikidata.sparql import (
    EXAMPLE_QUERY_VERSION,
    ExampleRow,
    example_pairs_query,
    parse_example_results,
    sparql_params,
)
from atlas_tools.wikidata.taxonomy import Taxonomy
from atlas_tools.wikidata.transport import Transport


@dataclass(frozen=True)
class LadderSuccess:
    """One endpoint of the ladder produced example rows."""

    source: ExampleSource
    rows: tuple[ExampleRow, ...]


@dataclass(frozen=True)
class LadderSkip:
    """Every endpoint of the ladder failed; the property records a skip."""


type LadderOutcome = LadderSuccess | LadderSkip


def fetch_example_rows(
    pid: str,
    extraction: ExtractionConfig,
    transport: Transport,
    *,
    endpoints: tuple[ExampleSource, ...] | None = None,
    progress: ProgressReporter = NO_PROGRESS,
) -> LadderOutcome:
    """Run the example fallback ladder for one property.

    Every offset slice travels in one UNION query, so a rung costs one
    request. ``endpoints`` defaults to the configured
    ``extraction.example_endpoint_ladder``; checkpoint replay passes a
    narrowed tuple instead.
    """
    if endpoints is None:
        endpoints = extraction.example_endpoint_ladder
    query = example_pairs_query(
        pid,
        limit=extraction.example_pool_limit,
        offsets=extraction.example_offsets,
        language=extraction.primary_language,
    )
    for endpoint in endpoints:
        url = extraction.endpoints.sparql_url(endpoint)
        response = transport.get(url, sparql_params(query))
        if not response.ok:
            progress.note(f"{pid}: {endpoint} example query failed (status {response.status})")
            continue
        return LadderSuccess(source=endpoint, rows=tuple(parse_example_results(response.body)))
    return LadderSkip()


class ExtractionCheckpointState(BaseModel):
    """On-disk shape of the property-level progress checkpoint."""

    config_hash: str
    examples_done: dict[str, ExampleSource | None] = Field(default_factory=dict)


class ExtractionCheckpoint:
    """Property-level progress checkpoint (JSON, atomic writes).

    Records the example-ladder outcome per PID so a rerun replays recorded
    outcomes (fetching through the response cache) instead of re-probing
    endpoints. A checkpoint whose config_hash differs from the current
    config is discarded, as is an unreadable one. Combined with the response
    cache this makes rerun-after-kill idempotent.
    """

    def __init__(self, path: Path, config_hash: str) -> None:
        self.path = path
        self._state = ExtractionCheckpointState(config_hash=config_hash)
        if path.exists():
            try:
                loaded = ExtractionCheckpointState.model_validate_json(path.read_bytes())
            except ValidationError:
                loaded = None
            if loaded is not None and loaded.config_hash == config_hash:
                self._state = loaded

    @property
    def examples_done(self) -> Mapping[str, ExampleSource | None]:
        return self._state.examples_done

    def record_example(self, pid: str, source: ExampleSource | None) -> None:
        self._state.examples_done[pid] = source
        self._save()

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_name(self.path.name + ".tmp")
        tmp.write_text(
            self._state.model_dump_json(indent=2) + "\n",
            encoding="utf-8",
        )
        tmp.replace(self.path)


def extraction_config_hash(config: Config) -> str:
    """Hash the extraction sub-config plus the example-query version.

    This is the checkpoint guard hash, and it is card-format-independent.
    Including :data:`EXAMPLE_QUERY_VERSION` means a semantic query fix
    discards recorded ladder outcomes instead of replaying results of the
    old, possibly-broken query.

    Pacing knobs are excluded: politeness and worker count change how
    fast responses arrive, never what they contain, so tuning them must
    not discard recorded progress. Recorded outcomes stay valid
    observations under any pacing.
    """
    extraction = config.extraction.model_dump(mode="json")
    for pacing_knob in ("politeness", "example_workers"):
        extraction.pop(pacing_knob, None)
    return sha256_bytes(
        canonical_json_bytes(
            {
                "extraction": extraction,
                "example_query_version": EXAMPLE_QUERY_VERSION,
            }
        )
    )


@dataclass
class _LadderDiagnostics:
    """Per-run example-ladder outcomes, mirrored into :class:`ExtractionResult`."""

    fallbacks: dict[str, ExampleSource] = field(default_factory=dict)
    skips: list[str] = field(default_factory=list)
    filtered: dict[str, int] = field(default_factory=dict)
    other: dict[str, int] = field(default_factory=dict)
    other_fallbacks: list[str] = field(default_factory=list)


def _replay_endpoints(
    checkpoint: ExtractionCheckpoint | None, pid: str, extraction: ExtractionConfig
) -> tuple[ExampleSource, ...]:
    """Choose the endpoints to probe for one property.

    A checkpointed outcome narrows the ladder to the recorded endpoint (or
    to nothing for a recorded skip), so a rerun replays results through the
    response cache instead of re-probing.
    """
    if checkpoint is not None and pid in checkpoint.examples_done:
        replay_source = checkpoint.examples_done[pid]
        return (replay_source,) if replay_source is not None else ()
    return extraction.example_endpoint_ladder


def _apply_ladder_success(
    record: PropertyRecord,
    source: ExampleSource,
    rows: tuple[ExampleRow, ...],
    extraction: ExtractionConfig,
    taxonomy: Taxonomy | None,
    diagnostics: _LadderDiagnostics,
    progress: ProgressReporter,
) -> None:
    """Select examples from fetched rows and record the selection diagnostics."""
    record.example_source = source
    if source != extraction.example_endpoint_ladder[0]:
        diagnostics.fallbacks[record.pid] = source
    selection = select_examples(
        rows,
        constraint_classes=record.constraints.subject_types,
        taxonomy=taxonomy,
        count=extraction.example_count,
    )

    record.examples = selection.examples

    if selection.untyped_dropped:
        diagnostics.filtered[record.pid] = selection.untyped_dropped
        progress.note(
            f"{record.pid}: {selection.untyped_dropped} untyped"
            " candidates dropped (reversed-statement guard)"
        )

    if selection.other_candidates:
        diagnostics.other[record.pid] = selection.other_candidates

    if selection.other_used:
        diagnostics.other_fallbacks.append(record.pid)
        progress.note(
            f"{record.pid}: every subject-type constraint stratum"
            " is empty; examples fell back to the `other` pool"
        )
    elif selection.other_fraction > OTHER_WARNING_FRACTION:
        progress.note(
            f"{record.pid}: {selection.other_candidates} of"
            f" {selection.candidates} candidates match no"
            " subject-type constraint class; the constraint list"
            " may be stale"
        )

    if (dominant := selection.dominant_stratum) is not None:
        stratum, fraction = dominant
        progress.note(
            f"{record.pid}: stratum {stratum} holds {fraction:.0%} of the"
            " assigned candidates; the constraint ontology is coarser than"
            " the property's extension"
        )

    if (tangle := selection.tangled_strata) is not None:
        first, second, fraction = tangle
        progress.note(
            f"{record.pid}: strata {first} and {second} both subsume"
            f" {fraction:.0%} of the assigned candidates; the class graph is"
            " tangled there and the hop-distance tie-break is load-bearing"
        )


@dataclass
class _NoteCollector:
    """ProgressReporter that only buffers notes, for use inside workers.

    Workers must not write to the shared reporter directly: interleaved
    stderr lines are unreadable and note order would depend on scheduling.
    The coordinator replays buffered notes in record order instead.
    """

    notes: list[str] = field(default_factory=list)

    def phase(self, name: str, *, total: int | None = None) -> None: ...

    def advance(self, count: int = 1) -> None: ...

    def note(self, message: str) -> None:
        self.notes.append(message)


@dataclass(frozen=True)
class _FetchedLadder:
    """One property's ladder outcome plus the notes its fetch produced."""

    outcome: LadderOutcome
    notes: tuple[str, ...]


def _fetch_ladders(
    records: Sequence[PropertyRecord],
    extraction: ExtractionConfig,
    transport: Transport,
    checkpoint: ExtractionCheckpoint | None,
    progress: ProgressReporter,
) -> dict[str, _FetchedLadder]:
    """Fetch every property's ladder, up to ``example_workers`` at a time.

    Concurrency is pure pacing: the transport enforces per-host politeness
    across workers, responses land in the same keyed cache, and the caller
    assembles results in record order, so the mined content is identical
    at any worker count. Checkpoint writes and progress ticks happen only
    here on the coordinating thread, as each future completes.
    """

    def fetch(record: PropertyRecord) -> _FetchedLadder:
        endpoints = _replay_endpoints(checkpoint, record.pid, extraction)
        if not endpoints:
            return _FetchedLadder(outcome=LadderSkip(), notes=())
        collector = _NoteCollector()
        outcome = fetch_example_rows(
            record.pid,
            extraction,
            transport,
            endpoints=endpoints,
            progress=collector,
        )
        return _FetchedLadder(outcome=outcome, notes=tuple(collector.notes))

    fetched: dict[str, _FetchedLadder] = {}
    with ThreadPoolExecutor(max_workers=extraction.example_workers) as pool:
        futures = {pool.submit(fetch, record): record for record in records}
        for future in as_completed(futures):
            record = futures[future]
            ladder = future.result()
            fetched[record.pid] = ladder
            if checkpoint is not None:
                source = (
                    ladder.outcome.source if isinstance(ladder.outcome, LadderSuccess) else None
                )
                checkpoint.record_example(record.pid, source)
            progress.advance()

    return fetched


def _mine_examples(
    records: Sequence[PropertyRecord],
    extraction: ExtractionConfig,
    transport: Transport,
    taxonomy: Taxonomy | None,
    checkpoint: ExtractionCheckpoint | None,
    progress: ProgressReporter,
) -> _LadderDiagnostics:
    """Run the example ladder for every retained property.

    Fetching is (optionally) concurrent; selection, diagnostics, and note
    emission run afterwards in numeric-PID record order, so every output
    artifact is byte-identical at any worker count.
    """
    progress.phase("example ladder (per property)", total=len(records))
    if checkpoint is not None and checkpoint.examples_done:
        progress.note(
            f"resuming: {len(checkpoint.examples_done)} example outcomes replayed from checkpoint"
        )

    fetched = _fetch_ladders(records, extraction, transport, checkpoint, progress)

    diagnostics = _LadderDiagnostics()
    for record in records:
        ladder = fetched[record.pid]
        for note in ladder.notes:
            progress.note(note)

        match ladder.outcome:
            case LadderSuccess(source=source, rows=rows):
                _apply_ladder_success(
                    record, source, rows, extraction, taxonomy, diagnostics, progress
                )
            case LadderSkip():
                record.example_skipped = True
                diagnostics.skips.append(record.pid)
                progress.note(f"{record.pid}: example ladder exhausted, skipped")

    return diagnostics
