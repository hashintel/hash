import pytest
from pydantic import BaseModel, ValidationError

from atlas_tools.common.provenance import (
    JsonDict,
    Provenance,
    canonical_json_bytes,
    sha256_bytes,
)


class _Details(BaseModel):
    kind: str


def _make(config=None):
    return Provenance[_Details, JsonDict].make(
        producer="p", config=config, details=_Details(kind="t")
    )


def test_canonical_json_is_key_order_invariant():
    a = canonical_json_bytes({"b": 1, "a": [1, 2], "c": {"y": 0, "x": 1}})
    b = canonical_json_bytes({"c": {"x": 1, "y": 0}, "a": [1, 2], "b": 1})
    assert a == b


def test_config_hash_stable_across_key_order():
    block1 = _make(config={"a": 1, "b": 2})
    block2 = _make(config={"b": 2, "a": 1})
    assert block1.config_hash == block2.config_hash
    assert block1.config_hash == sha256_bytes(canonical_json_bytes({"a": 1, "b": 2}))


def test_created_at_not_part_of_hash_inputs():
    # created_at is provenance-only; config hash must not depend on it.
    block = _make(config={"a": 1})
    assert block.created_at is not None
    assert block.config_hash == sha256_bytes(canonical_json_bytes({"a": 1}))


def test_no_config_means_no_config_hash():
    block = _make()
    assert block.config is None
    assert block.config_hash is None


def test_config_hash_consistency_enforced():
    valid = _make(config={"a": 1})
    # Hash without config, config without hash, and a tampered hash all fail.
    for override in (
        {"config": None},
        {"config_hash": None},
        {"config_hash": "0" * 64},
    ):
        with pytest.raises(ValidationError, match="config_hash"):
            Provenance[_Details, JsonDict].model_validate(
                {**valid.model_dump(mode="json"), **override}
            )


def test_roundtrip_via_file(tmp_path):
    block = _make(config={"a": 1})
    path = block.write(tmp_path / "artifact.meta.json")
    loaded = Provenance[_Details, JsonDict].load(path)
    assert loaded == block


class _Config(BaseModel):
    alpha: int
    beta: str


def test_typed_config_roundtrip(tmp_path):
    provenance = Provenance[_Details, _Config].make(
        producer="p",
        config=_Config(alpha=1, beta="x"),
        details=_Details(kind="t"),
    )
    # The hash is computed over the JSON-mode dump, so it agrees between the
    # in-memory model and the reloaded sidecar.
    assert provenance.config_hash == sha256_bytes(
        canonical_json_bytes({"alpha": 1, "beta": "x"})
    )

    path = provenance.write(tmp_path / "artifact.meta.json")
    loaded = Provenance[_Details, _Config].load(path)
    assert loaded == provenance
    assert loaded.config == _Config(alpha=1, beta="x")


def test_unparametrized_config_defaults_to_none():
    # Without a TConfig parameter a sidecar must not carry a config.
    provenance = Provenance[_Details].make(producer="p", details=_Details(kind="t"))
    dumped = provenance.model_dump(mode="json")
    with pytest.raises(ValidationError, match="config"):
        Provenance[_Details].model_validate(
            {
                **dumped,
                "config": {"a": 1},
                "config_hash": sha256_bytes(canonical_json_bytes({"a": 1})),
            }
        )
