"""Hash canonical artifacts without retaining their serialized rows.

JSONL identity is the SHA-256 of each canonical model object followed by one
newline. The incremental form accepts one-shot iterables and uses constant
additional memory, which keeps finalization independent of journal size.
"""

import hashlib
from collections.abc import Iterable
from pathlib import Path

import trio
from pydantic import BaseModel

from atlas_tools.common import Sha256Hex, canonical_json_bytes, sha256_file
from atlas_tools.relation.evaluation.domain.api import (
    AttemptId,
    HistoricalRequestEvidence,
    HistoricalRequestSubset,
    PhysicalAttempt,
)


def jsonl_hash(rows: Iterable[BaseModel]) -> Sha256Hex:
    """Hash canonical JSONL rows in one pass and constant additional memory."""
    digest = hashlib.sha256()

    for row in rows:
        digest.update(canonical_json_bytes(row))
        digest.update(b"\n")

    return digest.hexdigest()


def historical_request_prefix_ids(
    attempts: tuple[PhysicalAttempt, ...],
    evidence: HistoricalRequestEvidence,
) -> frozenset[AttemptId]:
    """Verify a historical prefix and return its exact attempt identities."""
    if len(attempts) < evidence.attempt_count:
        raise ValueError("attempt journal is shorter than its historical evidence prefix")
    prefix = attempts[: evidence.attempt_count]
    if jsonl_hash(prefix) != evidence.attempts_prefix_hash:
        raise ValueError("attempt journal differs from its historical evidence prefix")
    attempt_ids = frozenset(attempt.attempt_id for attempt in prefix)
    if len(attempt_ids) != evidence.attempt_count:
        raise ValueError("historical evidence prefix contains duplicate attempt IDs")
    return attempt_ids


def build_historical_request_subset(
    source_attempts: tuple[PhysicalAttempt, ...],
    selected_attempts: tuple[PhysicalAttempt, ...],
    evidence: HistoricalRequestEvidence | None,
) -> HistoricalRequestSubset | None:
    """Derive the exact selected intersection of a verified source prefix."""
    if evidence is None:
        return None
    source_ids = frozenset(attempt.attempt_id for attempt in source_attempts)
    selected_ids = frozenset(attempt.attempt_id for attempt in selected_attempts)
    if not selected_ids <= source_ids:
        raise ValueError("selected historical evidence contains an unknown source attempt")
    historical_ids = historical_request_prefix_ids(source_attempts, evidence)
    return HistoricalRequestSubset(
        source_evidence=evidence,
        attempt_ids=tuple(sorted(selected_ids & historical_ids)),
    )


async def file_hash(path: Path) -> Sha256Hex:
    """Hash a file without blocking Trio's event loop."""
    return await trio.to_thread.run_sync(sha256_file, path, abandon_on_cancel=False)
