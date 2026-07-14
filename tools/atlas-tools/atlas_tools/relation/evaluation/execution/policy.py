"""Freeze execution semantics that contribute to run identity."""


def executor_policy_payload() -> dict[str, str | int]:
    """Return fresh JSON data describing request-affecting execution policy."""
    return {
        "card_eligibility": "exclude-few-shot-only-v1",
        "failure_drain": "finish-started-physical-requests-only-v1",
        "grid_holdout_canary": "fixed-holdouts-repeat-3-after-refinement-v1",
        "grid_refinement": "baseline-triggered-repeats-1-and-2-v1",
        "malformed_output_repair_limit": 1,
        "sdk_retries": "disabled",
        "task_order": "phase-ordered-judge-family-round-robin-v3",
        "transient_failure_retries": ("visible-durable-per-request-stage-per-session-v2"),
        "transient_retry_delay": ("interruptible-max(deterministic-backoff,retry-after)-v2"),
        "vote_failure_policy": "defer-and-repass-until-no-progress-v1",
    }
