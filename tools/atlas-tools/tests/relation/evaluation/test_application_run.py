import subprocess
import sys
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
import trio
import yaml
from pydantic import SecretStr

import atlas_tools.relation.evaluation.application.run as run_module
from atlas_tools.common import canonical_json_bytes, sha256_bytes
from atlas_tools.relation.evaluation.application.aggregate import aggregate_soft_labels
from atlas_tools.relation.evaluation.application.completed import load_completed_grid
from atlas_tools.relation.evaluation.application.identity import judge_pin
from atlas_tools.relation.evaluation.application.run import run_evaluation
from atlas_tools.relation.evaluation.domain.api import (
    BUNDLES,
    ConcurrencyConfig,
    ExpectedGrid,
    ExpectedRepeatArm,
    GridManifest,
    HandoffManifest,
    JudgeConfig,
    ModelId,
    PhysicalAttempt,
    PilotRunConfig,
    ProviderName,
    ProviderResult,
    ProviderSlug,
    RunDates,
    SliceDerivation,
    SliceSamplingConfig,
    Vote,
)
from atlas_tools.relation.evaluation.modes.api import (
    HOLDOUTS,
    RETRY_INSTRUCTION,
    PromptCard,
    PromptPack,
)
from atlas_tools.relation.evaluation.storage.api import (
    GridPaths,
    PilotPaths,
    load_config,
    load_deck,
    load_jsonl,
)
from atlas_tools.relation.evaluation.transport.api import (
    CompletionAccepted,
    CompletionRequest,
)
from tests.relation.evaluation.grid_fixtures import (
    EXPECTED_REFINED_CARDS,
    EXPECTED_TOTAL_VOTES,
    MALFORMED,
    POOL_CARDS,
    grid_config,
    scripted_answer,
    write_grid_concat,
    write_grid_config,
)


def _prompt_pack(cards_directory: Path) -> PromptPack:
    deck = load_deck(cards_directory)
    return PromptPack.from_cards(
        PromptCard(relation_id=card.relation_id, card_text=card.card_text) for card in deck.cards
    )


def _write_empty_pilot(
    directory: Path,
    *,
    config_path: Path,
    cards_directory: Path,
) -> Path:
    directory.mkdir()
    empty_hash = sha256_bytes(b"")
    (directory / "votes.jsonl").write_bytes(b"")
    (directory / "attempts.jsonl").write_bytes(b"")
    config = load_config(config_path).grid()
    pilot_judges = tuple(
        JudgeConfig(
            provider_slug=grid_judge.provider_slug,
            provider_name=grid_judge.provider_name,
            openrouter_region=grid_judge.openrouter_region,
            model=grid_judge.model,
            temperature=grid_judge.temperature,
            seed=grid_judge.seed,
            output_token_limit=grid_judge.output_token_limit,
        )
        for grid_judge in config.judges
    )
    pilot_config = PilotRunConfig(
        sampling=SliceSamplingConfig(seed=1, non_holdout_count=1),
        repeat_count=1,
        baseline_effort=config.baseline_effort,
        request_timeout=config.request_timeout,
        transient_retries=config.transient_retries,
        judges=pilot_judges,
    )
    anchor = next(iter(sorted(POOL_CARDS)))
    relation_id = f"wikidata:{anchor}"
    instant = datetime(2026, 1, 1, tzinfo=UTC)
    manifest = HandoffManifest(
        schema_version=3,
        expected_grid=ExpectedGrid(
            families=tuple(judge.family_id for judge in pilot_judges),
            bundles=BUNDLES,
            relation_ids=(relation_id,),
            effort="minimal",
        ),
        expected_repeat_arm=ExpectedRepeatArm(
            families=tuple(judge.family_id for judge in pilot_judges),
            relation_ids=(relation_id,),
            effort="minimal",
            repeat_indices=(1,),
        ),
        expected_effort_arm=None,
        slice_derivation=SliceDerivation(
            algorithm="stratified-hash-v1",
            sampling_seed=1,
            requested_non_holdouts=1,
            eligible_non_holdouts=1,
            selected_non_holdouts=1,
            cards_hash="0" * 64,
            sampling_config_hash="1" * 64,
            selection_hash="2" * 64,
        ),
        run_dates=RunDates(started_at=instant, completed_at=instant),
        judges=tuple(judge_pin(judge) for judge in pilot_judges),
        prompt_pack_hash=_prompt_pack(cards_directory).content_hash,
        rubric_version="rubric-v1",
        full_grid_card_count=1,
        source_hashes={
            "attempts.jsonl": empty_hash,
            "votes.jsonl": empty_hash,
        },
        openrouter_sdk_version="fixture",
        openrouter_openapi_version="fixture",
        executor_config=pilot_config.model_dump(
            mode="json",
            exclude=set(pilot_config.OPERATIONAL_FIELDS),
        ),
    )
    (directory / "manifest.json").write_bytes(canonical_json_bytes(manifest) + b"\n")
    return directory


def _live_local_id(request: CompletionRequest) -> str:
    message = request.messages[-1]
    content = message.content
    if content == RETRY_INSTRUCTION:
        content = request.messages[-3].content
    for local_id in POOL_CARDS:
        if content.endswith(f"relation card for wikidata:{local_id}"):
            return local_id
    raise AssertionError(f"cannot attribute live prompt {content[-120:]!r}")


def _provider_result(*, model: str, content: str) -> ProviderResult:
    provider_name = f"Provider {model.removeprefix('test/')}"
    return ProviderResult.model_validate(
        {
            "id": "fixture-completion",
            "model": model,
            "openrouter_metadata": {
                "attempt": 1,
                "attempts": [{"model": model, "provider": provider_name, "status": 200}],
                "endpoints": {
                    "available": [
                        {
                            "model": model,
                            "provider": provider_name,
                            "selected": True,
                        }
                    ],
                    "total": 1,
                },
                "requested": model,
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
                "prompt_tokens": 100,
                "completion_tokens": 5,
                "total_tokens": 105,
                "cost": 0.01,
                "prompt_tokens_details": {
                    "cached_tokens": 80,
                    "cache_write_tokens": 3,
                },
                "completion_tokens_details": {"reasoning_tokens": 2},
            },
        },
        strict=True,
    )


@dataclass(slots=True)
class AsyncMappingTransport:
    calls: int = 0
    requests: list[CompletionRequest] = field(default_factory=list)

    async def complete(self, request: CompletionRequest) -> CompletionAccepted:
        self.calls += 1
        self.requests.append(request)
        answer = scripted_answer(request.judge.model, _live_local_id(request))
        content = (
            "not JSON" if answer == MALFORMED else f'{{"reason":"scripted","verdict":"{answer}"}}'
        )
        result = _provider_result(model=request.judge.model, content=content)
        return CompletionAccepted(
            result=result,
            content=content,
            provider_name=request.judge.provider_name,
        )

    async def aclose(self) -> None:
        return None


class _OwnedSettings:
    __slots__ = ("api_key",)

    def __init__(self) -> None:
        self.api_key = SecretStr("owned-secret")


class _OwnedCompletionTransport:
    instance: _OwnedCompletionTransport | None = None

    def __init__(self, api_key: str) -> None:
        self.api_key = api_key
        self.closed = False
        type(self).instance = self

    async def complete(self, request: CompletionRequest) -> CompletionAccepted:
        del request
        raise AssertionError("cleanup test must not issue a completion")

    async def aclose(self) -> None:
        await trio.lowlevel.checkpoint()
        self.closed = True


@dataclass(slots=True)
class RecordingProgress:
    phases: list[tuple[str, int | None]] = field(default_factory=list)
    committed: int = 0

    def phase(self, name: str, *, total: int | None = None) -> None:
        self.phases.append((name, total))

    def advance(self, count: int = 1) -> None:
        self.committed += count

    def note(self, message: str) -> None:
        _ = message


@dataclass(slots=True)
class ProgressAwareTransport:
    inner: AsyncMappingTransport
    progress: RecordingProgress
    committed_at_calls: list[int] = field(default_factory=list)

    async def complete(self, request: CompletionRequest) -> CompletionAccepted:
        self.committed_at_calls.append(self.progress.committed)
        return await self.inner.complete(request)

    async def aclose(self) -> None:
        return None


def _forbid_provider_access(*_args: object, **_kwargs: object) -> None:
    raise AssertionError("durable accepted results must not touch the provider adapter")


def _resume_without_provider(
    monkeypatch: pytest.MonkeyPatch,
    *,
    cards_directory: Path,
    config_path: Path,
    output_directory: Path,
    pilot_directory: Path | None = None,
) -> tuple[PilotPaths | GridPaths, RecordingProgress]:
    progress = RecordingProgress()
    with monkeypatch.context() as provider_guard:
        provider_guard.setattr(run_module, "transport_versions", _forbid_provider_access)
        provider_guard.setattr(run_module, "_transport", _forbid_provider_access)
        paths = run_evaluation(
            cards_directory=cards_directory,
            config_path=config_path,
            output_directory=output_directory,
            pilot_directory=pilot_directory,
            progress=progress,
        )
    return paths, progress


def _rehearse_partial_pilot_recovery(
    *,
    paths: PilotPaths,
    cards_directory: Path,
    config_path: Path,
    output_directory: Path,
) -> None:
    votes = load_jsonl(paths.journal.votes, Vote)
    attempts = load_jsonl(paths.journal.attempts, PhysicalAttempt)
    missing_vote = votes[1]
    retained_attempts = tuple(
        attempt for attempt in attempts if attempt.vote_id != missing_vote.vote_id
    )
    assert len(retained_attempts) == len(attempts) - 1

    paths.manifest.unlink()
    paths.journal.votes.write_bytes(b"")
    paths.journal.attempts.write_bytes(
        b"".join(canonical_json_bytes(attempt) + b"\n" for attempt in retained_attempts)
    )
    progress = RecordingProgress()
    inner = AsyncMappingTransport()
    transport = ProgressAwareTransport(inner=inner, progress=progress)

    recovered = run_evaluation(
        cards_directory=cards_directory,
        config_path=config_path,
        output_directory=output_directory,
        transport=transport,
        progress=progress,
    )

    assert recovered == paths
    assert transport.committed_at_calls == [1]
    assert inner.calls == 1
    request = inner.requests[0]
    assert request.request_stage == "initial"
    assert f"wikidata:{_live_local_id(request)}" == missing_vote.relation_id
    assert request.judge.model == missing_vote.request.judge.model
    assert progress.committed == len(votes)
    assert len(load_jsonl(paths.journal.votes, Vote)) == len(votes)
    assert len(load_jsonl(paths.journal.attempts, PhysicalAttempt)) == len(attempts)


def test_owned_completion_transport_closes_when_the_run_is_cancelled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _OwnedCompletionTransport.instance = None
    monkeypatch.setattr(run_module, "OpenRouterSettings", _OwnedSettings)
    monkeypatch.setattr(run_module, "OpenRouterTransport", _OwnedCompletionTransport)

    async def scenario() -> None:
        with trio.CancelScope() as scope:
            async with run_module._transport(None) as transport:
                assert isinstance(transport, _OwnedCompletionTransport)
                assert transport.api_key == "owned-secret"
                scope.cancel()
                await trio.sleep_forever()

        owned = _OwnedCompletionTransport.instance
        assert owned is not None
        assert owned.closed is True

    trio.run(scenario)


def test_grid_runner_executes_two_phases_and_revalidates_without_network(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cards = write_grid_concat(tmp_path / "cards")
    config = write_grid_config(tmp_path / "grid.yaml", grid_config())
    pilot = _write_empty_pilot(
        tmp_path / "pilot",
        config_path=config,
        cards_directory=cards,
    )
    output = tmp_path / "run"
    transport = AsyncMappingTransport()
    progress = RecordingProgress()

    paths = run_evaluation(
        cards_directory=cards,
        config_path=config,
        output_directory=output,
        pilot_directory=pilot,
        transport=transport,
        progress=progress,
    )

    assert transport.calls == EXPECTED_TOTAL_VOTES + 3
    assert progress.phases == [
        ("evaluating grid baseline", 55),
        ("evaluating grid refinement", 30),
        ("evaluating grid holdout canaries", len(HOLDOUTS) * 5),
    ]
    assert progress.committed == EXPECTED_TOTAL_VOTES
    assert paths.journal.votes.read_bytes().count(b"\n") == EXPECTED_TOTAL_VOTES
    manifest = GridManifest.model_validate_json(paths.manifest.read_bytes(), strict=True)
    assert manifest.total_votes == EXPECTED_TOTAL_VOTES
    assert manifest.refined_cards == EXPECTED_REFINED_CARDS
    assert sum(row.refinement_votes for row in manifest.family_counts) == 30
    assert all(row.canary_votes == len(HOLDOUTS) for row in manifest.family_counts)

    all_vote_bytes = paths.journal.votes.read_bytes()
    all_votes = load_jsonl(paths.journal.votes, Vote)
    baseline_votes = progress.phases[0][1]
    assert baseline_votes is not None
    paths.manifest.unlink()
    paths.journal.votes.write_bytes(
        b"".join(canonical_json_bytes(vote) + b"\n" for vote in all_votes[:baseline_votes])
    )
    recovered, recovery_progress = _resume_without_provider(
        monkeypatch,
        cards_directory=cards,
        config_path=config,
        output_directory=output,
        pilot_directory=pilot,
    )

    assert recovered == paths
    assert paths.journal.votes.read_bytes() == all_vote_bytes
    assert recovery_progress.phases == [
        ("evaluating grid refinement", 30),
        ("evaluating grid holdout canaries", len(HOLDOUTS) * 5),
    ]
    assert recovery_progress.committed == EXPECTED_TOTAL_VOTES - baseline_votes
    assert GridManifest.model_validate_json(paths.manifest.read_bytes(), strict=True) == manifest

    unused = AsyncMappingTransport()
    repeated_progress = RecordingProgress()
    repeated = run_evaluation(
        cards_directory=cards,
        config_path=config,
        output_directory=output,
        pilot_directory=pilot,
        transport=unused,
        progress=repeated_progress,
    )
    assert repeated == paths
    assert unused.calls == 0
    assert repeated_progress.phases == []
    assert repeated_progress.committed == 0

    completed = load_completed_grid(
        run_directory=output,
        cards_directory=cards,
        config_path=config,
    )
    assert completed.routing_violations == 0
    assert completed.plan.expected_votes == EXPECTED_TOTAL_VOTES
    assert completed.manifest == manifest

    labels = aggregate_soft_labels(
        run_directory=output,
        cards_directory=cards,
        config_path=config,
        output_path=tmp_path / "soft-labels.parquet",
    )
    assert len(labels.rows) == manifest.pool_cards
    assert dict(labels.metadata.source_hashes) == {
        name: manifest.source_hashes[name]
        for name in (
            "cards.jsonl",
            "imported-votes.jsonl",
            "judges-panel",
            "votes.jsonl",
        )
    }

    paths.journal.votes.write_bytes(paths.journal.votes.read_bytes() + b"\n")
    with pytest.raises(ValueError, match="manifest is not reproducible"):
        load_completed_grid(
            run_directory=output,
            cards_directory=cards,
            config_path=config,
        )


def test_pilot_runner_derives_the_slice_and_publishes_only_after_full_coverage(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cards = write_grid_concat(tmp_path / "cards")
    config = tmp_path / "pilot.yaml"
    pilot_config = PilotRunConfig(
        sampling=SliceSamplingConfig(seed=42, non_holdout_count=1),
        repeat_count=1,
        request_timeout=timedelta(seconds=5),
        concurrency=ConcurrencyConfig(initial=2, maximum=4),
        judges=(
            JudgeConfig(
                provider_slug=ProviderSlug("test-provider/j1"),
                provider_name=ProviderName("Provider j1"),
                model=ModelId("test/j1"),
                temperature=0.0,
                seed=17,
            ),
        ),
    )
    config.write_text(
        yaml.safe_dump(pilot_config.model_dump(mode="json"), sort_keys=True),
        encoding="utf-8",
    )
    output = tmp_path / "pilot-run"
    transport = AsyncMappingTransport()

    paths = run_evaluation(
        cards_directory=cards,
        config_path=config,
        output_directory=output,
        transport=transport,
    )

    assert isinstance(paths, PilotPaths)
    assert transport.calls == 64
    assert paths.journal.votes.read_bytes().count(b"\n") == 64
    assert paths.slice.read_bytes().count(b"\n") == 7
    manifest = HandoffManifest.model_validate_json(paths.manifest.read_bytes(), strict=True)
    assert len(manifest.expected_grid.relation_ids) == 7
    assert manifest.expected_repeat_arm.repeat_indices == (1,)

    all_vote_bytes = paths.journal.votes.read_bytes()
    paths.manifest.unlink()
    paths.journal.votes.write_bytes(b"")
    recovered, recovery_progress = _resume_without_provider(
        monkeypatch,
        cards_directory=cards,
        config_path=config,
        output_directory=output,
    )

    assert recovered == paths
    assert paths.journal.votes.read_bytes() == all_vote_bytes
    assert recovery_progress.phases == [("evaluating pilot", 64)]
    assert recovery_progress.committed == 64
    assert HandoffManifest.model_validate_json(paths.manifest.read_bytes(), strict=True) == manifest

    _rehearse_partial_pilot_recovery(
        paths=paths,
        cards_directory=cards,
        config_path=config,
        output_directory=output,
    )

    unused = AsyncMappingTransport()
    assert (
        run_evaluation(
            cards_directory=cards,
            config_path=config,
            output_directory=output,
            transport=unused,
        )
        == paths
    )
    assert unused.calls == 0

    probe = subprocess.run(
        [
            sys.executable,
            "-c",
            """
import sys
from pathlib import Path

from atlas_tools.relation.evaluation.application.run import run_evaluation

run_evaluation(
    cards_directory=Path(sys.argv[1]),
    config_path=Path(sys.argv[2]),
    output_directory=Path(sys.argv[3]),
)
forbidden = ("matplotlib", "pyarrow", "scipy", "sklearn")
loaded = sorted(root for root in forbidden if root in sys.modules)
if loaded:
    raise AssertionError(f"completed pilot imported optional stacks: {loaded}")
""",
            str(cards),
            str(config),
            str(output),
        ],
        cwd=Path(__file__).resolve().parents[3],
        check=False,
        capture_output=True,
        text=True,
    )
    assert probe.returncode == 0, probe.stderr
