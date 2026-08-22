"""Load, analyze, and publish one completed factorial pilot.

This application boundary owns filesystem access and Trio scheduling. It
loads independent artifacts concurrently, validates every recorded source
digest, and passes only immutable domain models into the pure analysis core.
The synchronous facade preserves the current CLI's handoff/out contract while
the async entry point keeps blocking I/O and bootstrap work off the event loop.
"""

import hashlib
from dataclasses import dataclass
from functools import partial
from pathlib import Path

import trio
from pydantic import BaseModel, ConfigDict, ValidationError

from atlas_tools.common import Sha256Hex, sha256_bytes
from atlas_tools.relation.evaluation.analysis.api import (
    PilotAnalysisPolicy,
    PilotHoldoutRule,
    analyze_pilot,
)
from atlas_tools.relation.evaluation.application.pilot_reporting import (
    PilotAnalysisRun,
    PilotDecisionArtifact,
    write_pilot_artifacts,
)
from atlas_tools.relation.evaluation.domain.api import (
    EvaluationCard,
    FrozenMapping,
    HandoffManifest,
    PhysicalAttempt,
    SliceRecord,
    Vote,
)
from atlas_tools.relation.evaluation.modes.api import (
    FEW_SHOTS,
    HOLDOUTS,
    accepted_holdout_verdicts,
    pilot_slice_selection_hash,
)
from atlas_tools.relation.evaluation.storage.api import VerifiedDeck, load_deck_async

_MANIFEST_SOURCES = frozenset(
    {
        "attempts.jsonl",
        "cards.jsonl",
        "cards.manifest.json",
        "slice.jsonl",
        "votes.jsonl",
    }
)
_MANDATORY_HOLDOUTS = frozenset({"wikidata:P1382", "wikidata:P2634"})


class _ApplicationModel(BaseModel):
    """Reject coercion, mutation, unknown fields, and invalid defaults."""

    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        strict=True,
        validate_default=True,
    )


class LoadedPilotHandoff(_ApplicationModel):
    """Carry source-bound domain rows ready for pure pilot analysis."""

    handoff_directory: Path
    cards_directory: Path
    manifest: HandoffManifest
    slice_records: tuple[SliceRecord, ...]
    cards: tuple[EvaluationCard, ...]
    votes: tuple[Vote, ...]
    attempts: tuple[PhysicalAttempt, ...]
    input_hashes: FrozenMapping[str, Sha256Hex]


@dataclass(frozen=True, slots=True)
class _HashedRows[Row: BaseModel]:
    rows: tuple[Row, ...]
    digest: Sha256Hex


@dataclass(frozen=True, slots=True)
class _HashedManifest:
    manifest: HandoffManifest
    digest: Sha256Hex


def _read_manifest(path: Path) -> _HashedManifest:
    try:
        payload = path.read_bytes()
        manifest = HandoffManifest.model_validate_json(payload, strict=True)
    except (OSError, ValidationError) as error:
        raise ValueError(f"invalid completed pilot manifest {path}: {error}") from error
    return _HashedManifest(manifest=manifest, digest=sha256_bytes(payload))


def _read_jsonl[Row: BaseModel](path: Path, model: type[Row]) -> _HashedRows[Row]:
    digest = hashlib.sha256()
    rows: list[Row] = []
    try:
        input_file = path.open("rb")
    except OSError as error:
        raise ValueError(f"cannot read completed pilot artifact {path}: {error}") from error
    with input_file:
        for line_number, line in enumerate(input_file, start=1):
            digest.update(line)
            if not line.strip():
                continue
            try:
                rows.append(model.model_validate_json(line, strict=True))
            except ValidationError as error:
                raise ValueError(f"invalid {path.name} line {line_number}: {error}") from error
    return _HashedRows(rows=tuple(rows), digest=digest.hexdigest())


def _one[Value](values: list[Value], name: str) -> Value:
    if len(values) != 1:
        raise AssertionError(f"parallel {name} loader did not produce exactly one result")
    return values[0]


def _validate_source_bindings(
    *,
    manifest: HandoffManifest,
    manifest_hash: Sha256Hex,
    deck: VerifiedDeck,
    slice_rows: _HashedRows[SliceRecord],
    votes: _HashedRows[Vote],
    attempts: _HashedRows[PhysicalAttempt],
) -> dict[str, Sha256Hex]:
    recorded = dict(manifest.source_hashes)
    if set(recorded) != _MANIFEST_SOURCES:
        raise ValueError("completed pilot manifest must bind exactly five source artifacts")
    observed = {
        "attempts.jsonl": attempts.digest,
        "cards.jsonl": deck.source_hashes["cards.jsonl"],
        "cards.manifest.json": deck.source_hashes["cards.manifest.json"],
        "slice.jsonl": slice_rows.digest,
        "votes.jsonl": votes.digest,
    }
    changed = tuple(name for name in sorted(observed) if observed[name] != recorded[name])
    if changed:
        raise ValueError(f"completed pilot source digests differ from its manifest: {changed}")
    if manifest.slice_derivation.cards_hash != observed["cards.jsonl"]:
        raise ValueError("slice derivation and manifest disagree on the card artifact")
    selection_hash = pilot_slice_selection_hash(slice_rows.rows)
    if selection_hash != manifest.slice_derivation.selection_hash:
        raise ValueError("slice records do not match the manifest selection hash")
    return {**observed, "manifest.json": manifest_hash}


def _select_cards(
    manifest: HandoffManifest,
    deck: VerifiedDeck,
) -> tuple[EvaluationCard, ...]:
    expected = set(manifest.expected_grid.relation_ids)
    cards = tuple(card for card in deck.cards if card.relation_id in expected)
    if {card.relation_id for card in cards} != expected:
        missing = tuple(sorted(expected - set(deck.by_relation_id)))
        raise ValueError(f"verified card artifact lacks pilot relations: {missing}")
    few_shot_ids = {row.relation_id for row in FEW_SHOTS}
    missing_shots = tuple(sorted(few_shot_ids - set(deck.by_relation_id)))
    if missing_shots:
        raise ValueError(f"verified card artifact lacks rubric few-shot cards: {missing_shots}")
    contaminated = tuple(sorted(expected & few_shot_ids))
    if contaminated:
        raise ValueError(f"pilot slice contains rubric few-shot cards: {contaminated}")
    eligible_cards = len(deck.cards) - len(few_shot_ids)
    if manifest.full_grid_card_count != eligible_cards:
        raise ValueError("manifest full-grid card count differs from the verified card artifact")
    return tuple(sorted(cards, key=lambda card: card.relation_id))


async def load_pilot_handoff_async(
    handoff_directory: Path,
    cards_directory: Path,
) -> LoadedPilotHandoff:
    """Load and cross-validate a completed pilot and its exact card source.

    The three journal artifacts and the card artifact are read concurrently.
    Each JSONL file is parsed and hashed in one pass. No statistical decision
    is attempted until all byte and selection bindings agree.

    Raises:
        ValueError: An artifact is invalid, incomplete, or differs from the
            completed manifest.

    """
    manifest_file = await trio.to_thread.run_sync(
        _read_manifest,
        handoff_directory / "manifest.json",
        abandon_on_cancel=False,
    )
    deck_results: list[VerifiedDeck] = []
    slice_results: list[_HashedRows[SliceRecord]] = []
    vote_results: list[_HashedRows[Vote]] = []
    attempt_results: list[_HashedRows[PhysicalAttempt]] = []

    async def load_deck() -> None:
        deck_results.append(await load_deck_async(cards_directory))

    async def load_slice() -> None:
        loader = partial(_read_jsonl, handoff_directory / "slice.jsonl", SliceRecord)
        slice_results.append(await trio.to_thread.run_sync(loader, abandon_on_cancel=False))

    async def load_votes() -> None:
        loader = partial(_read_jsonl, handoff_directory / "votes.jsonl", Vote)
        vote_results.append(await trio.to_thread.run_sync(loader, abandon_on_cancel=False))

    async def load_attempts() -> None:
        loader = partial(
            _read_jsonl,
            handoff_directory / "attempts.jsonl",
            PhysicalAttempt,
        )
        attempt_results.append(await trio.to_thread.run_sync(loader, abandon_on_cancel=False))

    async with trio.open_nursery() as nursery:
        nursery.start_soon(load_deck)
        nursery.start_soon(load_slice)
        nursery.start_soon(load_votes)
        nursery.start_soon(load_attempts)

    deck = _one(deck_results, "card")
    slice_rows = _one(slice_results, "slice")
    votes = _one(vote_results, "vote")
    attempts = _one(attempt_results, "attempt")
    input_hashes = _validate_source_bindings(
        manifest=manifest_file.manifest,
        manifest_hash=manifest_file.digest,
        deck=deck,
        slice_rows=slice_rows,
        votes=votes,
        attempts=attempts,
    )
    return LoadedPilotHandoff(
        handoff_directory=handoff_directory,
        cards_directory=cards_directory,
        manifest=manifest_file.manifest,
        slice_records=slice_rows.rows,
        cards=_select_cards(manifest_file.manifest, deck),
        votes=votes.rows,
        attempts=attempts.rows,
        input_hashes=input_hashes,
    )


def rubric_v1_pilot_policy() -> PilotAnalysisPolicy:
    """Return the fixed, fully explicit rubric-v1 pilot decision policy."""
    rules: list[PilotHoldoutRule] = []
    for holdout in sorted(HOLDOUTS, key=lambda row: row.relation_id):
        accepted = accepted_holdout_verdicts(holdout.relation_id)
        rules.append(
            PilotHoldoutRule(
                relation_id=holdout.relation_id,
                accepted_verdicts=(
                    holdout.verdict,
                    *sorted(accepted - {holdout.verdict}),
                ),
                mandatory_probe=holdout.relation_id in _MANDATORY_HOLDOUTS,
            )
        )
    return PilotAnalysisPolicy(
        holdouts=tuple(rules),
        holdout_minimum_correct=5,
    )


async def analyze_handoff_async(
    handoff_directory: Path,
    output_directory: Path,
    *,
    cards_directory: Path | None = None,
    policy: PilotAnalysisPolicy | None = None,
) -> PilotAnalysisRun:
    """Analyze one completed handoff and publish deterministic artifacts.

    When `cards_directory` is omitted, the sibling `cards` directory preserves
    the current CLI layout. Callers with a different artifact topology should
    pass the verified card directory explicitly.

    Raises:
        OSError: An artifact cannot be read, written, or synchronized.
        ValueError: Input identity, analysis evidence, or output validation
            fails closed.

    """
    resolved_cards = cards_directory or handoff_directory.parent / "cards"
    resolved_policy = policy or rubric_v1_pilot_policy()
    handoff = await load_pilot_handoff_async(handoff_directory, resolved_cards)
    analyzer = partial(
        analyze_pilot,
        manifest=handoff.manifest,
        slice_records=handoff.slice_records,
        cards=handoff.cards,
        votes=handoff.votes,
        attempts=handoff.attempts,
        policy=resolved_policy,
    )
    analysis = await trio.to_thread.run_sync(analyzer, abandon_on_cancel=False)
    decisions = PilotDecisionArtifact.from_analysis(
        input_hashes=handoff.input_hashes,
        manifest=handoff.manifest,
        policy=resolved_policy,
        analysis=analysis,
    )
    writer = partial(write_pilot_artifacts, output_directory, decisions)
    return await trio.to_thread.run_sync(writer, abandon_on_cancel=False)


def analyze_handoff(
    handoff_directory: Path,
    output_directory: Path,
    *,
    cards_directory: Path | None = None,
    policy: PilotAnalysisPolicy | None = None,
) -> PilotAnalysisRun:
    """Run the async pilot application from the synchronous public CLI.

    Async callers must use [`analyze_handoff_async`] rather than nesting a Trio
    event loop.
    """
    run = partial(
        analyze_handoff_async,
        handoff_directory,
        output_directory,
        cards_directory=cards_directory,
        policy=policy,
    )
    return trio.run(run)
