from atlas_tools.common.provenance import (
    canonical_json_bytes,
    provenance_block,
    sha256_bytes,
)


def test_canonical_json_is_key_order_invariant():
    a = canonical_json_bytes({"b": 1, "a": [1, 2], "c": {"y": 0, "x": 1}})
    b = canonical_json_bytes({"c": {"x": 1, "y": 0}, "a": [1, 2], "b": 1})
    assert a == b


def test_config_hash_stable_across_key_order():
    block1 = provenance_block(producer="p", config={"a": 1, "b": 2})
    block2 = provenance_block(producer="p", config={"b": 2, "a": 1})
    assert block1["config_hash"] == block2["config_hash"]
    assert block1["config_hash"] == sha256_bytes(canonical_json_bytes({"a": 1, "b": 2}))


def test_created_at_not_part_of_hash_inputs():
    # created_at is provenance-only; config hash must not depend on it.
    block = provenance_block(producer="p", config={"a": 1})
    assert "created_at" in block
    assert block["config_hash"] == sha256_bytes(canonical_json_bytes({"a": 1}))
