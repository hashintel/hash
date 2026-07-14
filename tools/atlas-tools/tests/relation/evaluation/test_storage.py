import hashlib
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
import trio

from atlas_tools.common import canonical_json_bytes
from atlas_tools.relation.evaluation.domain.api import (
    AttemptFailure,
    InFlightRequest,
    JudgeConfig,
    MaxTokensLimit,
    PhysicalAttempt,
    PilotRunConfig,
    PilotRunState,
    SliceRecord,
    VoteTask,
)
from atlas_tools.relation.evaluation.storage.api import (
    DurableAttempt,
    JournalPaths,
    PilotPaths,
    RunJournal,
    UnknownBillingStateError,
    build_resume_index,
    load_config,
    load_deck,
    load_pilot_import,
    prepare_pilot,
)


def _request(now: datetime) -> InFlightRequest:
    return InFlightRequest(
        attempt_id="a" * 64,
        vote_id="b" * 64,
        request_hash="c" * 64,
        request_stage="initial",
        stage_attempt=0,
        created_at=now,
    )


def _attempt(now: datetime) -> PhysicalAttempt:
    return PhysicalAttempt(
        attempt_id="a" * 64,
        vote_id="b" * 64,
        request_hash="c" * 64,
        request_stage="initial",
        stage_attempt=0,
        family_id="judge.example/model",
        provider_slug="provider",
        model_requested="judge.example/model",
        result=None,
        failure=AttemptFailure(
            category="provider",
            exception_type="ProviderUnavailable",
            message="provider refused the request",
            http_status_code=503,
        ),
        ts_request=now,
        ts_response=now + timedelta(milliseconds=5),
        latency=timedelta(milliseconds=4),
    )


def test_unresolved_marker_blocks_resume(tmp_path: Path) -> None:
    async def scenario() -> None:
        paths = JournalPaths.under(tmp_path)
        journal = RunJournal(paths=paths)
        await journal.create()
        await journal.mark_inflight(_request(datetime.now(UTC)))

        with pytest.raises(UnknownBillingStateError, match="operator review"):
            await journal.recover()

    trio.run(scenario)


def test_recovery_closes_only_a_proven_post_append_crash(tmp_path: Path) -> None:
    async def scenario() -> None:
        now = datetime.now(UTC)
        paths = JournalPaths.under(tmp_path)
        journal = RunJournal(paths=paths)
        await journal.create()
        await journal.mark_inflight(_request(now))

        with paths.attempts.open("ab") as output:
            output.write(canonical_json_bytes(_attempt(now)) + b"\n")

        assert await journal.recover() == 1
        assert await journal.attempts() == (_attempt(now),)
        assert not tuple(paths.inflight.glob("*.json"))

    trio.run(scenario)


def test_attempt_stays_marked_until_accounting_can_settle(tmp_path: Path) -> None:
    async def scenario() -> None:
        now = datetime.now(UTC)
        paths = JournalPaths.under(tmp_path)
        journal = RunJournal(paths=paths)
        await journal.create()
        await journal.mark_inflight(_request(now))

        durable = await journal.append_attempt(_attempt(now))
        assert tuple(paths.inflight.glob("*.json"))
        with pytest.raises(ValueError, match="not durably appended"):
            await journal.clear_inflight(DurableAttempt(attempt_id="f" * 64))

        await journal.clear_inflight(durable)
        assert not tuple(paths.inflight.glob("*.json"))

    trio.run(scenario)


def test_paid_pilot_yaml_uses_strict_json_boundary() -> None:
    atlas_tools = Path(__file__).parents[3]
    loaded = load_config(atlas_tools / "config" / "eval" / "pilot.yaml")

    assert isinstance(loaded.config, PilotRunConfig)
    assert len(loaded.config.judges) == 9
    assert loaded.config.request_timeout == timedelta(minutes=10)
    assert isinstance(loaded.config.judges, tuple)


def test_paid_pilot_deck_is_verified_and_indexed_once() -> None:
    atlas_tools = Path(__file__).parents[3]
    deck = load_deck(atlas_tools / "runs" / "cards")

    assert len(deck.cards) == 1_684
    assert deck.source_hashes["cards.jsonl"] == (
        "2a9934acae8bf210b6a3428e553b1bcc0e220a4de113940782cd573da1ea4f4b"
    )
    first = deck.cards[0]
    assert deck.by_relation_id[first.relation_id] is first
    assert deck.source_namespaces == frozenset({"hash", "wikidata"})


def test_run_state_binds_slice_before_resume_is_allowed(tmp_path: Path) -> None:
    row = SliceRecord(
        relation_id="wikidata:P1",
        card_hash="d" * 64,
        prescreen_stratum="ordinary",
        sampling_stratum="wikidata|ordinary|length-q1|ordinary",
        length_quartile=1,
        pilot_strata=(),
        token_count=10,
        is_holdout=False,
        holdout_verdict=None,
        sampling_seed=42,
        selection_key="e" * 64,
    )
    slice_hash = hashlib.sha256(canonical_json_bytes(row) + b"\n").hexdigest()
    state = PilotRunState(
        plan_hash="1" * 64,
        request_contract_hash="2" * 64,
        source_hashes={"cards.jsonl": "3" * 64, "cards.manifest.json": "4" * 64},
        prompt_pack_hash="5" * 64,
        slice_hash=slice_hash,
        expected_votes=1,
        openrouter_sdk_version="0.10.8",
        openrouter_openapi_version="1.0.0",
    )
    paths = PilotPaths.under(tmp_path)

    prepare_pilot(paths, state=state, slice_records=(row,))
    paths.slice.write_bytes(b"tampered\n")

    with pytest.raises(ValueError, match="durable slice does not match"):
        prepare_pilot(paths, state=state, slice_records=(row,))


def test_paid_pilot_import_requires_exact_vote_and_prompt_identity() -> None:
    atlas_tools = Path(__file__).parents[3]
    paid = atlas_tools / "runs" / "evaluate"
    vote_id = "a4573000eceb1e208ca54231743aee7af98478ae3326ccc556982e833b001f96"
    prompt_hash = "c5c617cb6f5b114c6d0f30c01004427669d6247c80da1b692a9acc4e242979e2"

    imported = load_pilot_import(
        paid,
        planned_vote_ids=frozenset({vote_id}),
        prompt_pack_hash=prompt_hash,
    )

    assert tuple(vote.vote_id for vote in imported.votes) == (vote_id,)
    assert imported.attempts
    assert {attempt.vote_id for attempt in imported.attempts} == {vote_id}
    with pytest.raises(ValueError, match="voids qualification"):
        load_pilot_import(
            paid,
            planned_vote_ids=frozenset({vote_id}),
            prompt_pack_hash="0" * 64,
        )


@dataclass(frozen=True, slots=True)
class _SingleTaskPlan:
    task: VoteTask

    @property
    def expected_votes(self) -> int:
        return 1

    def tasks(self) -> Iterator[VoteTask]:
        yield self.task


def test_resume_links_paid_vote_to_its_physical_evidence() -> None:
    atlas_tools = Path(__file__).parents[3]
    vote_id = "a4573000eceb1e208ca54231743aee7af98478ae3326ccc556982e833b001f96"
    imported = load_pilot_import(
        atlas_tools / "runs" / "evaluate",
        planned_vote_ids=frozenset({vote_id}),
        prompt_pack_hash="c5c617cb6f5b114c6d0f30c01004427669d6247c80da1b692a9acc4e242979e2",
    )
    judge = imported.votes[0]
    task = VoteTask(
        judge=JudgeConfig(
            provider_slug="amazon-bedrock",
            provider_name="Amazon Bedrock",
            model=judge.family_id,
            temperature=judge.temperature,
            seed=judge.seed,
            higher_effort="high",
            output_token_limit=MaxTokensLimit(tokens=4096),
        ),
        bundle_id=judge.bundle_id,
        relation_id=judge.relation_id,
        card_hash=judge.card_hash,
        effort=judge.effort,
        repeat_index=judge.repeat_index,
        prompt_pack_hash=judge.prompt_pack_hash,
        rubric_version="rubric-v1",
    )

    resume = build_resume_index(
        _SingleTaskPlan(task),
        votes=imported.votes,
        attempts=imported.attempts,
    )

    assert resume.next_plan_index == 1
    assert resume.attempts_by_vote[vote_id] == imported.attempts
