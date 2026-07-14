"""Make every paid request recoverable through an append-only durability protocol.

The protocol is intentionally asymmetric. An in-flight marker is durable
before transport begins. The physical attempt is appended and synced before
that marker is removed. A marker with no matching attempt means billing is
unknown and resume fails closed; a marker with a matching attempt is a safe
post-append crash and recovery removes it.
"""

import fcntl
import os
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from functools import partial
from pathlib import Path
from threading import Lock
from typing import Self

import trio
from pydantic import BaseModel, ValidationError

from atlas_tools.common import Sha256Hex, canonical_json_bytes
from atlas_tools.relation.evaluation.domain.api import (
    InFlightRequest,
    PhysicalAttempt,
    Vote,
)
from atlas_tools.relation.evaluation.storage.codec import load_jsonl


class UnknownBillingStateError(RuntimeError):
    """Report requests that may be billed but have no durable outcome."""

    def __init__(self, attempt_ids: tuple[Sha256Hex, ...]) -> None:
        joined = ", ".join(attempt_ids)
        super().__init__(f"unresolved in-flight attempts require operator review: {joined}")
        self.attempt_ids = attempt_ids


@dataclass(frozen=True, slots=True, kw_only=True)
class DurableAttempt:
    """Prove that one attempt is synced while its marker is still present."""

    attempt_id: Sha256Hex


@dataclass(frozen=True, slots=True, kw_only=True)
class JournalPaths:
    """Name the complete mutable durability surface of one run."""

    votes: Path
    attempts: Path
    inflight: Path
    lock: Path

    @classmethod
    def under(cls, directory: Path) -> Self:
        """Use the stable filenames shared by pilot and grid runs."""
        return cls(
            votes=directory / "votes.jsonl",
            attempts=directory / "attempts.jsonl",
            inflight=directory / "inflight",
            lock=directory / ".run.lock",
        )


@dataclass(frozen=True, slots=True, kw_only=True)
class JournalSnapshot:
    """A mutually consistent read of both append-only journals."""

    votes: tuple[Vote, ...]
    attempts: tuple[PhysicalAttempt, ...]


_PATH_LOCKS_GUARD = Lock()
_PATH_LOCKS: dict[Path, Lock] = {}


def _path_lock(path: Path) -> Lock:
    key = path.absolute()
    with _PATH_LOCKS_GUARD:
        lock = _PATH_LOCKS.get(key)
        if lock is None:
            lock = Lock()
            _PATH_LOCKS[key] = lock
        return lock


def _sync_directory(directory: Path) -> None:
    descriptor = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _atomic_replace(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
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
        _sync_directory(path.parent)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def _create_journal(path: Path) -> None:
    with path.open("xb") as output:
        output.flush()
        os.fsync(output.fileno())
    _sync_directory(path.parent)


def _append(path: Path, row: BaseModel) -> None:
    payload = canonical_json_bytes(row) + b"\n"
    with _path_lock(path), path.open("ab") as output:
        written = output.write(payload)
        if written != len(payload):
            raise OSError(f"short append to {path}: wrote {written} of {len(payload)} bytes")
        output.flush()
        os.fsync(output.fileno())


def _marker_path(paths: JournalPaths, attempt_id: Sha256Hex) -> Path:
    return paths.inflight / f"{attempt_id}.json"


def _mark(paths: JournalPaths, request: InFlightRequest) -> None:
    paths.inflight.mkdir(parents=True, exist_ok=True)
    marker = _marker_path(paths, request.attempt_id)
    if marker.exists():
        raise ValueError(f"physical attempt {request.attempt_id} is already marked in flight")
    _atomic_replace(marker, canonical_json_bytes(request) + b"\n")


def _clear_marker(paths: JournalPaths, attempt_id: Sha256Hex) -> None:
    marker = _marker_path(paths, attempt_id)
    marker.unlink()
    _sync_directory(paths.inflight)


def _validated_marker(paths: JournalPaths, attempt: PhysicalAttempt) -> InFlightRequest:
    marker = _marker_path(paths, attempt.attempt_id)
    try:
        request = InFlightRequest.model_validate_json(marker.read_bytes(), strict=True)
    except OSError as error:
        raise ValueError(f"attempt {attempt.attempt_id} has no durable in-flight marker") from error
    if (
        request.vote_id != attempt.vote_id
        or request.request_hash != attempt.request_hash
        or request.request_stage != attempt.request_stage
        or request.stage_attempt != attempt.stage_attempt
    ):
        raise ValueError(f"attempt {attempt.attempt_id} does not match its in-flight marker")
    return request


def _append_attempt(paths: JournalPaths, attempt: PhysicalAttempt) -> None:
    _validated_marker(paths, attempt)
    _append(paths.attempts, attempt)


def _recover(paths: JournalPaths) -> int:
    attempts = load_jsonl(paths.attempts, PhysicalAttempt)
    by_id = {attempt.attempt_id: attempt for attempt in attempts}
    unresolved: list[Sha256Hex] = []
    recovered = 0
    for marker in sorted(paths.inflight.glob("*.json")):
        try:
            request = InFlightRequest.model_validate_json(marker.read_bytes(), strict=True)
        except (OSError, ValidationError) as error:
            raise ValueError(f"invalid in-flight marker {marker}: {error}") from error
        attempt = by_id.get(request.attempt_id)
        if attempt is None:
            unresolved.append(request.attempt_id)
            continue
        if (
            attempt.vote_id != request.vote_id
            or attempt.request_hash != request.request_hash
            or attempt.request_stage != request.request_stage
            or attempt.stage_attempt != request.stage_attempt
        ):
            raise ValueError(f"in-flight marker {marker} disagrees with the attempt journal")
        marker.unlink()
        recovered += 1
    if recovered:
        _sync_directory(paths.inflight)
    if unresolved:
        raise UnknownBillingStateError(tuple(unresolved))
    return recovered


@contextmanager
def exclusive_run(paths: JournalPaths) -> Iterator[None]:
    """Hold the non-blocking process lease for one run directory."""
    paths.lock.parent.mkdir(parents=True, exist_ok=True)
    with paths.lock.open("a+b") as lock:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise ValueError(f"another evaluator is already using {paths.lock.parent}") from error
        try:
            yield
        finally:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


class RunJournal:
    """Serialize async journal mutations and keep blocking I/O off the event loop."""

    __slots__ = ("_durable_attempts", "_lock", "paths")

    def __init__(self, *, paths: JournalPaths) -> None:
        self.paths = paths
        self._lock = trio.Lock()
        self._durable_attempts: set[Sha256Hex] = set()

    async def create(self) -> None:
        """Create empty journals and the marker directory exactly once."""
        async with self._lock:
            make_inflight = partial(self.paths.inflight.mkdir, parents=True, exist_ok=True)
            await trio.to_thread.run_sync(
                make_inflight,
                abandon_on_cancel=False,
            )
            await trio.to_thread.run_sync(
                _create_journal,
                self.paths.attempts,
                abandon_on_cancel=False,
            )
            await trio.to_thread.run_sync(
                _create_journal,
                self.paths.votes,
                abandon_on_cancel=False,
            )

    async def mark_inflight(self, request: InFlightRequest) -> None:
        """Persist possible billing before yielding to transport."""
        async with self._lock:
            await trio.to_thread.run_sync(
                _mark,
                self.paths,
                request,
                abandon_on_cancel=False,
            )

    async def append_attempt(self, attempt: PhysicalAttempt) -> DurableAttempt:
        """Sync an outcome and return proof while retaining its billing marker."""
        async with self._lock:
            await trio.to_thread.run_sync(
                _append_attempt,
                self.paths,
                attempt,
                abandon_on_cancel=False,
            )
            self._durable_attempts.add(attempt.attempt_id)
            return DurableAttempt(attempt_id=attempt.attempt_id)

    async def clear_inflight(self, durable: DurableAttempt) -> None:
        """Remove a marker only after the caller settles its durable attempt."""
        async with self._lock:
            if durable.attempt_id not in self._durable_attempts:
                raise ValueError(
                    f"attempt {durable.attempt_id} was not durably appended by this journal"
                )
            await trio.to_thread.run_sync(
                _clear_marker,
                self.paths,
                durable.attempt_id,
                abandon_on_cancel=False,
            )
            self._durable_attempts.remove(durable.attempt_id)

    async def append_vote(self, vote: Vote) -> None:
        """Append a logical vote after all of its physical attempts are durable."""
        async with self._lock:
            await trio.to_thread.run_sync(
                _append,
                self.paths.votes,
                vote,
                abandon_on_cancel=False,
            )

    async def recover(self) -> int:
        """Clear proven post-append markers and fail on unknown billing."""
        async with self._lock:
            recovered = await trio.to_thread.run_sync(
                _recover,
                self.paths,
                abandon_on_cancel=False,
            )
            self._durable_attempts.clear()
            return recovered

    async def attempts(self) -> tuple[PhysicalAttempt, ...]:
        """Validate the physical journal directly from JSON bytes."""
        async with self._lock:
            loader = partial(load_jsonl, self.paths.attempts, PhysicalAttempt)
            return await trio.to_thread.run_sync(loader, abandon_on_cancel=False)

    async def votes(self) -> tuple[Vote, ...]:
        """Validate the logical journal directly from JSON bytes."""
        async with self._lock:
            loader = partial(load_jsonl, self.paths.votes, Vote)
            return await trio.to_thread.run_sync(loader, abandon_on_cancel=False)

    async def snapshot(self) -> JournalSnapshot:
        """Validate both journals concurrently while excluding local mutation."""
        votes: list[tuple[Vote, ...]] = []
        attempts: list[tuple[PhysicalAttempt, ...]] = []

        async def load_votes() -> None:
            loader = partial(load_jsonl, self.paths.votes, Vote)
            votes.append(await trio.to_thread.run_sync(loader, abandon_on_cancel=False))

        async def load_attempts() -> None:
            loader = partial(load_jsonl, self.paths.attempts, PhysicalAttempt)
            attempts.append(await trio.to_thread.run_sync(loader, abandon_on_cancel=False))

        async with self._lock, trio.open_nursery() as nursery:
            nursery.start_soon(load_votes)
            nursery.start_soon(load_attempts)
        if len(votes) != 1 or len(attempts) != 1:
            raise AssertionError("journal snapshot loaders did not each produce one result")
        return JournalSnapshot(votes=votes[0], attempts=attempts[0])
