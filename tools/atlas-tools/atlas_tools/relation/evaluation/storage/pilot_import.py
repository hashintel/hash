"""Import only pilot votes whose complete logical identity matches the grid.

Matching by `vote_id` binds card content, route pins, prompt pack, decoding,
effort, and repeat. The loader verifies the completed pilot hashes first and
requires physical audit evidence for every selected vote. Imported rows are
ordered by vote ID, with each vote's physical attempts kept in journal order.
"""

from dataclasses import dataclass
from functools import partial
from pathlib import Path

import trio
from pydantic import ValidationError

from atlas_tools.common import Sha256Hex, canonical_json_bytes, sha256_file
from atlas_tools.relation.evaluation.domain.api import (
    HandoffManifest,
    HistoricalCompletionRequestPolicyId,
    PhysicalAttempt,
    PilotRunConfig,
    PromptPackHash,
    Vote,
    VoteId,
)
from atlas_tools.relation.evaluation.storage.codec import load_jsonl


@dataclass(frozen=True, slots=True, kw_only=True)
class PilotImport:
    """Carry the exact pilot subset and its complete physical audit trail."""

    config: PilotRunConfig
    manifest_hash: Sha256Hex
    votes_hash: Sha256Hex
    attempts_hash: Sha256Hex
    historical_request_policy_ids: tuple[HistoricalCompletionRequestPolicyId, ...]
    votes: tuple[Vote, ...]
    attempts: tuple[PhysicalAttempt, ...]


def _manifest(directory: Path) -> HandoffManifest:
    path = directory / "manifest.json"
    try:
        return HandoffManifest.model_validate_json(path.read_bytes(), strict=True)
    except (OSError, ValidationError) as error:
        raise ValueError(f"invalid completed pilot manifest {path}: {error}") from error


def load_pilot_import(
    directory: Path,
    *,
    planned_vote_ids: frozenset[VoteId],
    prompt_pack_hash: PromptPackHash,
) -> PilotImport:
    """Load the exact baseline intersection or fail on drift and missing audit."""
    manifest = _manifest(directory)
    try:
        config = PilotRunConfig.model_validate_json(
            canonical_json_bytes(dict(manifest.executor_config)),
            strict=True,
        )
    except ValidationError as error:
        raise ValueError("pilot manifest contains an invalid executor config") from error
    if tuple(pin.judge for pin in manifest.judges) != config.judges:
        raise ValueError("pilot manifest judges differ from its executor config")
    if manifest.prompt_pack_hash != prompt_pack_hash:
        raise ValueError("prompt pack differs from the pilot and voids qualification")
    votes_path = directory / "votes.jsonl"
    attempts_path = directory / "attempts.jsonl"
    for name, path in (("votes.jsonl", votes_path), ("attempts.jsonl", attempts_path)):
        recorded = manifest.source_hashes.get(name)
        if recorded is None or sha256_file(path) != recorded:
            raise ValueError(f"pilot {name} does not match its completed manifest")

    selected = tuple(
        sorted(
            (vote for vote in load_jsonl(votes_path, Vote) if vote.vote_id in planned_vote_ids),
            key=lambda vote: vote.vote_id,
        )
    )
    selected_ids = {vote.vote_id for vote in selected}
    if len(selected_ids) != len(selected):
        raise ValueError("pilot contains duplicate importable vote IDs")
    by_vote: dict[VoteId, list[PhysicalAttempt]] = {vote_id: [] for vote_id in selected_ids}
    for attempt in load_jsonl(attempts_path, PhysicalAttempt):
        bucket = by_vote.get(attempt.vote_id)
        if bucket is not None:
            bucket.append(attempt)
    missing = sorted(vote_id for vote_id, attempts in by_vote.items() if not attempts)
    if missing:
        raise ValueError(f"pilot lacks physical attempts for imported votes: {missing[:5]}")
    attempts = tuple(attempt for vote in selected for attempt in by_vote[vote.vote_id])
    return PilotImport(
        config=config,
        manifest_hash=sha256_file(directory / "manifest.json"),
        votes_hash=manifest.source_hashes["votes.jsonl"],
        attempts_hash=manifest.source_hashes["attempts.jsonl"],
        historical_request_policy_ids=manifest.historical_request_policy_ids,
        votes=selected,
        attempts=attempts,
    )


async def load_pilot_import_async(
    directory: Path,
    *,
    planned_vote_ids: frozenset[VoteId],
    prompt_pack_hash: PromptPackHash,
) -> PilotImport:
    """Validate a paid pilot import without blocking Trio's event loop."""
    load = partial(
        load_pilot_import,
        directory,
        planned_vote_ids=planned_vote_ids,
        prompt_pack_hash=prompt_pack_hash,
    )
    return await trio.to_thread.run_sync(load, abandon_on_cancel=False)
