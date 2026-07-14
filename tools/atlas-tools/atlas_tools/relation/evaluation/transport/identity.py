"""Bind physical request identity to the exact OpenRouter wire policy."""

from pydantic import JsonValue

from atlas_tools.common import Sha256Hex, canonical_json_bytes, sha256_bytes
from atlas_tools.relation.evaluation.domain.api import RequestStage
from atlas_tools.relation.evaluation.transport.completion import CompletionRequest


def request_policy_payload() -> dict[str, JsonValue]:
    """Return fresh JSON data describing every non-content request constraint."""
    return {
        "allow_fallbacks": False,
        "anthropic_prompt_caching": "explicit-prefix-breakpoint-ephemeral-v2",
        "cache_headers": {"X-OpenRouter-Cache": "false"},
        "data_collection": "deny",
        "metadata": "enabled",
        "require_parameters": True,
        "retries": "none",
        "stream": False,
        "zdr": True,
    }


def request_hash(
    request: CompletionRequest,
    *,
    vote_id: Sha256Hex,
    stage: RequestStage,
) -> Sha256Hex:
    """Hash one completion together with its paid transport policy."""
    if request.request_stage != stage:
        raise ValueError("request stage must match the hashed stage")

    judge = request.judge

    return sha256_bytes(
        canonical_json_bytes(
            {
                "effort": request.effort,
                "output_token_limit": judge.output_token_limit.model_dump(mode="json"),
                "messages": [
                    {"content": message.content, "role": message.role}
                    for message in request.messages
                ],
                "model": judge.model,
                "provider_name": judge.provider_name,
                "provider_slug": judge.provider_slug,
                "openrouter_region": judge.openrouter_region,
                "request_policy": request_policy_payload(),
                "seed": judge.seed,
                "session_id": request.session_id,
                "stage": stage,
                "temperature": judge.temperature,
                "timeout": request.timeout.total_seconds(),
                "vote_id": vote_id,
            }
        )
    )
