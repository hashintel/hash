from datetime import timedelta
from pathlib import Path

from atlas_tools.relation.evaluation.application.api import (
    judge_pin,
    judge_request_hash,
    panel_hash,
    plan_hash,
    prepare_pilot_inputs,
    request_contract_hash,
)
from atlas_tools.relation.evaluation.domain.api import BaseRunConfig, ConcurrencyConfig

ROOT = Path(__file__).parents[3]
PILOT_CONFIG = ROOT / "config/eval/pilot.yaml"
DECK = ROOT / "runs/cards"

EXECUTOR_POLICY = {
    "card_eligibility": "exclude-few-shot-only-v1",
    "failure_drain": "finish-started-physical-requests-only-v1",
    "malformed_output_repair_limit": 1,
    "sdk_retries": "disabled",
    "task_order": "judge-family-round-robin-v2",
    "transient_failure_retries": "visible-durable-per-request-stage-per-session-v2",
    "transient_retry_delay": "interruptible-max(deterministic-backoff,retry-after)-v2",
    "vote_failure_policy": "defer-and-repass-until-no-progress-v1",
}
PAID_PILOT_REQUEST_POLICY = {
    "allow_fallbacks": False,
    "cache_headers": {"X-OpenRouter-Cache": "false"},
    "data_collection": "deny",
    "metadata": "enabled",
    "require_parameters": True,
    "retries": "none",
    "stream": False,
    "zdr": True,
}


def _request_contract(config: BaseRunConfig) -> str:
    return request_contract_hash(
        config,
        executor_policy=EXECUTOR_POLICY,
        request_policy=PAID_PILOT_REQUEST_POLICY,
        openrouter_sdk_version="0.10.8",
        openrouter_openapi_version="1.0.0",
    )


def test_paid_pilot_contract_and_plan_reproduce_durable_identities() -> None:
    prepared = prepare_pilot_inputs(PILOT_CONFIG, DECK)
    request_hash = _request_contract(prepared.config)

    assert request_hash == "720240922757e3830166e201cb58d5a31ed511cfcf1266db95d3b3b645354069"
    assert plan_hash(prepared.plan, request_contract=request_hash) == (
        "8b18ebe2963d447df2487a01249826a9a01417c913ad8712e5138d513d9fda33"
    )
    first_pin = judge_pin(prepared.config.judges[0])
    assert judge_request_hash(first_pin) == (
        "bf7031a8815471ea8b8ee5d6d278dd6f0a9df7c95531332c1a0f790faca8bf88"
    )


def test_contract_identity_excludes_only_declared_operational_fields() -> None:
    config = prepare_pilot_inputs(PILOT_CONFIG, DECK).config
    retuned = config.model_copy(
        update={
            "concurrency": ConcurrencyConfig(initial=128, maximum=512),
            "max_cost_usd": 300.0,
        }
    )
    slower = config.model_copy(update={"request_timeout": timedelta(minutes=11)})

    assert panel_hash(retuned) == panel_hash(config)
    assert _request_contract(retuned) == _request_contract(config)
    assert panel_hash(slower) != panel_hash(config)
    assert _request_contract(slower) != _request_contract(config)


def test_request_policy_is_part_of_the_contract_identity() -> None:
    config = prepare_pilot_inputs(PILOT_CONFIG, DECK).config
    changed_policy = {
        **PAID_PILOT_REQUEST_POLICY,
        "anthropic_prompt_caching": "automatic-ephemeral-v1",
    }

    assert request_contract_hash(
        config,
        executor_policy=EXECUTOR_POLICY,
        request_policy=changed_policy,
        openrouter_sdk_version="0.10.8",
        openrouter_openapi_version="1.0.0",
    ) != _request_contract(config)
