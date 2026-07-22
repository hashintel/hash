from datetime import timedelta
from pathlib import Path

import pytest
from pydantic import JsonValue, TypeAdapter, ValidationError

from atlas_tools.common import canonical_json_bytes
from atlas_tools.relation.evaluation.domain.api import (
    ACTIVE_COMPLETION_REQUEST_POLICY_ID,
    AUTOMATIC_ANTHROPIC_COMPLETION_REQUEST_POLICY_ID,
    LEGACY_COMPLETION_REQUEST_POLICY_ID,
    CardHash,
    ConcurrencyConfig,
    HandoffManifest,
    JudgeConfig,
    MaxTokensLimit,
    ModelId,
    PhysicalAttempt,
    PilotRunState,
    PromptPackHash,
    ProviderName,
    ProviderSlug,
    TransientRetryConfig,
    Vote,
    VoteTask,
)

_PAID_PILOT = Path(__file__).parents[3] / "runs" / "evaluate-v2"
_JSON_OBJECT_ADAPTER = TypeAdapter(dict[str, JsonValue])


def test_paid_pilot_vote_identity_remains_stable() -> None:
    judge = JudgeConfig(
        provider_slug=ProviderSlug("amazon-bedrock"),
        provider_name=ProviderName("Amazon Bedrock"),
        model=ModelId("anthropic/claude-opus-4.8"),
        temperature=None,
        seed=None,
        higher_effort="high",
        output_token_limit=MaxTokensLimit(tokens=4096),
    )
    task = VoteTask(
        judge=judge,
        bundle_id="S1xF1",
        relation_id="hash:https://blockprotocol.org/@blockprotocol/types/entity-type/link/",
        card_hash=CardHash("b6651be3939273fa29d86bd0bf1c857fab794fca27632ccadf76488c7e2c2702"),
        effort="minimal",
        repeat_index=0,
        prompt_pack_hash=PromptPackHash(
            "c5c617cb6f5b114c6d0f30c01004427669d6247c80da1b692a9acc4e242979e2"
        ),
        rubric_version="rubric-v1",
    )

    assert task.vote_id == "a4573000eceb1e208ca54231743aee7af98478ae3326ccc556982e833b001f96"


def test_retry_policy_rejects_permanent_client_errors() -> None:
    with pytest.raises(ValidationError, match=r"permanent client errors: \[401\]"):
        TransientRetryConfig(status_codes=(401, 429, 500))


def test_retry_policy_rejects_backwards_delay_range() -> None:
    with pytest.raises(ValidationError, match="maximum_delay must not precede"):
        TransientRetryConfig(
            initial_delay=timedelta(seconds=2),
            maximum_delay=timedelta(seconds=1),
        )


def test_concurrency_cannot_shrink_below_its_initial_width() -> None:
    with pytest.raises(ValidationError, match="greater than or equal"):
        ConcurrencyConfig(initial=3, maximum=2)


@pytest.mark.parametrize(
    ("artifact", "model"),
    [("votes.jsonl", Vote), ("attempts.jsonl", PhysicalAttempt)],
)
def test_paid_native_payload_round_trips_without_sdk_types(
    artifact: str,
    model: type[Vote | PhysicalAttempt],
) -> None:
    first_row = (_PAID_PILOT / artifact).read_bytes().splitlines()[0]
    parsed = model.model_validate_json(first_row)
    original = _JSON_OBJECT_ADAPTER.validate_json(first_row, strict=True)

    assert canonical_json_bytes(parsed) == canonical_json_bytes(original)


def test_paid_pilot_state_and_manifest_remain_loadable() -> None:
    state_bytes = (_PAID_PILOT / "run-state.json").read_bytes()
    manifest_bytes = (_PAID_PILOT / "manifest.json").read_bytes()

    state = PilotRunState.model_validate_json(state_bytes, strict=True)
    manifest = HandoffManifest.model_validate_json(manifest_bytes, strict=True)

    assert state.expected_votes == 14_796
    assert state.plan_hash == "9deeec39eaa770eda31ca71688969808bc6a293200df9601ec8cdfe2bab91fa3"
    assert manifest.full_grid_card_count == 1_670
    assert len(manifest.judges) == 9
    assert canonical_json_bytes(manifest) == canonical_json_bytes(
        _JSON_OBJECT_ADAPTER.validate_json(manifest_bytes, strict=True)
    )


@pytest.mark.parametrize(
    "policy_ids",
    [
        [ACTIVE_COMPLETION_REQUEST_POLICY_ID],
        ["unknown-request-policy-v1"],
        [
            AUTOMATIC_ANTHROPIC_COMPLETION_REQUEST_POLICY_ID,
            LEGACY_COMPLETION_REQUEST_POLICY_ID,
        ],
        [
            LEGACY_COMPLETION_REQUEST_POLICY_ID,
            LEGACY_COMPLETION_REQUEST_POLICY_ID,
        ],
    ],
)
def test_run_state_rejects_unregistered_or_noncanonical_historical_policies(
    policy_ids: list[str],
) -> None:
    payload = _JSON_OBJECT_ADAPTER.validate_json(
        (_PAID_PILOT / "run-state.json").read_bytes(),
        strict=True,
    )
    payload["historical_request_evidence"] = {
        "attempt_count": 1,
        "attempts_prefix_hash": "a" * 64,
        "request_policy_ids": policy_ids,
    }

    with pytest.raises(ValidationError):
        PilotRunState.model_validate_json(canonical_json_bytes(payload), strict=True)
