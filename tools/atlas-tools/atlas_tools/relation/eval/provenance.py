"""Stable executor-policy and plan provenance for relation evaluation."""

import hashlib
from importlib.metadata import version

import openrouter
from pydantic import JsonValue

from atlas_tools.common import Sha256Hex, canonical_json_bytes, sha256_bytes
from atlas_tools.relation.eval.contract import BaseRunConfig, JudgeConfig, VotePlan
from atlas_tools.relation.eval.schema import JudgePin
from atlas_tools.relation.eval.transport import request_policy_payload


def judge_pin(judge: JudgeConfig) -> JudgePin:
    """Project a judge config into the persisted request-pin contract."""
    return JudgePin.model_validate({"family_id": judge.family_id} | judge.model_dump(mode="json"))


def judge_request_hash(pin: JudgePin) -> Sha256Hex:
    """Hash every persisted field that defines one judge's request semantics."""
    return sha256_bytes(canonical_json_bytes(pin.model_dump(mode="json")))


def executor_policy_payload() -> dict[str, JsonValue]:
    """Return the execution policy bound into run state and manifests."""
    return {
        "card_eligibility": "exclude-few-shot-only-v1",
        "failure_drain": "finish-started-physical-requests-only-v1",
        "malformed_output_repair_limit": 1,
        "sdk_retries": "disabled",
        "task_order": "judge-family-round-robin-v2",
        "transient_failure_retries": "visible-durable-per-request-stage-per-session-v2",
        "transient_retry_delay": "interruptible-max(deterministic-backoff,retry-after)-v2",
        "vote_failure_policy": "defer-and-repass-until-no-progress-v1",
    }


def request_contract_hash(config: BaseRunConfig) -> Sha256Hex:
    """Hash config, executor policy, transport policy, and OpenRouter versions.

    Operational scheduling knobs that cannot change any request's semantics —
    the cost cap and the concurrency limits — are excluded so an operator can
    retune them between resumed sessions of the same run.
    """
    return sha256_bytes(
        canonical_json_bytes(
            {
                "config": config.model_dump(mode="json", exclude={"max_cost_usd", "concurrency"}),
                "executor_policy": executor_policy_payload(),
                "openrouter_openapi_version": openrouter.OPENAPI_DOC_VERSION,
                "openrouter_sdk_version": version("openrouter"),
                "request_policy": request_policy_payload(),
            }
        )
    )


def plan_hash(config: BaseRunConfig, plan: VotePlan) -> Sha256Hex:
    """Hash the request contract followed by the deterministic task stream."""
    digest = hashlib.sha256()
    digest.update(request_contract_hash(config).encode("ascii"))
    digest.update(b"\n")
    for task in plan.tasks():
        digest.update(task.vote_id.encode("ascii"))
        digest.update(b"\n")
    return digest.hexdigest()
