import json
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

import pytest
import yaml

from atlas_tools.common import sha256_file
from atlas_tools.relation.evaluation.domain.api import (
    AcceptedAttempt,
    FailedAttempt,
    InFlightRequest,
    PhysicalAttempt,
    ProviderFailure,
    RequestHash,
    Vote,
    attempt_id,
)
from atlas_tools.relation.evaluation.storage.api import load_json, load_jsonl
from scripts.migrate_evaluation_artifacts import MigrationResult, main, migrate_directory

_MODEL = "test/model-v1"
_PROVIDER_NAME = "Test Provider"
_PROVIDER_SLUG = "test-provider"
_VOTE_ID = "a" * 64
_MARKER_VOTE_ID = "b" * 64
_CARD_HASH = "c" * 64
_PROMPT_PACK_HASH = "d" * 64
_INITIAL_REQUEST_HASH = RequestHash("1" * 64)
_REPAIR_REQUEST_HASH = RequestHash("2" * 64)
_MARKER_REQUEST_HASH = RequestHash("3" * 64)
_INITIAL_CONTENT = '{"verdict":"overlay","reason":"initial malformed"}'
_REPAIRED_CONTENT = '{"verdict":"coincident","reason":"same referent"}'


@dataclass(frozen=True, slots=True)
class _LegacyRun:
    source: Path
    config: Path
    attempts: tuple[dict[str, object], ...]
    vote: dict[str, object]
    accepted_attempt_ids: tuple[str, str]
    marker_id: str


def _write_jsonl(path: Path, rows: Sequence[object]) -> None:
    path.write_text(
        "".join(f"{json.dumps(row, separators=(',', ':'))}\n" for row in rows),
        encoding="utf-8",
    )


def _write_config(path: Path, *, mode: str) -> None:
    judge: dict[str, object] = {
        "provider_slug": _PROVIDER_SLUG,
        "provider_name": _PROVIDER_NAME,
        "openrouter_region": "global",
        "model": _MODEL,
        "temperature": 0.0,
        "seed": 7,
        "output_token_limit": {
            "parameter": "max_completion_tokens",
            "tokens": 256,
        },
    }
    if mode == "pilot":
        payload: dict[str, object] = {
            "schema_version": 3,
            "mode": "pilot",
            "sampling": {"algorithm": "stratified-hash-v1", "seed": 19},
            "judges": [judge],
        }
    else:
        judge |= {"effort": "minimal", "pilot_cost_per_vote_usd": 0.25}
        payload = {
            "schema_version": 4,
            "mode": "grid",
            "panel": {
                "version": 1,
                "frozen": True,
                "pruning_floor": "test fixture floor",
            },
            "judges": [judge],
        }
    path.write_text(yaml.safe_dump(payload, sort_keys=False), encoding="utf-8")


def _provider_result(
    *,
    result_id: str,
    content: str,
    prompt_tokens: int,
    completion_tokens: int,
    cached_tokens: int,
    cache_write_tokens: int,
    reasoning_tokens: int,
    cost: float,
) -> dict[str, object]:
    return {
        "id": result_id,
        "model": _MODEL,
        "choices": [
            {
                "index": 0,
                "finish_reason": "stop",
                "message": {"role": "assistant", "content": content},
            }
        ],
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "prompt_tokens_details": {
                "cached_tokens": cached_tokens,
                "cache_write_tokens": cache_write_tokens,
            },
            "completion_tokens_details": {"reasoning_tokens": reasoning_tokens},
            "cost": cost,
        },
    }


def _legacy_attempt(
    *,
    request_hash: RequestHash,
    stage: str,
    stage_attempt: int,
    request_at: str,
    response_at: str,
    latency: str,
    result: dict[str, object] | None,
    failure: dict[str, object] | None,
) -> dict[str, object]:
    return {
        "attempt_id": str(attempt_id(request_hash=request_hash, stage_attempt=stage_attempt)),
        "vote_id": _VOTE_ID,
        "request_stage": stage,
        "stage_attempt": stage_attempt,
        "request_hash": str(request_hash),
        "family_id": _MODEL,
        "provider_slug": _PROVIDER_SLUG,
        "model_requested": _MODEL,
        "result": result,
        "failure": failure,
        "ts_request": request_at,
        "ts_response": response_at,
        "latency": latency,
    }


def _legacy_run(tmp_path: Path, *, mode: str = "pilot") -> _LegacyRun:
    source = tmp_path / "legacy"
    source.mkdir()
    (source / ".run.lock").touch()
    (source / "inflight").mkdir()
    config = tmp_path / f"{mode}.yaml"
    _write_config(config, mode=mode)

    initial = _provider_result(
        result_id="initial-result",
        content=_INITIAL_CONTENT,
        prompt_tokens=10,
        completion_tokens=2,
        cached_tokens=1,
        cache_write_tokens=0,
        reasoning_tokens=1,
        cost=0.1,
    )
    repaired = _provider_result(
        result_id="repair-result",
        content=_REPAIRED_CONTENT,
        prompt_tokens=20,
        completion_tokens=3,
        cached_tokens=2,
        cache_write_tokens=1,
        reasoning_tokens=2,
        cost=0.2,
    )
    failed = _legacy_attempt(
        request_hash=_INITIAL_REQUEST_HASH,
        stage="initial",
        stage_attempt=0,
        request_at="2026-07-14T08:00:00Z",
        response_at="2026-07-14T08:00:00.200000Z",
        latency="PT0.2S",
        result=None,
        failure={
            "category": "provider",
            "exception_type": "openrouter.errors.RateLimitError",
            "message": "rate limited",
            "http_status_code": 429,
            "provider_status_code": 429,
            "retry_after": "PT1S",
            "response_body": '{"error":{"code":429}}',
        },
    )
    accepted_initial = _legacy_attempt(
        request_hash=_INITIAL_REQUEST_HASH,
        stage="initial",
        stage_attempt=1,
        request_at="2026-07-14T08:00:01Z",
        response_at="2026-07-14T08:00:02Z",
        latency="PT1S",
        result=initial,
        failure=None,
    )
    accepted_repair = _legacy_attempt(
        request_hash=_REPAIR_REQUEST_HASH,
        stage="repair",
        stage_attempt=0,
        request_at="2026-07-14T08:00:03Z",
        response_at="2026-07-14T08:00:05Z",
        latency="PT2S",
        result=repaired,
        failure=None,
    )
    attempts = (failed, accepted_initial, accepted_repair)
    vote: dict[str, object] = {
        "vote_id": _VOTE_ID,
        "relation_id": "test:P1",
        "card_hash": _CARD_HASH,
        "family_id": _MODEL,
        "provider": _PROVIDER_NAME,
        "model_returned": _MODEL,
        "shell_id": "S1",
        "framing_id": "F1",
        "bundle_id": "S1xF1",
        "rubric_version": "rubric-v1",
        "prompt_pack_hash": _PROMPT_PACK_HASH,
        "verdict": "coincident",
        "reason": "same referent",
        "raw_completion": _REPAIRED_CONTENT,
        "parse_retries": 1,
        "abstained": False,
        "initial_raw_completion": _INITIAL_CONTENT,
        "attempt_results": [initial, repaired],
        "effort": "minimal",
        "temperature": 0.0,
        "seed": 7,
        "repeat_index": 0,
        "tokens_in": 30,
        "tokens_out": 5,
        "tokens_cached": 3,
        "tokens_cache_write": 1,
        "tokens_reasoning": 3,
        "known_cost_usd": 0.1 + 0.2,
        "cost_complete": False,
        "cost_usd": None,
        "ts_request": "2026-07-14T08:00:00Z",
        "ts_response": "2026-07-14T08:00:05Z",
        "latency": "PT3.2S",
    }
    _write_jsonl(source / "attempts.jsonl", attempts)
    _write_jsonl(source / "votes.jsonl", (vote,))

    marker_id = str(attempt_id(request_hash=_MARKER_REQUEST_HASH, stage_attempt=0))
    marker = {
        "attempt_id": marker_id,
        "vote_id": _MARKER_VOTE_ID,
        "request_hash": str(_MARKER_REQUEST_HASH),
        "request_stage": "initial",
        "stage_attempt": 0,
        "created_at": "2026-07-14T09:00:00Z",
    }
    (source / "inflight" / f"{marker_id}.json").write_text(
        json.dumps(marker, separators=(",", ":")),
        encoding="utf-8",
    )

    for stale_name in ("run-state.json", "manifest.json", "slice.jsonl"):
        (source / stale_name).write_text('{"legacy":true}\n', encoding="utf-8")
    return _LegacyRun(
        source=source,
        config=config,
        attempts=attempts,
        vote=vote,
        accepted_attempt_ids=(
            str(accepted_initial["attempt_id"]),
            str(accepted_repair["attempt_id"]),
        ),
        marker_id=marker_id,
    )


def test_migration_links_exact_attempts_and_publishes_incomplete_output(
    tmp_path: Path,
) -> None:
    legacy = _legacy_run(tmp_path)
    destination = tmp_path / "migrated"

    result = migrate_directory(
        source=legacy.source,
        destination=destination,
        config_path=legacy.config,
        mode="pilot",
    )

    attempts = load_jsonl(destination / "attempts.jsonl", PhysicalAttempt)
    vote = load_jsonl(destination / "votes.jsonl", Vote)[0]
    marker = load_json(
        destination / "inflight" / f"{legacy.marker_id}.json",
        InFlightRequest,
    )
    assert isinstance(attempts[0].outcome, FailedAttempt)
    assert isinstance(attempts[0].failure, ProviderFailure)
    assert isinstance(attempts[1].outcome, AcceptedAttempt)
    assert tuple(map(str, vote.accepted_attempt_ids)) == legacy.accepted_attempt_ids
    assert vote.accounting.cost_complete is False
    assert vote.timing.request_at.isoformat() == "2026-07-14T08:00:00+00:00"
    assert marker.attempt_id == legacy.marker_id

    serialized_vote = json.loads((destination / "votes.jsonl").read_text(encoding="utf-8"))
    assert "ts_request" not in serialized_vote
    assert serialized_vote["timing"]["request_at"] == "2026-07-14T08:00:00Z"
    assert not {
        "run-state.json",
        "manifest.json",
        "slice.jsonl",
    } & {path.name for path in destination.iterdir()}

    report = load_json(destination / "migration-pending.json", MigrationResult)
    assert report.ready_for_resume is False
    assert report.network_calls == 0
    assert {artifact.path for artifact in report.omitted_artifacts} == {
        "manifest.json",
        "run-state.json",
        "slice.jsonl",
    }
    assert {artifact.path: artifact.migrated_hash for artifact in result.artifacts} == {
        artifact.path: sha256_file(destination / artifact.path) for artifact in result.artifacts
    }


def test_provider_result_mismatch_leaves_no_publishable_directory(tmp_path: Path) -> None:
    legacy = _legacy_run(tmp_path)
    results = legacy.vote["attempt_results"]
    assert isinstance(results, list)
    legacy.vote["attempt_results"] = list(reversed(results))
    _write_jsonl(legacy.source / "votes.jsonl", (legacy.vote,))
    source_hash = sha256_file(legacy.source / "attempts.jsonl")
    destination = tmp_path / "migrated"

    with pytest.raises(ValueError, match="provider results do not match"):
        migrate_directory(
            source=legacy.source,
            destination=destination,
            config_path=legacy.config,
            mode="pilot",
        )

    assert not destination.exists()
    assert sha256_file(legacy.source / "attempts.jsonl") == source_hash
    assert not tuple(tmp_path.glob(".migrated.migration-*"))


def test_strict_legacy_rows_reject_numeric_string_coercion(tmp_path: Path) -> None:
    legacy = _legacy_run(tmp_path)
    legacy.attempts[0]["stage_attempt"] = "0"
    _write_jsonl(legacy.source / "attempts.jsonl", legacy.attempts)
    destination = tmp_path / "migrated"

    with pytest.raises(ValueError, match="invalid legacy row"):
        migrate_directory(
            source=legacy.source,
            destination=destination,
            config_path=legacy.config,
            mode="pilot",
        )

    assert not destination.exists()


def test_grid_rejects_attempt_identity_reused_across_journals(tmp_path: Path) -> None:
    legacy = _legacy_run(tmp_path, mode="grid")
    for source_name, destination_name in (
        ("attempts.jsonl", "imported-attempts.jsonl"),
        ("votes.jsonl", "imported-votes.jsonl"),
    ):
        (legacy.source / destination_name).write_bytes((legacy.source / source_name).read_bytes())
    destination = tmp_path / "migrated"

    with pytest.raises(ValueError, match="duplicate physical attempt"):
        migrate_directory(
            source=legacy.source,
            destination=destination,
            config_path=legacy.config,
            mode="grid",
        )

    assert not destination.exists()
    assert not tuple(tmp_path.glob(".migrated.migration-*"))


def test_cli_requires_explicit_journals_only_acknowledgement(tmp_path: Path) -> None:
    legacy = _legacy_run(tmp_path)
    destination = tmp_path / "migrated"

    with pytest.raises(SystemExit, match="2"):
        main(
            (
                "--source",
                str(legacy.source),
                "--destination",
                str(destination),
                "--config",
                str(legacy.config),
                "--mode",
                "pilot",
            )
        )

    assert not destination.exists()
