"""Commit run identity last so every partial directory has one unambiguous meaning.

Deterministic inputs and empty journals are synced before `run-state.json`
appears. Once state exists, resume validates every required file against that
identity. A completed manifest is written only after journals are validated;
reinvocation accepts it only when the requested manifest is identical.
"""

import os
from collections.abc import Iterable
from dataclasses import dataclass
from functools import partial
from pathlib import Path
from typing import Self

import trio
from pydantic import BaseModel, ValidationError

from atlas_tools.common import canonical_json_bytes, sha256_bytes, sha256_file
from atlas_tools.relation.evaluation.domain.api import (
    CorpusRecord,
    GridManifest,
    GridRunState,
    HandoffManifest,
    PhysicalAttempt,
    PilotRunState,
    SliceRecord,
    Vote,
)
from atlas_tools.relation.evaluation.storage.journal import (
    JournalPaths,
    _atomic_replace,
    _create_journal,
    _sync_directory,
)


@dataclass(frozen=True, slots=True, kw_only=True)
class PilotPaths:
    """Name every durable pilot artifact."""

    journal: JournalPaths
    slice: Path
    state: Path
    manifest: Path

    @classmethod
    def under(cls, directory: Path) -> Self:
        return cls(
            journal=JournalPaths.under(directory),
            slice=directory / "slice.jsonl",
            state=directory / "run-state.json",
            manifest=directory / "manifest.json",
        )


@dataclass(frozen=True, slots=True, kw_only=True)
class GridPaths:
    """Name every durable production-grid artifact."""

    journal: JournalPaths
    corpus: Path
    imported_votes: Path
    imported_attempts: Path
    state: Path
    manifest: Path

    @classmethod
    def under(cls, directory: Path) -> Self:
        return cls(
            journal=JournalPaths.under(directory),
            corpus=directory / "corpus.jsonl",
            imported_votes=directory / "imported-votes.jsonl",
            imported_attempts=directory / "imported-attempts.jsonl",
            state=directory / "run-state.json",
            manifest=directory / "manifest.json",
        )


def _jsonl(rows: Iterable[BaseModel]) -> bytes:
    return b"".join(canonical_json_bytes(row) + b"\n" for row in rows)


def _write_new(path: Path, payload: bytes) -> None:
    with path.open("xb") as output:
        written = output.write(payload)
        if written != len(payload):
            raise OSError(f"short write to {path}: wrote {written} of {len(payload)} bytes")
        output.flush()
        os.fsync(output.fileno())
    _sync_directory(path.parent)


def _write_state(path: Path, state: BaseModel) -> None:
    _atomic_replace(path, canonical_json_bytes(state) + b"\n")


def _load_state[State: BaseModel](path: Path, model: type[State]) -> State:
    try:
        return model.model_validate_json(path.read_bytes(), strict=True)
    except (OSError, ValidationError) as error:
        raise ValueError(f"invalid {path.name}: {error}") from error


def _ensure_inflight(path: Path) -> None:
    if path.exists():
        if not path.is_dir():
            raise ValueError(f"in-flight path is not a directory: {path}")
        return
    path.mkdir()
    _sync_directory(path.parent)


def _require_files(paths: Iterable[Path]) -> None:
    missing = sorted(path.name for path in paths if not path.is_file())
    if missing:
        raise ValueError(f"partial output is missing durable files: {missing}")


def prepare_pilot(
    paths: PilotPaths,
    *,
    state: PilotRunState,
    slice_records: tuple[SliceRecord, ...],
) -> None:
    """Create or validate a pilot directory, committing state last."""
    directory = paths.state.parent
    directory.mkdir(parents=True, exist_ok=True)
    slice_payload = _jsonl(slice_records)
    if sha256_bytes(slice_payload) != state.slice_hash:
        raise ValueError("slice records do not match the run-state slice hash")
    if paths.state.exists():
        if _load_state(paths.state, PilotRunState) != state:
            raise ValueError("partial output does not match the requested pilot plan")
        _require_files((paths.journal.votes, paths.journal.attempts, paths.slice))
        if sha256_file(paths.slice) != state.slice_hash:
            raise ValueError("durable slice does not match run state")
        _ensure_inflight(paths.journal.inflight)
        return
    unexpected = tuple(
        path.name
        for path in (paths.journal.votes, paths.journal.attempts, paths.slice)
        if path.exists()
    )
    if unexpected:
        raise ValueError(f"output has files without run-state.json: {sorted(unexpected)}")
    _write_new(paths.slice, slice_payload)
    _create_journal(paths.journal.votes)
    _create_journal(paths.journal.attempts)
    _ensure_inflight(paths.journal.inflight)
    _write_state(paths.state, state)


def prepare_grid(
    paths: GridPaths,
    *,
    state: GridRunState,
    corpus: tuple[CorpusRecord, ...],
    imported_votes: tuple[Vote, ...],
    imported_attempts: tuple[PhysicalAttempt, ...],
) -> None:
    """Create or validate a grid directory, committing dynamic-plan state last."""
    directory = paths.state.parent
    directory.mkdir(parents=True, exist_ok=True)
    payloads = {
        paths.corpus: _jsonl(corpus),
        paths.imported_votes: _jsonl(imported_votes),
        paths.imported_attempts: _jsonl(imported_attempts),
    }
    expected = {
        paths.corpus: state.corpus_hash,
        paths.imported_votes: state.imported_votes_hash,
        paths.imported_attempts: state.imported_attempts_hash,
    }
    for path, payload in payloads.items():
        if sha256_bytes(payload) != expected[path]:
            raise ValueError(f"{path.name} does not match the requested grid state")
    if paths.state.exists():
        if _load_state(paths.state, GridRunState) != state:
            raise ValueError("partial output does not match the requested grid plan")
        _require_files((*payloads, paths.journal.votes, paths.journal.attempts))
        for path, digest in expected.items():
            if sha256_file(path) != digest:
                raise ValueError(f"durable {path.name} does not match run state")
        _ensure_inflight(paths.journal.inflight)
        return
    mutable = (*payloads, paths.journal.votes, paths.journal.attempts)
    unexpected = tuple(path.name for path in mutable if path.exists())
    if unexpected:
        raise ValueError(f"output has files without run-state.json: {sorted(unexpected)}")
    for path, payload in payloads.items():
        _write_new(path, payload)
    _create_journal(paths.journal.votes)
    _create_journal(paths.journal.attempts)
    _ensure_inflight(paths.journal.inflight)
    _write_state(paths.state, state)


def write_pilot_manifest(path: Path, manifest: HandoffManifest) -> None:
    """Publish or idempotently validate the completed pilot handoff."""
    if path.exists():
        if _load_state(path, HandoffManifest) != manifest:
            raise ValueError("completed pilot manifest differs from requested output")
        return
    _write_state(path, manifest)


def write_grid_manifest(path: Path, manifest: GridManifest) -> None:
    """Publish or idempotently validate the completed production grid."""
    if path.exists():
        if _load_state(path, GridManifest) != manifest:
            raise ValueError("completed grid manifest differs from requested output")
        return
    _write_state(path, manifest)


async def write_pilot_manifest_async(path: Path, manifest: HandoffManifest) -> None:
    """Publish a pilot manifest without blocking Trio's event loop."""
    await trio.to_thread.run_sync(
        write_pilot_manifest,
        path,
        manifest,
        abandon_on_cancel=False,
    )


async def write_grid_manifest_async(path: Path, manifest: GridManifest) -> None:
    """Publish a grid manifest without blocking Trio's event loop."""
    await trio.to_thread.run_sync(
        write_grid_manifest,
        path,
        manifest,
        abandon_on_cancel=False,
    )


async def prepare_pilot_async(
    paths: PilotPaths,
    *,
    state: PilotRunState,
    slice_records: tuple[SliceRecord, ...],
) -> None:
    """Prepare pilot state without blocking Trio's event loop."""
    prepare = partial(prepare_pilot, paths, state=state, slice_records=slice_records)
    await trio.to_thread.run_sync(prepare, abandon_on_cancel=False)


async def prepare_grid_async(
    paths: GridPaths,
    *,
    state: GridRunState,
    corpus: tuple[CorpusRecord, ...],
    imported_votes: tuple[Vote, ...],
    imported_attempts: tuple[PhysicalAttempt, ...],
) -> None:
    """Prepare grid state without blocking Trio's event loop."""
    prepare = partial(
        prepare_grid,
        paths,
        state=state,
        corpus=corpus,
        imported_votes=imported_votes,
        imported_attempts=imported_attempts,
    )
    await trio.to_thread.run_sync(prepare, abandon_on_cancel=False)
