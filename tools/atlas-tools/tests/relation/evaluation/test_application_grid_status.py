from datetime import UTC, datetime, timedelta
from pathlib import Path

from pydantic import BaseModel

from atlas_tools.common import canonical_json_bytes, sha256_bytes
from atlas_tools.relation.evaluation.application.grid_status import (
    GridStatusReader,
    calculate_grid_status,
    latest_rate,
)
from atlas_tools.relation.evaluation.domain.api import (
    AcceptedAttempt,
    AttemptId,
    AttemptRoute,
    AttemptTiming,
    CardHash,
    CorpusRecord,
    FailedAttempt,
    GridRunState,
    JudgeFamilyId,
    JudgeRequestSpec,
    ModelId,
    PaidRequestIdentity,
    PhysicalAttempt,
    PromptPackHash,
    ProviderName,
    ProviderResult,
    ProviderSlug,
    RequestHash,
    RequestStage,
    TransportFailure,
    Vote,
    VoteAccounting,
    VoteDecision,
    VoteEvidence,
    VoteId,
    VoteIdentity,
    VoteProvenance,
    VoteRequest,
    VoteTiming,
    VoteVerdict,
)

_NOW = datetime(2026, 7, 15, 12, tzinfo=UTC)
_FAMILY_A = JudgeFamilyId("judge/a")
_FAMILY_B = JudgeFamilyId("judge/b")
_CARD_A = "test:card-a"
_CARD_B = "test:card-b"
_PROMPT_HASH = PromptPackHash(sha256_bytes(b"status prompt"))


def _hash(label: str) -> str:
    return sha256_bytes(label.encode())


def _vote(
    relation_id: str,
    family_id: JudgeFamilyId,
    repeat_index: int,
    verdict: VoteVerdict,
    *,
    requested_at: datetime = _NOW,
) -> Vote:
    model = ModelId(family_id)
    vote_id = VoteId(_hash(f"{relation_id}|{family_id}|{repeat_index}"))
    attempt_id = AttemptId(_hash(f"attempt|{vote_id}"))
    return Vote(
        identity=VoteIdentity(vote_id=vote_id, relation_id=relation_id),
        provenance=VoteProvenance(
            card_hash=CardHash(_hash(f"card|{relation_id}")),
            rubric_version="rubric-v1",
            prompt_pack_hash=_PROMPT_HASH,
        ),
        request=VoteRequest(
            judge=JudgeRequestSpec(
                provider_name=ProviderName("Fixture Provider"),
                provider_slug=ProviderSlug(f"fixture/{family_id}"),
                model=model,
            ),
            bundle_id="S1xF1",
            effort="minimal",
            temperature=0.0,
            seed=17,
            repeat_index=repeat_index,
        ),
        decision=VoteDecision(
            verdict=verdict,
            reason="fixture evidence",
            raw_completion=f'{{"reason":"fixture evidence","verdict":"{verdict}"}}',
        ),
        evidence=VoteEvidence(
            accepted_attempt_ids=(attempt_id,),
            model_returned=model,
        ),
        accounting=VoteAccounting(
            tokens_in=10,
            tokens_out=4,
            tokens_cached=5,
            known_cost_usd=0.02,
            cost_complete=True,
        ),
        timing=VoteTiming(
            request_at=requested_at,
            response_at=requested_at + timedelta(seconds=1),
            latency=timedelta(seconds=1),
        ),
    )


def _accepted_attempt(
    vote: Vote,
    *,
    requested_at: datetime,
    cost: float = 0.02,
    content: str | None = None,
    stage: RequestStage = "initial",
) -> PhysicalAttempt:
    result = ProviderResult.model_validate(
        {
            "model": str(vote.family_id),
            "choices": [{"message": {"content": content or vote.raw_completion}}],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 4,
                "cost": cost,
            },
        }
    )
    attempt_id = (
        vote.accepted_attempt_ids[0]
        if stage == "initial"
        else AttemptId(_hash(f"accepted|{vote.vote_id}|{stage}"))
    )
    return PhysicalAttempt(
        identity=PaidRequestIdentity(
            attempt_id=attempt_id,
            vote_id=vote.vote_id,
            request_hash=RequestHash(_hash(f"request|{vote.vote_id}|{stage}")),
            stage=stage,
            stage_attempt=0,
        ),
        route=AttemptRoute(
            family_id=vote.family_id,
            provider_slug=ProviderSlug(f"fixture/{vote.family_id}"),
            model_requested=ModelId(vote.family_id),
        ),
        outcome=AcceptedAttempt(result=result),
        timing=AttemptTiming(
            request_at=requested_at,
            response_at=requested_at + timedelta(seconds=1),
            latency=timedelta(seconds=1),
        ),
    )


def _failed_attempt(
    vote: Vote,
    *,
    requested_at: datetime,
    stage_attempt: int = 1,
) -> PhysicalAttempt:
    return PhysicalAttempt(
        identity=PaidRequestIdentity(
            attempt_id=AttemptId(_hash(f"failed|{vote.vote_id}|{stage_attempt}")),
            vote_id=vote.vote_id,
            request_hash=RequestHash(_hash(f"failed-request|{vote.vote_id}")),
            stage="initial",
            stage_attempt=stage_attempt,
        ),
        route=AttemptRoute(
            family_id=vote.family_id,
            provider_slug=ProviderSlug(f"fixture/{vote.family_id}"),
            model_requested=ModelId(vote.family_id),
        ),
        outcome=FailedAttempt(
            failure=TransportFailure(
                exception_type="TimeoutError",
                message="fixture timeout",
            )
        ),
        timing=AttemptTiming(
            request_at=requested_at,
            response_at=requested_at + timedelta(seconds=1),
            latency=timedelta(seconds=1),
        ),
    )


def _state() -> GridRunState:
    return GridRunState(
        request_contract_hash=_hash("request-contract"),
        source_hashes={
            "cards.jsonl": _hash("cards"),
            "cards.manifest.json": _hash("cards-manifest"),
            "judges-panel": _hash("panel"),
            "pilot-attempts.jsonl": _hash("pilot-attempts"),
            "pilot-manifest.json": _hash("pilot-manifest"),
            "pilot-votes.jsonl": _hash("pilot-votes"),
        },
        prompt_pack_hash=_PROMPT_HASH,
        rubric_version="rubric-v1",
        panel_version=1,
        panel_frozen=True,
        pool_cards=2,
        corpus_hash=_hash("corpus"),
        imported_votes_hash=_hash("imported-votes"),
        imported_attempts_hash=_hash("imported-attempts"),
        openrouter_sdk_version="fixture-sdk",
        openrouter_openapi_version="fixture-openapi",
    )


def _corpus() -> tuple[CorpusRecord, ...]:
    return (
        CorpusRecord(
            relation_id=_CARD_A,
            card_hash=CardHash(_hash(f"card|{_CARD_A}")),
            prescreen_stratum="ordinary",
            token_count=4,
            is_holdout=True,
            holdout_verdict="proximal",
            is_shot_excluded=False,
        ),
        CorpusRecord(
            relation_id=_CARD_B,
            card_hash=CardHash(_hash(f"card|{_CARD_B}")),
            prescreen_stratum="ordinary",
            token_count=4,
            is_holdout=False,
            holdout_verdict=None,
            is_shot_excluded=False,
        ),
    )


def _imports() -> tuple[Vote, Vote]:
    return (
        _vote(_CARD_A, _FAMILY_A, 0, "proximal"),
        _vote(_CARD_A, _FAMILY_B, 0, "coincident"),
    )


def _write_json(path: Path, model: BaseModel) -> None:
    path.write_bytes(canonical_json_bytes(model) + b"\n")


def _write_jsonl(path: Path, rows: tuple[BaseModel, ...]) -> None:
    path.write_bytes(b"".join(canonical_json_bytes(row) + b"\n" for row in rows))


def _fresh_baseline() -> tuple[Vote, Vote]:
    return (
        _vote(_CARD_B, _FAMILY_A, 0, "proximal", requested_at=_NOW),
        _vote(
            _CARD_B,
            _FAMILY_B,
            0,
            "proximal",
            requested_at=_NOW + timedelta(seconds=2),
        ),
    )


def _write_run(directory: Path) -> tuple[Vote, Vote]:
    directory.mkdir()
    (directory / "inflight").mkdir()
    (directory / ".run.lock").touch()
    _write_json(directory / "run-state.json", _state())
    _write_jsonl(directory / "corpus.jsonl", _corpus())
    _write_jsonl(directory / "imported-votes.jsonl", _imports())
    _write_jsonl(directory / "imported-attempts.jsonl", ())
    (directory / "votes.jsonl").touch()
    (directory / "attempts.jsonl").touch()
    return _fresh_baseline()


def test_status_switches_from_projected_to_exact_refinement() -> None:
    fresh_a, fresh_b = _fresh_baseline()
    attempt_a = _accepted_attempt(fresh_a, requested_at=_NOW)
    projected = calculate_grid_status(
        run_name="grid",
        run_path="runs/grid",
        now=_NOW + timedelta(minutes=1),
        state=_state(),
        corpus=_corpus(),
        imported_votes=_imports(),
        imported_attempts=(),
        votes=(fresh_a,),
        attempts=(attempt_a,),
        run_active=True,
        manifest_exists=False,
        in_flight=1,
        trigger_rate=0.0,
    )

    assert projected.target_kind == "projected"
    assert projected.phase == "baseline"
    assert projected.refined_cards == 0
    assert projected.completed == 1
    assert projected.total == 4

    attempt_b = _accepted_attempt(fresh_b, requested_at=_NOW + timedelta(seconds=2))
    exact = calculate_grid_status(
        run_name="grid",
        run_path="runs/grid",
        now=_NOW + timedelta(minutes=1),
        state=_state(),
        corpus=_corpus(),
        imported_votes=_imports(),
        imported_attempts=(),
        votes=(fresh_a, fresh_b),
        attempts=(attempt_a, attempt_b),
        run_active=True,
        manifest_exists=False,
        in_flight=0,
        trigger_rate=0.0,
    )

    assert exact.target_kind == "exact"
    assert exact.phase == "refinement"
    assert exact.refined_cards == 1
    assert exact.realized_trigger_rate == 0.5
    assert exact.completed == 2
    assert exact.total == 8
    assert [family.total for family in exact.families] == [4, 4]
    assert exact.known_spend_usd == 0.04


def test_latest_rate_uses_only_the_latest_active_segment_and_unique_votes() -> None:
    old_vote = _vote(_CARD_A, _FAMILY_A, 0, "proximal")
    recent_a = _vote(_CARD_A, _FAMILY_A, 1, "proximal")
    recent_b = _vote(_CARD_A, _FAMILY_A, 2, "proximal")
    old = _accepted_attempt(old_vote, requested_at=_NOW - timedelta(hours=1))
    first = _accepted_attempt(recent_a, requested_at=_NOW)
    duplicate = first.model_copy(
        update={
            "identity": first.identity.model_copy(
                update={"attempt_id": AttemptId(_hash("duplicate-attempt")), "stage_attempt": 1}
            ),
            "timing": AttemptTiming(
                request_at=_NOW + timedelta(seconds=20),
                response_at=_NOW + timedelta(seconds=21),
                latency=timedelta(seconds=1),
            ),
        }
    )
    second = _accepted_attempt(recent_b, requested_at=_NOW + timedelta(seconds=59))

    assert latest_rate((old, first, duplicate, second)) == 2 / 60


def test_reader_tolerates_a_trailing_partial_row_and_consumes_it_once(tmp_path: Path) -> None:
    run = tmp_path / "grid"
    fresh_a, _fresh_b = _write_run(run)
    reader = GridStatusReader(run, trigger_rate=0.0, now=lambda: _NOW + timedelta(minutes=1))

    initial = reader.snapshot()
    assert initial.activity == "ready"
    assert initial.completed == 0

    vote_payload = canonical_json_bytes(fresh_a) + b"\n"
    (run / "votes.jsonl").write_bytes(vote_payload)
    attempt_payload = canonical_json_bytes(_accepted_attempt(fresh_a, requested_at=_NOW)) + b"\n"
    split = len(attempt_payload) // 2
    (run / "attempts.jsonl").write_bytes(attempt_payload[:split])

    partial = reader.snapshot()
    assert partial.completed == 1
    assert partial.physical_attempts == 0

    with (run / "attempts.jsonl").open("ab") as output:
        output.write(attempt_payload[split:])
    completed = reader.snapshot()
    repeated = reader.snapshot()

    assert completed.physical_attempts == 1
    assert repeated.physical_attempts == 1
    assert repeated.known_spend_usd == 0.02


def test_failed_attempts_are_visible_as_request_health_and_cost_evidence() -> None:
    fresh = _vote(_CARD_B, _FAMILY_A, 0, "proximal")
    accepted = _accepted_attempt(fresh, requested_at=_NOW)
    failed = _failed_attempt(fresh, requested_at=_NOW + timedelta(seconds=2))
    status = calculate_grid_status(
        run_name="grid",
        run_path="runs/grid",
        now=_NOW + timedelta(minutes=1),
        state=_state(),
        corpus=_corpus(),
        imported_votes=_imports(),
        imported_attempts=(),
        votes=(fresh,),
        attempts=(accepted, failed),
        run_active=False,
        manifest_exists=False,
        in_flight=1,
        trigger_rate=0.0,
    )

    assert status.activity == "blocked"
    assert status.physical_attempts == 2
    assert status.failed_attempts == 1
    assert status.repair_attempts == 0
    assert status.awaiting_commit == 0
    assert status.open_votes == 0
    assert not status.cost_complete


def test_parseable_uncommitted_vote_counts_as_complete_awaiting_ordered_commit() -> None:
    fresh = _vote(_CARD_B, _FAMILY_A, 0, "proximal")
    accepted = _accepted_attempt(fresh, requested_at=_NOW)
    status = calculate_grid_status(
        run_name="grid",
        run_path="runs/grid",
        now=_NOW + timedelta(minutes=1),
        state=_state(),
        corpus=_corpus(),
        imported_votes=_imports(),
        imported_attempts=(),
        votes=(),
        attempts=(accepted,),
        run_active=True,
        manifest_exists=False,
        in_flight=0,
        trigger_rate=0.0,
    )

    assert status.completed == 1
    assert status.committed == 0
    assert status.awaiting_commit == 1
    assert status.open_votes == 0
    assert status.phases[0].completed == 1
    assert status.phases[0].committed == 0
    assert status.families[0].completed == 1
    assert status.families[0].committed == 0


def test_malformed_initial_stays_open_until_an_accepted_repair() -> None:
    fresh = _vote(_CARD_B, _FAMILY_A, 0, "proximal")
    malformed = _accepted_attempt(
        fresh,
        requested_at=_NOW,
        content='{"verdict":"proximal"}',
    )
    open_status = calculate_grid_status(
        run_name="grid",
        run_path="runs/grid",
        now=_NOW + timedelta(minutes=1),
        state=_state(),
        corpus=_corpus(),
        imported_votes=_imports(),
        imported_attempts=(),
        votes=(),
        attempts=(malformed,),
        run_active=True,
        manifest_exists=False,
        in_flight=0,
        trigger_rate=0.0,
    )

    assert open_status.completed == 0
    assert open_status.awaiting_commit == 0
    assert open_status.open_votes == 1

    repair = _accepted_attempt(
        fresh,
        requested_at=_NOW + timedelta(seconds=2),
        content="still malformed",
        stage="repair",
    )
    repaired_status = calculate_grid_status(
        run_name="grid",
        run_path="runs/grid",
        now=_NOW + timedelta(minutes=1),
        state=_state(),
        corpus=_corpus(),
        imported_votes=_imports(),
        imported_attempts=(),
        votes=(),
        attempts=(malformed, repair),
        run_active=True,
        manifest_exists=False,
        in_flight=0,
        trigger_rate=0.0,
    )

    assert repaired_status.completed == 1
    assert repaired_status.awaiting_commit == 1
    assert repaired_status.repair_attempts == 1
    assert repaired_status.open_votes == 0
