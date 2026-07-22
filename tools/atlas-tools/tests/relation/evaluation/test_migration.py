import json
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
import yaml
from pydantic import JsonValue, TypeAdapter

import atlas_tools.relation.evaluation.execution.vote as vote_execution
from atlas_tools.common import sha256_file
from atlas_tools.relation.evaluation.application.preparation import (
    PreparedPilot,
    prepare_pilot_inputs,
)
from atlas_tools.relation.evaluation.application.prompt import RubricVotePrompt
from atlas_tools.relation.evaluation.domain.api import (
    AcceptedAttempt,
    AttemptRoute,
    AttemptTiming,
    CompletionRequestPolicyId,
    FailedAttempt,
    GridJudge,
    GridRunConfig,
    GridRunState,
    HandoffManifest,
    HistoricalCompletionRequestPolicyId,
    InFlightRequest,
    JudgeConfig,
    ModelId,
    PaidRequestIdentity,
    PanelConfig,
    PhysicalAttempt,
    PilotRunConfig,
    PilotRunState,
    ProviderFailure,
    ProviderName,
    ProviderResult,
    ProviderSlug,
    RequestHash,
    SliceSamplingConfig,
    Vote,
    VoteTask,
    attempt_id,
)
from atlas_tools.relation.evaluation.storage.api import load_json, load_jsonl
from atlas_tools.relation.evaluation.transport.api import (
    ACTIVE_COMPLETION_REQUEST_POLICY_ID,
    AUTOMATIC_ANTHROPIC_COMPLETION_REQUEST_POLICY_ID,
    LEGACY_COMPLETION_REQUEST_POLICY_ID,
    request_hash,
)
from scripts.migrate_evaluation_artifacts import (
    AdoptionResult,
    MigrationResult,
    adopt_directory,
    main,
    migrate_directory,
)
from tests.relation.evaluation.grid_fixtures import write_grid_concat

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
_JSON_OBJECT_ADAPTER = TypeAdapter(dict[str, JsonValue])


@dataclass(frozen=True, slots=True)
class _LegacyRun:
    source: Path
    config: Path
    attempts: tuple[dict[str, object], ...]
    vote: dict[str, object]
    accepted_attempt_ids: tuple[str, str]
    marker_id: str


@dataclass(frozen=True, slots=True)
class _AdoptionFixture:
    cards: Path
    config: Path
    prepared: PreparedPilot
    source: Path
    attempts: tuple[dict[str, object], ...]
    votes: tuple[dict[str, object], ...]


def _write_jsonl(path: Path, rows: Sequence[object]) -> None:
    path.write_text(
        "".join(f"{json.dumps(row, separators=(',', ':'))}\n" for row in rows),
        encoding="utf-8",
    )


def _write_current_config(path: Path, config: PilotRunConfig | GridRunConfig) -> Path:
    path.write_text(
        yaml.safe_dump(config.model_dump(mode="json"), sort_keys=False),
        encoding="utf-8",
    )
    return path


def _adoption_judge() -> JudgeConfig:
    return JudgeConfig(
        provider_slug=ProviderSlug(_PROVIDER_SLUG),
        provider_name=ProviderName(_PROVIDER_NAME),
        model=ModelId(_MODEL),
        temperature=0.0,
        seed=7,
    )


def _legacy_current_pair(
    task: VoteTask,
    *,
    prompt: RubricVotePrompt,
    config: PilotRunConfig,
    index: int,
    policy_id: CompletionRequestPolicyId,
) -> tuple[dict[str, object], dict[str, object]]:
    content = '{"reason":"fixture evidence","verdict":"overlay"}'
    native_result: dict[str, object] = {
        "id": f"fixture-result-{index}",
        "model": task.judge.model,
        "openrouter_metadata": {
            "attempt": 1,
            "endpoints": {
                "available": [
                    {
                        "model": task.judge.model,
                        "provider": task.judge.provider_name,
                        "selected": True,
                    }
                ],
                "total": 1,
            },
            "requested": task.judge.model,
            "strategy": "direct",
        },
        "choices": [
            {
                "index": 0,
                "finish_reason": "stop",
                "message": {"role": "assistant", "content": content},
            }
        ],
        "usage": {
            "prompt_tokens": 10,
            "completion_tokens": 2,
            "prompt_tokens_details": {
                "cached_tokens": 0,
                "cache_write_tokens": 0,
            },
            "completion_tokens_details": {"reasoning_tokens": 0},
            "cost": 0.01,
        },
    }
    result = ProviderResult.model_validate(native_result, strict=True)
    messages = prompt.initial(task)
    completion_request = vote_execution._completion_request(
        task,
        stage="initial",
        messages=messages,
        config=config,
    )
    physical_request_hash = request_hash(
        completion_request,
        vote_id=task.vote_id,
        stage="initial",
        policy_id=policy_id,
    )
    request_at = datetime(2026, 1, 1, tzinfo=UTC) + timedelta(milliseconds=index * 2)
    response_at = request_at + timedelta(milliseconds=1)
    physical_attempt = PhysicalAttempt(
        identity=PaidRequestIdentity(
            attempt_id=attempt_id(
                request_hash=physical_request_hash,
                stage_attempt=0,
            ),
            vote_id=task.vote_id,
            request_hash=physical_request_hash,
            stage="initial",
            stage_attempt=0,
        ),
        route=AttemptRoute(
            family_id=task.judge.family_id,
            provider_slug=task.judge.provider_slug,
            model_requested=task.judge.model,
        ),
        outcome=AcceptedAttempt(result=result),
        timing=AttemptTiming(
            request_at=request_at,
            response_at=response_at,
            latency=timedelta(milliseconds=1),
        ),
    )
    vote = vote_execution._build_vote(
        task=task,
        attempts=(physical_attempt,),
        initial_raw=content,
        final_raw=content,
        parsed=prompt.parse(content),
        repaired=False,
    )
    attempt_timing = physical_attempt.timing.model_dump(mode="json")
    vote_timing = vote.timing.model_dump(mode="json")
    legacy_attempt: dict[str, object] = {
        "attempt_id": physical_attempt.attempt_id,
        "vote_id": physical_attempt.vote_id,
        "request_stage": physical_attempt.request_stage,
        "stage_attempt": physical_attempt.stage_attempt,
        "request_hash": physical_attempt.request_hash,
        "family_id": physical_attempt.family_id,
        "provider_slug": physical_attempt.provider_slug,
        "model_requested": physical_attempt.model_requested,
        "result": native_result,
        "failure": None,
        "ts_request": attempt_timing["request_at"],
        "ts_response": attempt_timing["response_at"],
        "latency": attempt_timing["latency"],
    }
    legacy_vote: dict[str, object] = {
        "vote_id": vote.vote_id,
        "relation_id": vote.relation_id,
        "card_hash": vote.card_hash,
        "family_id": vote.family_id,
        "provider": vote.provider,
        "model_returned": vote.model_returned,
        "shell_id": vote.shell_id,
        "framing_id": vote.framing_id,
        "bundle_id": vote.bundle_id,
        "rubric_version": vote.rubric_version,
        "prompt_pack_hash": vote.prompt_pack_hash,
        "verdict": vote.verdict,
        "reason": vote.reason,
        "raw_completion": vote.raw_completion,
        "parse_retries": vote.parse_retries,
        "abstained": vote.abstained,
        "initial_raw_completion": vote.initial_raw_completion,
        "attempt_results": [native_result],
        "effort": vote.effort,
        "temperature": vote.temperature,
        "seed": vote.seed,
        "repeat_index": vote.repeat_index,
        "tokens_in": vote.tokens_in,
        "tokens_out": vote.tokens_out,
        "tokens_cached": vote.tokens_cached,
        "tokens_cache_write": vote.tokens_cache_write,
        "tokens_reasoning": vote.tokens_reasoning,
        "known_cost_usd": vote.known_cost_usd,
        "cost_complete": vote.cost_complete,
        "cost_usd": vote.cost_usd,
        "ts_request": vote_timing["request_at"],
        "ts_response": vote_timing["response_at"],
        "latency": vote_timing["latency"],
    }
    return legacy_attempt, legacy_vote


def _write_adoption_source(
    directory: Path,
    *,
    attempts: Sequence[object],
    votes: Sequence[object],
) -> Path:
    directory.mkdir()
    (directory / ".run.lock").touch()
    (directory / "inflight").mkdir()
    _write_jsonl(directory / "attempts.jsonl", attempts)
    _write_jsonl(directory / "votes.jsonl", votes)
    return directory


def _adoption_fixture(
    tmp_path: Path,
    *,
    complete: bool,
    policy_id: CompletionRequestPolicyId = ACTIVE_COMPLETION_REQUEST_POLICY_ID,
) -> _AdoptionFixture:
    cards = write_grid_concat(tmp_path / "cards")
    config = _write_current_config(
        tmp_path / "pilot-adoption.yaml",
        PilotRunConfig(
            sampling=SliceSamplingConfig(seed=19, non_holdout_count=1),
            repeat_count=1,
            judges=(_adoption_judge(),),
        ),
    )
    prepared = prepare_pilot_inputs(config, cards)
    prompt = RubricVotePrompt(
        pack=prepared.prompt_pack,
        cards=prepared.deck.by_relation_id,
    )
    tasks = tuple(prepared.plan.tasks())
    selected = tasks if complete else tasks[:1]
    pairs = tuple(
        _legacy_current_pair(
            task,
            prompt=prompt,
            config=prepared.config,
            index=index,
            policy_id=policy_id,
        )
        for index, task in enumerate(selected)
    )
    attempts = tuple(pair[0] for pair in pairs)
    votes = tuple(pair[1] for pair in pairs)
    source = _write_adoption_source(
        tmp_path / "legacy-adoption",
        attempts=attempts,
        votes=votes,
    )
    return _AdoptionFixture(
        cards=cards,
        config=config,
        prepared=prepared,
        source=source,
        attempts=attempts,
        votes=votes,
    )


def _grid_config(pilot: PilotRunConfig) -> GridRunConfig:
    pilot_judge = pilot.judges[0]
    grid_judge = GridJudge.model_validate(
        pilot_judge.as_request_spec().model_dump(mode="python")
        | {
            "effort": pilot.baseline_effort,
            "pilot_cost_per_vote_usd": 0.01,
        },
        strict=True,
    )
    return GridRunConfig(
        baseline_effort=pilot.baseline_effort,
        request_timeout=pilot.request_timeout,
        transient_retries=pilot.transient_retries,
        panel=PanelConfig(
            version=1,
            frozen=True,
            pruning_floor="fixture pilot qualification",
        ),
        judges=(grid_judge,),
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


def test_cli_requires_cards_or_explicit_journals_only(tmp_path: Path) -> None:
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


def test_full_pilot_adoption_proves_plan_and_publishes_handoff(tmp_path: Path) -> None:
    fixture = _adoption_fixture(tmp_path, complete=True)
    destination = tmp_path / "adopted-pilot"
    source_attempts_hash = sha256_file(fixture.source / "attempts.jsonl")

    result = adopt_directory(
        source=fixture.source,
        destination=destination,
        config_path=fixture.config,
        cards_directory=fixture.cards,
        mode="pilot",
    )

    state = load_json(destination / "run-state.json", PilotRunState)
    manifest = load_json(destination / "manifest.json", HandoffManifest)
    report = load_json(destination / "adoption-report.json", AdoptionResult)
    assert result.manifest_complete is True
    assert result.next_plan_index == fixture.prepared.plan.expected_votes
    assert result.expected_votes == len(fixture.votes)
    assert result.reconstructable_uncommitted == 0
    assert result.reconstructable_uncommitted_vote_ids == ()
    assert result.next_provider_request is None
    assert result.next_unattempted_task is None
    assert state.expected_votes == result.expected_votes
    assert state.historical_request_evidence is None
    assert result.request_policies[0].policy_ids == (ACTIVE_COMPLETION_REQUEST_POLICY_ID,)
    assert manifest.source_hashes["attempts.jsonl"] == sha256_file(destination / "attempts.jsonl")
    assert manifest.source_hashes["votes.jsonl"] == sha256_file(destination / "votes.jsonl")
    assert report.ready_for_resume is True
    assert report.network_calls == 0
    assert {artifact.path: artifact.content_hash for artifact in report.artifact_hashes} == {
        artifact.path: sha256_file(destination / artifact.path)
        for artifact in report.artifact_hashes
    }
    assert sha256_file(fixture.source / "attempts.jsonl") == source_attempts_hash


def test_full_adoption_rejects_unpinned_request_contract_atomically(tmp_path: Path) -> None:
    fixture = _adoption_fixture(tmp_path, complete=False)
    replacement_hash = RequestHash("f" * 64)
    fixture.attempts[0]["request_hash"] = replacement_hash
    fixture.attempts[0]["attempt_id"] = attempt_id(
        request_hash=replacement_hash,
        stage_attempt=0,
    )
    _write_jsonl(fixture.source / "attempts.jsonl", fixture.attempts)
    source_hash = sha256_file(fixture.source / "attempts.jsonl")
    destination = tmp_path / "adopted-pilot"

    with pytest.raises(ValueError, match="matches 0 request policies"):
        adopt_directory(
            source=fixture.source,
            destination=destination,
            config_path=fixture.config,
            cards_directory=fixture.cards,
            mode="pilot",
        )

    assert not destination.exists()
    assert sha256_file(fixture.source / "attempts.jsonl") == source_hash
    assert not tuple(tmp_path.glob(".adopted-pilot.adoption-*"))


@pytest.mark.parametrize(
    "policy_id",
    [
        LEGACY_COMPLETION_REQUEST_POLICY_ID,
        AUTOMATIC_ANTHROPIC_COMPLETION_REQUEST_POLICY_ID,
    ],
)
def test_adoption_infers_and_pins_historical_request_policy(
    tmp_path: Path,
    policy_id: HistoricalCompletionRequestPolicyId,
) -> None:
    fixture = _adoption_fixture(tmp_path, complete=False, policy_id=policy_id)
    destination = tmp_path / "adopted-pilot"

    result = adopt_directory(
        source=fixture.source,
        destination=destination,
        config_path=fixture.config,
        cards_directory=fixture.cards,
        mode="pilot",
    )

    state = load_json(destination / "run-state.json", PilotRunState)
    evidence = state.historical_request_evidence
    assert evidence is not None
    assert evidence.request_policy_ids == (policy_id,)
    assert evidence.attempt_count == 1
    assert evidence.attempts_prefix_hash == sha256_file(destination / "attempts.jsonl")
    assert result.historical_request_evidence == evidence
    assert result.request_policies[0].path == "attempts.jsonl"
    assert result.request_policies[0].policy_ids == (policy_id,)
    assert result.next_plan_index == 1


def test_adoption_reports_reconstructable_vote_and_next_provider_request(tmp_path: Path) -> None:
    fixture = _adoption_fixture(tmp_path, complete=False)
    _write_jsonl(fixture.source / "votes.jsonl", ())
    destination = tmp_path / "adopted-pilot"

    result = adopt_directory(
        source=fixture.source,
        destination=destination,
        config_path=fixture.config,
        cards_directory=fixture.cards,
        mode="pilot",
    )

    first_vote_id = next(fixture.prepared.plan.tasks()).vote_id
    assert result.next_plan_index == 0
    assert result.reconstructable_uncommitted == 1
    assert result.reconstructable_uncommitted_vote_ids == (first_vote_id,)
    assert result.next_provider_request is not None
    assert result.next_provider_request.plan_index == 1
    assert result.next_provider_request.request_stage == "initial"
    assert result.next_provider_request.prior_stage_attempts == 0
    assert result.next_unattempted_task is not None
    assert result.next_unattempted_task.plan_index == 1
    assert result.next_unattempted_task.vote_id != first_vote_id
    assert result.manifest_complete is False


def test_adoption_distinguishes_accepted_initial_from_reconstructable_vote(
    tmp_path: Path,
) -> None:
    fixture = _adoption_fixture(tmp_path, complete=False)
    _write_jsonl(fixture.source / "votes.jsonl", ())
    native_result = _JSON_OBJECT_ADAPTER.validate_python(fixture.attempts[0]["result"])
    choices = native_result["choices"]
    assert isinstance(choices, list)
    choice = choices[0]
    assert isinstance(choice, dict)
    message = choice["message"]
    assert isinstance(message, dict)
    message["content"] = "not a rubric response"
    fixture.attempts[0]["result"] = native_result
    _write_jsonl(fixture.source / "attempts.jsonl", fixture.attempts)

    result = adopt_directory(
        source=fixture.source,
        destination=tmp_path / "adopted-pilot",
        config_path=fixture.config,
        cards_directory=fixture.cards,
        mode="pilot",
    )

    assert result.reconstructable_uncommitted == 0
    assert result.reconstructable_uncommitted_vote_ids == ()
    assert result.next_provider_request is not None
    assert result.next_provider_request.plan_index == 0
    assert result.next_provider_request.request_stage == "repair"
    assert result.next_provider_request.prior_stage_attempts == 0


def test_grid_adoption_rebuilds_imports_from_adopted_pilot(tmp_path: Path) -> None:
    fixture = _adoption_fixture(
        tmp_path,
        complete=True,
        policy_id=LEGACY_COMPLETION_REQUEST_POLICY_ID,
    )
    pilot_directory = tmp_path / "adopted-pilot"
    pilot_result = adopt_directory(
        source=fixture.source,
        destination=pilot_directory,
        config_path=fixture.config,
        cards_directory=fixture.cards,
        mode="pilot",
    )
    assert pilot_result.manifest_complete is True

    imported_votes = tuple(
        row
        for row in fixture.votes
        if row["bundle_id"] == "S1xF1" and row["effort"] == "minimal" and row["repeat_index"] == 0
    )
    imported_vote_ids = {row["vote_id"] for row in imported_votes}
    imported_attempts = tuple(
        row for row in fixture.attempts if row["vote_id"] in imported_vote_ids
    )
    grid_source = _write_adoption_source(
        tmp_path / "legacy-grid",
        attempts=(),
        votes=(),
    )
    _write_jsonl(grid_source / "imported-attempts.jsonl", imported_attempts)
    _write_jsonl(grid_source / "imported-votes.jsonl", imported_votes)
    grid_config = _write_current_config(
        tmp_path / "grid-adoption.yaml",
        _grid_config(fixture.prepared.config),
    )
    destination = tmp_path / "adopted-grid"

    result = adopt_directory(
        source=grid_source,
        destination=destination,
        config_path=grid_config,
        cards_directory=fixture.cards,
        mode="grid",
        pilot_directory=pilot_directory,
    )

    state = load_json(destination / "run-state.json", GridRunState)
    adopted_imports = load_jsonl(destination / "imported-votes.jsonl", Vote)
    assert result.next_plan_index == 0
    assert result.expected_votes > 0
    assert result.reconstructable_uncommitted == 0
    assert result.reconstructable_uncommitted_vote_ids == ()
    assert result.next_provider_request is not None
    assert result.next_provider_request.plan_index == 0
    assert result.next_provider_request.request_stage == "initial"
    assert result.next_unattempted_task is not None
    assert result.next_unattempted_task.plan_index == 0
    assert tuple(journal.path for journal in result.request_policies) == (
        "imported-attempts.jsonl",
        "attempts.jsonl",
    )
    assert result.request_policies[0].policy_ids == (LEGACY_COMPLETION_REQUEST_POLICY_ID,)
    assert result.request_policies[1].policy_ids == ()
    assert result.manifest_complete is False
    assert not (destination / "manifest.json").exists()
    assert state.historical_request_evidence is None
    subset = state.pilot_historical_request_subset
    assert subset is not None
    assert subset.source_evidence.attempt_count == len(fixture.attempts)
    assert len(subset.attempt_ids) == len(imported_attempts)
    assert result.pilot_historical_request_subset == state.pilot_historical_request_subset
    assert {vote.vote_id for vote in adopted_imports} == imported_vote_ids
    assert state.source_hashes["pilot-manifest.json"] == sha256_file(
        pilot_directory / "manifest.json"
    )
    assert {artifact.path for artifact in result.input_hashes} >= {
        "pilot/manifest.json",
        "pilot/votes.jsonl",
        "pilot/attempts.jsonl",
    }
    assert result.network_calls == 0
