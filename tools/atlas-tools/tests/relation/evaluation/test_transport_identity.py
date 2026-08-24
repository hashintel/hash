from atlas_tools.relation.evaluation.transport.api import (
    ACTIVE_COMPLETION_REQUEST_POLICY_ID,
    AUTOMATIC_ANTHROPIC_COMPLETION_REQUEST_POLICY_ID,
    LEGACY_COMPLETION_REQUEST_POLICY_ID,
    request_policy_payload,
)


def test_completion_request_policy_registry_preserves_three_wire_contracts() -> None:
    legacy = request_policy_payload(LEGACY_COMPLETION_REQUEST_POLICY_ID)
    automatic = request_policy_payload(AUTOMATIC_ANTHROPIC_COMPLETION_REQUEST_POLICY_ID)
    active = request_policy_payload(ACTIVE_COMPLETION_REQUEST_POLICY_ID)

    assert "anthropic_prompt_caching" not in legacy
    assert automatic["anthropic_prompt_caching"] == "automatic-ephemeral-for-anthropic-models-v1"
    assert active["anthropic_prompt_caching"] == "explicit-prefix-breakpoint-ephemeral-v2"
    assert {
        key: value for key, value in automatic.items() if key != "anthropic_prompt_caching"
    } == legacy
    assert {
        key: value for key, value in active.items() if key != "anthropic_prompt_caching"
    } == legacy

    active["allow_fallbacks"] = True
    assert request_policy_payload(ACTIVE_COMPLETION_REQUEST_POLICY_ID)["allow_fallbacks"] is False
