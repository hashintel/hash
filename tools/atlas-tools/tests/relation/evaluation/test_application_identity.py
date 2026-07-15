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
from atlas_tools.relation.evaluation.execution.api import executor_policy_payload
from atlas_tools.relation.evaluation.transport.api import request_policy_payload

ROOT = Path(__file__).parents[3]
PILOT_CONFIG = ROOT / "config/eval/pilot.yaml"
DECK = ROOT / "runs/cards"


def _request_contract(config: BaseRunConfig) -> str:
    return request_contract_hash(
        config,
        executor_policy=executor_policy_payload(),
        request_policy=request_policy_payload(),
        openrouter_sdk_version="0.10.8",
        openrouter_openapi_version="1.0.0",
    )


def test_paid_pilot_contract_and_plan_reproduce_durable_identities() -> None:
    prepared = prepare_pilot_inputs(PILOT_CONFIG, DECK)
    request_hash = _request_contract(prepared.config)

    assert request_hash == "50a4b5e0678a47fead0c73415a6e5e95088a227ac05c5c07829ac0676c3e511e"
    assert plan_hash(prepared.plan, request_contract=request_hash) == (
        "9deeec39eaa770eda31ca71688969808bc6a293200df9601ec8cdfe2bab91fa3"
    )
    first_pin = judge_pin(prepared.config.judges[0])
    assert judge_request_hash(first_pin) == (
        "21cdaa7148561938f664d1086e91d37e1e03c36ab600b545fc6352d1f7d57799"
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
    changed_policy = {**request_policy_payload(), "metadata": "disabled"}

    assert request_contract_hash(
        config,
        executor_policy=executor_policy_payload(),
        request_policy=changed_policy,
        openrouter_sdk_version="0.10.8",
        openrouter_openapi_version="1.0.0",
    ) != _request_contract(config)
