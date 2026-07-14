"""Durable JSONL and in-flight request persistence for relation evaluation."""

import fcntl
import os
import tempfile
from collections.abc import Iterable, Iterator, Sequence
from contextlib import contextmanager
from pathlib import Path
from threading import Lock
from typing import Literal, Protocol

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    NonNegativeInt,
    ValidationError,
)

from atlas_tools.common import Sha256Hex, canonical_json_bytes
from atlas_tools.relation.eval.schema import PhysicalAttemptRow

type RequestStage = Literal["initial", "repair"]


class JournalPaths(Protocol):
    """Paths required by journal loading, recovery, and appending."""

    @property
    def votes_jsonl(self) -> Path: ...

    @property
    def attempts_jsonl(self) -> Path: ...

    @property
    def inflight_dir(self) -> Path: ...


class InFlightRequest(BaseModel):
    """Durable evidence that a physical request may have incurred a charge."""

    attempt_id: Sha256Hex
    vote_id: Sha256Hex
    request_hash: Sha256Hex
    request_stage: RequestStage
    stage_attempt: NonNegativeInt
    created_at: AwareDatetime

    model_config = ConfigDict(extra="forbid", frozen=True)


_APPEND_LOCKS_GUARD = Lock()
_APPEND_LOCKS: dict[Path, Lock] = {}


def _path_lock(path: Path) -> Lock:
    key = path.absolute()
    with _APPEND_LOCKS_GUARD:
        lock = _APPEND_LOCKS.get(key)
        if lock is None:
            lock = Lock()
            _APPEND_LOCKS[key] = lock
        return lock


def sync_directory(directory: Path) -> None:
    """Persist directory-entry changes made before this call."""
    descriptor = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def atomic_replace(path: Path, payload: bytes) -> None:
    """Durably replace a small state-like file through its parent directory."""
    with tempfile.NamedTemporaryFile(
        mode="wb",
        dir=path.parent,
        prefix=f".{path.name}.",
        delete=False,
    ) as output:
        temporary = Path(output.name)
        try:
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    try:
        temporary.replace(path)
        sync_directory(path.parent)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


@contextmanager
def exclusive_run_lock(lock_file: Path) -> Iterator[None]:
    """Acquire the non-blocking process lock for one output directory."""
    lock_file.parent.mkdir(parents=True, exist_ok=True)
    with lock_file.open("a+b") as lock:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise ValueError(f"another evaluator is already using {lock_file.parent}") from error
        try:
            yield
        finally:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def jsonl_bytes(rows: Iterable[BaseModel]) -> bytes:
    return b"".join(canonical_json_bytes(row) + b"\n" for row in rows)


def write_new_jsonl(path: Path, rows: Iterable[BaseModel]) -> None:
    """Create and fsync a JSONL artifact without replacement semantics."""
    with path.open("xb") as output:
        output.write(jsonl_bytes(rows))
        output.flush()
        os.fsync(output.fileno())
    sync_directory(path.parent)


def create_empty_jsonl(path: Path) -> None:
    """Create and fsync an empty append-only journal."""
    with path.open("xb") as output:
        output.flush()
        os.fsync(output.fileno())
    sync_directory(path.parent)


def load_jsonl[Model: BaseModel](path: Path, model: type[Model]) -> list[Model]:
    rows: list[Model] = []
    try:
        input_file = path.open(encoding="utf-8")
    except OSError as error:
        raise ValueError(f"cannot read durable journal {path}: {error}") from error
    with input_file:
        for line_number, line in enumerate(input_file, start=1):
            if not line.strip():
                continue
            try:
                rows.append(model.model_validate_json(line))
            except ValidationError as error:
                raise ValueError(f"invalid {path.name} line {line_number}: {error}") from error
    return rows


def _append_jsonl_locked(path: Path, row: BaseModel) -> None:
    payload = canonical_json_bytes(row) + b"\n"
    with path.open("ab") as output:
        written = output.write(payload)
        if written != len(payload):
            raise OSError(f"short append to {path}: wrote {written} of {len(payload)} bytes")
        output.flush()
        os.fsync(output.fileno())


def append_jsonl(path: Path, row: BaseModel) -> None:
    """Serialize a durable row append across all worker threads in this process."""
    with _path_lock(path):
        _append_jsonl_locked(path, row)


def inflight_marker_path(inflight_dir: Path, attempt_id: Sha256Hex) -> Path:
    return inflight_dir / f"{attempt_id}.json"


def mark_inflight(inflight_dir: Path, request: InFlightRequest) -> Path:
    """Durably mark a request pending before the paid transport call begins."""
    inflight_dir.mkdir(parents=True, exist_ok=True)
    marker = inflight_marker_path(inflight_dir, request.attempt_id)
    if marker.exists():
        raise ValueError(f"physical attempt {request.attempt_id} is already marked in flight")
    atomic_replace(marker, canonical_json_bytes(request) + b"\n")
    return marker


def _load_inflight_marker(marker: Path) -> InFlightRequest:
    try:
        request = InFlightRequest.model_validate_json(marker.read_bytes())
    except (OSError, ValidationError) as error:
        raise ValueError(f"invalid in-flight marker {marker}: {error}") from error
    if marker.name != f"{request.attempt_id}.json":
        raise ValueError(f"in-flight marker name does not match its attempt ID: {marker}")
    return request


def _clear_inflight_marker(marker: Path) -> None:
    marker.unlink(missing_ok=True)
    sync_directory(marker.parent)


def _validate_marker_attempt(request: InFlightRequest, attempt: PhysicalAttemptRow) -> None:
    expected = {
        "attempt_id": attempt.attempt_id,
        "vote_id": attempt.vote_id,
        "request_hash": attempt.request_hash,
        "request_stage": attempt.request_stage,
        "stage_attempt": attempt.stage_attempt,
        "created_at": attempt.ts_request,
    }
    mismatches = [
        field_name
        for field_name, expected_value in expected.items()
        if getattr(request, field_name) != expected_value
    ]
    if mismatches:
        raise ValueError(
            f"in-flight marker for {attempt.attempt_id} disagrees with attempt row: {mismatches}"
        )


def append_attempt(paths: JournalPaths, attempt: PhysicalAttemptRow) -> None:
    """Append+fsync an attempt, then and only then delete its pending marker."""
    marker = inflight_marker_path(paths.inflight_dir, attempt.attempt_id)
    with _path_lock(paths.attempts_jsonl):
        if not marker.is_file():
            raise ValueError(f"physical attempt {attempt.attempt_id} has no in-flight marker")
        request = _load_inflight_marker(marker)
        _validate_marker_attempt(request, attempt)
        _append_jsonl_locked(paths.attempts_jsonl, attempt)
        _clear_inflight_marker(marker)


def _remove_abandoned_marker_temps(inflight_dir: Path) -> None:
    removed = False
    for path in inflight_dir.iterdir():
        if path.is_file() and path.name.startswith("."):
            path.unlink()
            removed = True
    if removed:
        sync_directory(inflight_dir)


def recover_inflight(
    inflight_dir: Path,
    attempts: Sequence[PhysicalAttemptRow],
) -> None:
    """Reconcile markers with attempts, failing closed on unknown billing state."""
    if not inflight_dir.exists():
        return
    if not inflight_dir.is_dir():
        raise ValueError(f"in-flight path is not a directory: {inflight_dir}")

    _remove_abandoned_marker_temps(inflight_dir)
    by_id = {attempt.attempt_id: attempt for attempt in attempts}
    if len(by_id) != len(attempts):
        raise ValueError("attempts.jsonl contains duplicate attempt IDs")

    pending: list[Sha256Hex] = []
    for marker in sorted(inflight_dir.iterdir()):
        if not marker.is_file() or marker.suffix != ".json":
            raise ValueError(f"unexpected entry in in-flight directory: {marker}")
        request = _load_inflight_marker(marker)
        attempt = by_id.get(request.attempt_id)
        if attempt is None:
            pending.append(request.attempt_id)
            continue
        _validate_marker_attempt(request, attempt)
        _clear_inflight_marker(marker)

    if pending:
        raise ValueError(
            "requests were durably marked in flight but have no recorded outcomes; "
            f"billing state is unknown, so automatic retry is unsafe: {pending}"
        )
