import hashlib
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
import trio

from atlas_tools.common import canonical_json_bytes
from atlas_tools.relation.evaluation.domain.api import (
    AttemptId,
    AttemptRoute,
    AttemptTiming,
    CardHash,
    FailedAttempt,
    InFlightRequest,
    JudgeFamilyId,
    ModelId,
    PaidRequestIdentity,
    PhysicalAttempt,
    PilotRunConfig,
    PilotRunState,
    PlanHash,
    PromptPackHash,
    ProviderFailure,
    ProviderSlug,
    RequestHash,
    SliceRecord,
    VoteId,
)
from atlas_tools.relation.evaluation.storage.api import (
    DurableAttempt,
    JournalPaths,
    PilotPaths,
    RunJournal,
    UnknownBillingStateError,
    load_config,
    load_deck,
    load_pilot_import,
    prepare_pilot,
)


def _request(now: datetime) -> InFlightRequest:
    return InFlightRequest(
        identity=PaidRequestIdentity(
            attempt_id=AttemptId("a" * 64),
            vote_id=VoteId("b" * 64),
            request_hash=RequestHash("c" * 64),
            stage="initial",
            stage_attempt=0,
        ),
        created_at=now,
    )


def _attempt(now: datetime) -> PhysicalAttempt:
    return PhysicalAttempt(
        identity=PaidRequestIdentity(
            attempt_id=AttemptId("a" * 64),
            vote_id=VoteId("b" * 64),
            request_hash=RequestHash("c" * 64),
            stage="initial",
            stage_attempt=0,
        ),
        route=AttemptRoute(
            family_id=JudgeFamilyId("judge.example/model"),
            provider_slug=ProviderSlug("provider"),
            model_requested=ModelId("judge.example/model"),
        ),
        outcome=FailedAttempt(
            failure=ProviderFailure(
                exception_type="ProviderUnavailable",
                message="provider refused the request",
                http_status_code=503,
            )
        ),
        timing=AttemptTiming(
            request_at=now,
            response_at=now + timedelta(milliseconds=5),
            latency=timedelta(milliseconds=4),
        ),
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
            await journal.clear_inflight(DurableAttempt(attempt_id=AttemptId("f" * 64)))

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
        card_hash=CardHash("d" * 64),
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
        plan_hash=PlanHash("1" * 64),
        request_contract_hash="2" * 64,
        source_hashes={"cards.jsonl": "3" * 64, "cards.manifest.json": "4" * 64},
        prompt_pack_hash=PromptPackHash("5" * 64),
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
    vote_id = VoteId("a4573000eceb1e208ca54231743aee7af98478ae3326ccc556982e833b001f96")
    prompt_hash = PromptPackHash(
        "c5c617cb6f5b114c6d0f30c01004427669d6247c80da1b692a9acc4e242979e2"
    )

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
            prompt_pack_hash=PromptPackHash("0" * 64),
        )
