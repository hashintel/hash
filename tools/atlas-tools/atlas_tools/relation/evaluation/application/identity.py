"""Compute stable run identities without depending on execution or transport.

The caller supplies policy and version pins that live outside this subsystem.
This keeps identity derivation pure while preserving the canonical payloads
used by existing pilot and grid artifacts.
"""

import hashlib
import json
from collections.abc import Mapping

from atlas_tools.relation.evaluation.domain.api import (
    BaseRunConfig,
    JudgeConfig,
    JudgePin,
    Sha256Hex,
    VotePlan,
)

type JsonValue = (
    None
    | bool
    | int
    | float
    | str
    | list[JsonValue]
    | tuple[JsonValue, ...]
    | Mapping[str, JsonValue]
)


def _canonical_json_bytes(value: object) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def _plain_json(value: object) -> object:
    if isinstance(value, Mapping):
        copied: dict[str, object] = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise TypeError("JSON object keys must be strings")
            copied[key] = _plain_json(item)
        return copied
    if isinstance(value, list | tuple):
        return [_plain_json(item) for item in value]
    if value is None or isinstance(value, bool | int | float | str):
        return value
    raise TypeError(f"unsupported JSON value {type(value).__qualname__}")


def _sha256_json(value: object) -> Sha256Hex:
    return hashlib.sha256(_canonical_json_bytes(value)).hexdigest()


def judge_pin(judge: JudgeConfig) -> JudgePin:
    """Snapshot one judge with the same fields used by its request contract."""
    payload = {"family_id": judge.family_id, **judge.model_dump(mode="json")}
    return JudgePin.model_validate(payload, strict=True)


def judge_request_hash(pin: JudgePin) -> Sha256Hex:
    """Hash exactly the judge fields present when the pin was constructed.

    [`JudgePin`] covers both pilot and grid judges. Excluding unset fields keeps
    absent grid-only metadata out of a pilot judge's historical identity while
    retaining explicit null request pins such as `temperature` and `seed`.
    """
    return _sha256_json(pin.model_dump(mode="json", exclude_unset=True))


def panel_hash(config: BaseRunConfig) -> Sha256Hex:
    """Hash semantic configuration while excluding retunable operations.

    Every field named by `config.OPERATIONAL_FIELDS` is excluded. The remaining
    canonical JSON is identical to the legacy judges-panel identity.
    """
    return _sha256_json(config.model_dump(mode="json", exclude=set(config.OPERATIONAL_FIELDS)))


def request_contract_hash(
    config: BaseRunConfig,
    *,
    executor_policy: Mapping[str, JsonValue],
    request_policy: Mapping[str, JsonValue],
    openrouter_sdk_version: str,
    openrouter_openapi_version: str,
) -> Sha256Hex:
    """Bind semantic config to explicit executor and wire-policy versions.

    Operational fields are excluded by the config's declared policy. Empty
    version pins are rejected because an unversioned transport cannot identify
    a resumable paid-request contract.
    """
    if not openrouter_sdk_version:
        raise ValueError("openrouter_sdk_version must not be empty")
    if not openrouter_openapi_version:
        raise ValueError("openrouter_openapi_version must not be empty")
    return _sha256_json(
        {
            "config": config.model_dump(
                mode="json",
                exclude=set(config.OPERATIONAL_FIELDS),
            ),
            "executor_policy": _plain_json(executor_policy),
            "openrouter_openapi_version": openrouter_openapi_version,
            "openrouter_sdk_version": openrouter_sdk_version,
            "request_policy": _plain_json(request_policy),
        }
    )


def plan_hash(plan: VotePlan, *, request_contract: Sha256Hex) -> Sha256Hex:
    """Hash a deterministic task stream incrementally in constant memory.

    The request-contract hash is followed by a newline and then each logical
    vote ID plus a newline. A plan whose iterator disagrees with
    `expected_votes` is rejected. Time is `O(n)` and additional memory is
    `O(1)` for `n` tasks.
    """
    digest = hashlib.sha256()
    digest.update(request_contract.encode("ascii"))
    digest.update(b"\n")
    count = 0
    for task in plan.tasks():
        digest.update(task.vote_id.encode("ascii"))
        digest.update(b"\n")
        count += 1
    if count != plan.expected_votes:
        raise ValueError(f"plan declares {plan.expected_votes} votes but yields {count}")
    return digest.hexdigest()
