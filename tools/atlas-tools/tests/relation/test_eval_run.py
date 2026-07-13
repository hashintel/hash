from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from openrouter.components import ChatMessages, ChatUserMessage

from atlas_tools.common import canonical_json_bytes, sha256_bytes
from atlas_tools.relation.eval.analysis import load_handoff
from atlas_tools.relation.eval.prompt import FEW_SHOT, HOLDOUT, RETRY_INSTRUCTION
from atlas_tools.relation.eval.run import (
    CompletionAttempt,
    JudgeConfig,
    PilotRunConfig,
    ReasoningEffort,
    load_run_config,
    run_pilot,
)
from atlas_tools.relation.eval.schema import HandoffManifest, SliceRow, Verdict, VoteRow

MODEL = "test/model"
PROVIDER = "test-provider"
START = datetime(2026, 7, 13, tzinfo=UTC)
LIVE_RELATION = "P999999"


class FakeTransport:
    def __init__(self) -> None:
        self.calls: list[list[ChatMessages]] = []
        self.logical_call = 0

    def complete(
        self,
        *,
        messages: list[ChatMessages],
        judge: JudgeConfig,
        effort: ReasoningEffort,
        timeout_ms: int,
    ) -> CompletionAttempt:
        assert judge.model == MODEL
        assert effort in {"minimal", "high"}
        assert timeout_ms == 5_000
        retry = (
            isinstance(messages[-1], ChatUserMessage) and messages[-1].content == RETRY_INSTRUCTION
        )
        if not retry:
            self.logical_call += 1
        self.calls.append(messages)

        if self.logical_call == 1 and not retry:
            completion = "not JSON"
        elif self.logical_call == 2:
            completion = "still malformed"
        else:
            completion = '{"reason": "P1-P3 hold", "verdict": "proximal"}'

        call_index = len(self.calls)
        requested = START + timedelta(seconds=call_index * 2)
        return CompletionAttempt(
            raw_completion=completion,
            model_returned=MODEL,
            provider=PROVIDER,
            completion_id=f"completion-{call_index}",
            usage={
                "prompt_tokens": 100,
                "completion_tokens": 5,
                "total_tokens": 105,
                "cost": 0.01,
                "prompt_tokens_details": {"cached_tokens": 80},
                "completion_tokens_details": {"reasoning_tokens": 2},
            },
            ts_request=requested,
            ts_response=requested + timedelta(seconds=1),
        )


def _write_inputs(directory: Path) -> tuple[Path, Path]:
    directory.mkdir()
    cards_path = directory / "cards.jsonl"
    slice_path = directory / "slice.jsonl"
    shot_ids = {str(provider_id) for _, provider_id, _ in FEW_SHOT}
    holdouts: dict[str, Verdict] = {
        str(provider_id): verdict for _, provider_id, verdict in HOLDOUT
    }
    relation_ids = sorted(shot_ids | set(holdouts) | {LIVE_RELATION})

    cards: dict[str, tuple[str, str, int]] = {}
    with cards_path.open("w", encoding="utf-8") as output:
        for relation_id in relation_ids:
            card_text = f"relation card for {relation_id}"
            card_hash = sha256_bytes(card_text.encode())
            token_count = len(card_text.split())
            cards[relation_id] = (card_text, card_hash, token_count)
            row = {
                "pid": relation_id,
                "card_text": card_text,
                "card_hash": card_hash,
                "token_count": token_count,
                "truncations": [],
                "severely_truncated": False,
            }
            output.write(canonical_json_bytes(row).decode() + "\n")

    slice_rows = []
    for relation_id in sorted((*holdouts, LIVE_RELATION)):
        _, card_hash, token_count = cards[relation_id]
        slice_rows.append(
            SliceRow(
                relation_id=relation_id,
                card_hash=card_hash,
                prescreen_stratum="anchor" if relation_id in holdouts else "ordinary",
                token_count=token_count,
                is_holdout=relation_id in holdouts,
                holdout_verdict=holdouts.get(relation_id),
                sampling_seed=42,
            )
        )
    with slice_path.open("w", encoding="utf-8") as output:
        for row in slice_rows:
            output.write(canonical_json_bytes(row).decode() + "\n")
    return cards_path, slice_path


def _config() -> PilotRunConfig:
    return PilotRunConfig(
        full_grid_card_count=1_700,
        repeat_count=1,
        timeout_ms=5_000,
        judges=[
            JudgeConfig(
                family_id="judge-a-2026-07-13",
                provider=PROVIDER,
                model=MODEL,
                temperature=0.0,
                seed=17,
                higher_effort="high",
            )
        ],
    )


def _read_votes(path: Path) -> list[VoteRow]:
    return [VoteRow.model_validate_json(line) for line in path.read_text().splitlines()]


def test_run_pilot_emits_complete_deterministic_handoff(tmp_path: Path) -> None:
    cards_path, slice_path = _write_inputs(tmp_path / "input")
    first_transport = FakeTransport()
    first = run_pilot(
        cards_path=cards_path,
        slice_path=slice_path,
        out_dir=tmp_path / "first",
        config=_config(),
        transport=first_transport,
    )

    votes = _read_votes(first.votes_jsonl)
    expected_grid_votes = 9 * 7
    expected_repeat_votes = 1
    expected_effort_votes = 7
    assert len(votes) == expected_grid_votes + expected_repeat_votes + expected_effort_votes
    assert len(first_transport.calls) == len(votes) + 2

    repaired = [vote for vote in votes if vote.parse_retries == 1 and not vote.abstained]
    abstained = [vote for vote in votes if vote.abstained]
    assert len(repaired) == 1
    assert len(abstained) == 1
    for vote in (*repaired, *abstained):
        assert vote.initial_raw_completion is not None
        assert vote.tokens_in == 200
        assert vote.tokens_out == 10
        assert vote.tokens_cached == 160
        assert vote.cost_usd == 0.02
        assert vote.attempt_models == [MODEL, MODEL]
        assert vote.attempt_providers == [PROVIDER, PROVIDER]
        assert len(vote.provider_usage) == 2
    assert repaired[0].verdict == "proximal"
    assert abstained[0].verdict == "ABSTAIN"
    assert abstained[0].reason == ""

    retry_messages = first_transport.calls[1]
    assert retry_messages[-2].role == "assistant"
    assert retry_messages[-2].content == "not JSON"
    assert retry_messages[-1] == ChatUserMessage(
        role="user",
        content=RETRY_INSTRUCTION,
    )

    manifest = HandoffManifest.model_validate_json(first.manifest_json.read_text())
    assert manifest.expected_grid.bundles == [
        "S1xF1",
        "S1xF2",
        "S1xF3",
        "S2xF1",
        "S2xF2",
        "S2xF3",
        "S3xF1",
        "S3xF2",
        "S3xF3",
    ]
    assert manifest.judges[0].model == MODEL
    assert manifest.executor_config is not None
    load_handoff(tmp_path / "first")

    second_transport = FakeTransport()
    second = run_pilot(
        cards_path=cards_path,
        slice_path=slice_path,
        out_dir=tmp_path / "second",
        config=_config(),
        transport=second_transport,
    )
    assert first.votes_jsonl.read_bytes() == second.votes_jsonl.read_bytes()
    assert first.slice_jsonl.read_bytes() == second.slice_jsonl.read_bytes()
    assert first.manifest_json.read_bytes() == second.manifest_json.read_bytes()


def test_load_run_config_rejects_unknown_fields(tmp_path: Path) -> None:
    config_path = tmp_path / "judges.yaml"
    config_path.write_text(
        """schema_version: 1
rubric_version: rubric-v1
baseline_effort: minimal
full_grid_card_count: 1700
repeat_count: 1
timeout_ms: 5000
unknown: true
judges:
  - family_id: judge-a-2026-07-13
    provider: test-provider
    model: test/model
""",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="unknown"):
        load_run_config(config_path)
