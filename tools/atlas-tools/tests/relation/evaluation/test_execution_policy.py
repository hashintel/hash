from atlas_tools.relation.evaluation.execution.api import executor_policy_payload


def test_executor_policy_matches_the_durable_request_contract() -> None:
    expected = {
        "card_eligibility": "exclude-few-shot-only-v1",
        "failure_drain": "finish-started-physical-requests-only-v1",
        "malformed_output_repair_limit": 1,
        "sdk_retries": "disabled",
        "task_order": "judge-family-round-robin-v2",
        "transient_failure_retries": ("visible-durable-per-request-stage-per-session-v2"),
        "transient_retry_delay": ("interruptible-max(deterministic-backoff,retry-after)-v2"),
        "vote_failure_policy": "defer-and-repass-until-no-progress-v1",
    }

    observed = executor_policy_payload()
    observed["malformed_output_repair_limit"] = 0

    assert executor_policy_payload() == expected
