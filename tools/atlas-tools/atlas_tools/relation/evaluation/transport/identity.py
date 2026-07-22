"""Bind physical request identity to the exact OpenRouter wire policy."""

from dataclasses import dataclass
from types import MappingProxyType
from typing import Literal

from pydantic import JsonValue

from atlas_tools.common import canonical_json_bytes, sha256_bytes
from atlas_tools.relation.evaluation.domain.api import (
    ACTIVE_COMPLETION_REQUEST_POLICY_ID,
    AUTOMATIC_ANTHROPIC_COMPLETION_REQUEST_POLICY_ID,
    LEGACY_COMPLETION_REQUEST_POLICY_ID,
    CompletionRequestPolicyId,
    RequestHash,
    RequestStage,
    VoteId,
)
from atlas_tools.relation.evaluation.transport.completion import CompletionRequest


@dataclass(frozen=True, slots=True, kw_only=True)
class _CompletionRequestPolicy:
    anthropic_prompt_caching: (
        Literal[
            "automatic-ephemeral-for-anthropic-models-v1",
            "explicit-prefix-breakpoint-ephemeral-v2",
        ]
        | None
    )

    def payload(self) -> dict[str, JsonValue]:
        payload: dict[str, JsonValue] = {
            "allow_fallbacks": False,
            "cache_headers": {"X-OpenRouter-Cache": "false"},
            "data_collection": "deny",
            "metadata": "enabled",
            "require_parameters": True,
            "retries": "none",
            "stream": False,
            "zdr": True,
        }
        if self.anthropic_prompt_caching is not None:
            payload["anthropic_prompt_caching"] = self.anthropic_prompt_caching
        return payload


_REQUEST_POLICIES = MappingProxyType[CompletionRequestPolicyId, _CompletionRequestPolicy](
    {
        LEGACY_COMPLETION_REQUEST_POLICY_ID: _CompletionRequestPolicy(
            anthropic_prompt_caching=None
        ),
        AUTOMATIC_ANTHROPIC_COMPLETION_REQUEST_POLICY_ID: _CompletionRequestPolicy(
            anthropic_prompt_caching="automatic-ephemeral-for-anthropic-models-v1"
        ),
        ACTIVE_COMPLETION_REQUEST_POLICY_ID: _CompletionRequestPolicy(
            anthropic_prompt_caching="explicit-prefix-breakpoint-ephemeral-v2"
        ),
    }
)


def request_policy_payload(
    policy_id: CompletionRequestPolicyId = ACTIVE_COMPLETION_REQUEST_POLICY_ID,
) -> dict[str, JsonValue]:
    """Return fresh JSON data describing every non-content request constraint."""
    return _REQUEST_POLICIES[policy_id].payload()


def request_hash(
    request: CompletionRequest,
    *,
    vote_id: VoteId,
    stage: RequestStage,
    policy_id: CompletionRequestPolicyId,
) -> RequestHash:
    """Hash one completion together with its paid transport policy."""
    if request.request_stage != stage:
        raise ValueError("request stage must match the hashed stage")

    judge = request.judge

    return RequestHash(
        sha256_bytes(
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
                    "request_policy": request_policy_payload(policy_id),
                    "seed": judge.seed,
                    "session_id": request.session_id,
                    "stage": stage,
                    "temperature": judge.temperature,
                    "timeout": request.timeout.total_seconds(),
                    "vote_id": vote_id,
                }
            )
        )
    )
