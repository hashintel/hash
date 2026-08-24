"""Tests for strict, identity-bound source relation lineage artifacts."""

import json
from pathlib import Path

import pytest
from pydantic import JsonValue, ValidationError

import atlas_tools.relation.lineage.api as lineage_module
from atlas_tools.common import (
    Provenance,
    canonical_json_bytes,
    sha256_bytes,
    sha256_file,
)
from atlas_tools.relation.lineage.api import (
    WIKIDATA_INVERSE_EDGE_KIND,
    LineageInverseEdge,
    LineageNode,
    SourceLineagePolicy,
    SourceSnapshotIdentity,
    publish_source_lineage,
    source_lineage_artifact_id,
    validate_lineage_nodes,
    verify_source_lineage,
)
from atlas_tools.relation_cards.common.cards import (
    CardRow,
    RelationNamespace,
    RelationSourceSpec,
    qualify_relation_id,
)


def _write_card_set(
    directory: Path,
    *,
    namespace: RelationNamespace,
    local_id_field: str,
    rows: tuple[tuple[str, str], ...],
    snapshot: SourceSnapshotIdentity,
) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    cards_path = directory / "cards.jsonl"
    cards: list[CardRow] = []
    for local_id, text in rows:
        payload: dict[str, JsonValue] = {
            "card_text": text,
            "card_hash": sha256_bytes(text.encode()),
            "token_count": len(text.split()),
            "truncations": [],
            "severely_truncated": False,
            "relation_id": qualify_relation_id(namespace, local_id),
        }
        payload[local_id_field] = local_id
        cards.append(CardRow.model_validate(payload))
    cards_path.write_bytes(b"".join(canonical_json_bytes(card) + b"\n" for card in cards))
    Provenance[JsonValue, JsonValue].make(
        producer=f"test.{namespace}-cards",
        content_hashes={"cards.jsonl": sha256_file(cards_path)},
        details={
            "relation_source": RelationSourceSpec(
                namespace=namespace,
                local_id_field=local_id_field,
            ).model_dump(mode="json"),
            "snapshot": snapshot.model_dump(mode="json"),
        },
    ).write(directory / "cards.manifest.json")
    return directory


def _node(
    relation_id: str,
    *,
    extends: tuple[str, ...] = (),
    inverse: tuple[str, ...] = (),
) -> LineageNode:
    return LineageNode(
        relation_id=relation_id,
        extends=extends,
        inverse_edges=tuple(
            LineageInverseEdge(
                relation_id=target,
                kind=WIKIDATA_INVERSE_EDGE_KIND,
            )
            for target in inverse
        ),
    )


def _publish_basic_lineage(directory: Path) -> tuple[Path, Path]:
    snapshot = SourceSnapshotIdentity(kind="dump", value={"revision": 1})
    cards = _write_card_set(
        directory / "cards",
        namespace="wikidata",
        local_id_field="pid",
        rows=(("P1", "one"), ("P2", "two")),
        snapshot=snapshot,
    )
    raw = directory / "source.json"
    raw.write_text('{"snapshot":1}\n', encoding="utf-8")
    lineage = directory / "lineage"
    publish_source_lineage(
        (_node("wikidata:P1"), _node("wikidata:P2", extends=("wikidata:P1",))),
        cards_directory=cards,
        output_directory=lineage,
        producer="test.wikidata-lineage",
        snapshot=snapshot,
        raw_inputs={"source.json": raw},
    )
    return cards, lineage


def test_lineage_models_enforce_strict_schema_and_canonical_edge_order() -> None:
    valid = {
        "schema_version": 1,
        "relation_id": "wikidata:P3",
        "extends": ("wikidata:P1", "wikidata:P2"),
        "inverse_edges": (),
    }
    assert LineageNode.model_validate(valid, strict=True).relation_id == "wikidata:P3"

    with pytest.raises(ValidationError, match="schema_version"):
        LineageNode.model_validate({**valid, "schema_version": "1"}, strict=True)
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        LineageNode.model_validate({**valid, "unexpected": True}, strict=True)
    with pytest.raises(ValidationError, match="inverse_edges"):
        LineageNode.model_validate(
            {key: value for key, value in valid.items() if key != "inverse_edges"}
        )
    with pytest.raises(ValidationError, match="ascending relation_id order"):
        _node("wikidata:P3", extends=("wikidata:P2", "wikidata:P1"))
    with pytest.raises(ValidationError, match="must not contain duplicates"):
        _node("wikidata:P3", extends=("wikidata:P1", "wikidata:P1"))
    with pytest.raises(ValidationError, match="self-reference"):
        _node("wikidata:P3", extends=("wikidata:P3",))
    with pytest.raises(ValidationError, match=r"ascending \(kind, relation_id\) order"):
        _node("wikidata:P3", inverse=("wikidata:P2", "wikidata:P1"))
    with pytest.raises(ValidationError, match="duplicate facts"):
        _node("wikidata:P3", inverse=("wikidata:P1", "wikidata:P1"))
    with pytest.raises(ValidationError, match="self-reference"):
        _node("wikidata:P3", inverse=("wikidata:P3",))


@pytest.mark.parametrize(
    ("nodes", "message"),
    [
        (
            (_node("wikidata:P2"), _node("wikidata:P1")),
            "ascending relation_id order",
        ),
        (
            (_node("wikidata:P1"), _node("wikidata:P1")),
            "must not repeat relation_id",
        ),
        (
            (_node("wikidata:P1", extends=("wikidata:P2",)),),
            "has no target node",
        ),
        (
            (
                _node("wikidata:P1", extends=("wikidata:P2",)),
                _node("wikidata:P2", extends=("wikidata:P1",)),
            ),
            "contains a cycle",
        ),
    ],
)
def test_validate_lineage_nodes_rejects_invalid_graphs(
    nodes: tuple[LineageNode, ...],
    message: str,
) -> None:
    with pytest.raises(ValueError, match=message):
        validate_lineage_nodes(
            nodes,
            source_namespace="wikidata",
            policy=SourceLineagePolicy(inverse_edge_kinds=()),
        )


def test_validate_lineage_nodes_rejects_missing_inverse_target() -> None:
    with pytest.raises(ValueError, match=r"inverse edge .* has no target node"):
        validate_lineage_nodes(
            (_node("wikidata:P1", inverse=("wikidata:P2",)),),
            source_namespace="wikidata",
            policy=SourceLineagePolicy(
                inverse_edge_kinds=(WIKIDATA_INVERSE_EDGE_KIND,),
            ),
        )


def test_validate_lineage_nodes_accepts_multiple_inheritance_dag() -> None:
    nodes = (
        _node("wikidata:P1"),
        _node("wikidata:P2"),
        _node("wikidata:P3", extends=("wikidata:P1", "wikidata:P2")),
    )

    assert (
        validate_lineage_nodes(
            nodes,
            source_namespace="wikidata",
            policy=SourceLineagePolicy(inverse_edge_kinds=()),
        )
        == nodes
    )


def test_publish_and_verify_source_lineage_binds_real_cards_and_raw_inputs(
    tmp_path: Path,
) -> None:
    snapshot = SourceSnapshotIdentity(kind="wikidata-dump", value={"revision": 42})
    cards = _write_card_set(
        tmp_path / "cards",
        namespace="wikidata",
        local_id_field="pid",
        rows=(("P1", "one"), ("P2", "two"), ("P3", "three")),
        snapshot=snapshot,
    )
    raw = tmp_path / "wikidata-properties.json"
    raw.write_text('{"revision":42}\n', encoding="utf-8")
    nodes = (
        _node("wikidata:P1", inverse=("wikidata:P2",)),
        _node("wikidata:P2"),
        _node("wikidata:P3", extends=("wikidata:P1", "wikidata:P2")),
    )
    paths = publish_source_lineage(
        nodes,
        cards_directory=cards,
        output_directory=tmp_path / "lineage",
        producer="test.wikidata-lineage",
        snapshot=snapshot,
        raw_inputs={"wikidata-properties.json": raw},
        inverse_edge_kinds=(WIKIDATA_INVERSE_EDGE_KIND,),
    )
    verified = verify_source_lineage(paths.lineage_jsonl.parent)

    expected_payload = b"".join(canonical_json_bytes(node) + b"\n" for node in nodes)
    assert paths.lineage_jsonl.read_bytes() == expected_payload
    assert verified.nodes == nodes
    assert verified.lineage_hash == sha256_bytes(expected_payload)
    assert verified.manifest_hash == sha256_file(paths.manifest)
    assert verified.manifest.producer == "test.wikidata-lineage"
    assert verified.manifest.details.snapshot == snapshot
    assert verified.manifest.details.counts.model_dump() == {
        "nodes": 3,
        "extends_edges": 2,
        "inverse_edges": 1,
    }
    input_hashes = verified.manifest.input_hashes
    assert input_hashes == {
        "cards.jsonl": sha256_file(cards / "cards.jsonl"),
        "cards.manifest.json": sha256_file(cards / "cards.manifest.json"),
        "wikidata-properties.json": sha256_file(raw),
    }
    assert input_hashes is not None
    details = verified.manifest.details
    assert details.artifact_id == source_lineage_artifact_id(
        source=details.relation_source,
        snapshot=details.snapshot,
        policy=details.edge_policy,
        input_hashes=input_hashes,
        lineage_hash=verified.lineage_hash,
    )


def test_publish_source_lineage_requires_matching_snapshot_and_raw_input(
    tmp_path: Path,
) -> None:
    snapshot = SourceSnapshotIdentity(kind="test", value={"revision": 1})
    cards = _write_card_set(
        tmp_path / "cards",
        namespace="wikidata",
        local_id_field="pid",
        rows=(("P1", "one"),),
        snapshot=snapshot,
    )
    raw = tmp_path / "source.json"
    raw.write_text("{}\n", encoding="utf-8")

    with pytest.raises(ValueError, match="snapshot differs"):
        publish_source_lineage(
            (_node("wikidata:P1"),),
            cards_directory=cards,
            output_directory=tmp_path / "mismatched",
            producer="test.lineage",
            snapshot=SourceSnapshotIdentity(kind="test", value={"revision": 2}),
            raw_inputs={"source.json": raw},
        )

    with pytest.raises(ValueError, match="identity-bearing raw input"):
        publish_source_lineage(
            (_node("wikidata:P1"),),
            cards_directory=cards,
            output_directory=tmp_path / "missing-raw",
            producer="test.lineage",
            snapshot=snapshot,
            raw_inputs={},
        )


@pytest.mark.parametrize(
    ("damage", "message"),
    [
        ("blank", "must not be blank"),
        ("missing-newline", "must end with a newline"),
        ("coerced-schema", "invalid .* line 1"),
        ("row-order", "strictly ascending relation_id order"),
    ],
)
def test_verify_source_lineage_rejects_noncanonical_rows(
    tmp_path: Path,
    damage: str,
    message: str,
) -> None:
    _, lineage = _publish_basic_lineage(tmp_path)
    path = lineage / "lineage.jsonl"
    payload = path.read_bytes()
    lines = payload.splitlines(keepends=True)
    if damage == "blank":
        damaged = payload + b"\n"
    elif damage == "missing-newline":
        damaged = payload.rstrip(b"\n")
    elif damage == "coerced-schema":
        damaged = payload.replace(b'"schema_version":1', b'"schema_version":"1"', 1)
    else:
        damaged = b"".join(reversed(lines))
    path.write_bytes(damaged)

    with pytest.raises(ValueError, match=message):
        verify_source_lineage(lineage)


def test_verify_source_lineage_rejects_tampered_bytes_and_stale_counts(tmp_path: Path) -> None:
    _, lineage = _publish_basic_lineage(tmp_path)
    lineage_path = lineage / "lineage.jsonl"
    original = lineage_path.read_bytes()
    lineage_path.write_bytes(original.replace(b"wikidata:P2", b"wikidata:P9"))
    with pytest.raises(ValueError, match="does not match the content hash"):
        verify_source_lineage(lineage)

    lineage_path.write_bytes(original)
    manifest_path = lineage / "lineage.manifest.json"
    manifest = json.loads(manifest_path.read_bytes())
    manifest["details"]["counts"]["nodes"] = 99
    manifest_path.write_text(
        json.dumps(manifest, sort_keys=True, indent=2) + "\n", encoding="utf-8"
    )
    with pytest.raises(ValueError, match="source lineage counts differ"):
        verify_source_lineage(lineage)


def test_publish_source_lineage_rejects_tampered_leaf_and_existing_destination(
    tmp_path: Path,
) -> None:
    snapshot = SourceSnapshotIdentity(kind="test", value=1)
    raw = tmp_path / "source.json"
    raw.write_text("{}\n", encoding="utf-8")
    cards = _write_card_set(
        tmp_path / "cards",
        namespace="wikidata",
        local_id_field="pid",
        rows=(("P1", "one"),),
        snapshot=snapshot,
    )
    (cards / "cards.jsonl").write_bytes((cards / "cards.jsonl").read_bytes() + b"\n")
    with pytest.raises(ValueError, match="does not match its card manifest"):
        publish_source_lineage(
            (_node("wikidata:P1"),),
            cards_directory=cards,
            output_directory=tmp_path / "tampered-out",
            producer="test.lineage",
            snapshot=snapshot,
            raw_inputs={"source.json": raw},
        )

    clean_cards = _write_card_set(
        tmp_path / "clean-cards",
        namespace="wikidata",
        local_id_field="pid",
        rows=(("P1", "one"),),
        snapshot=snapshot,
    )
    destination = tmp_path / "existing"
    destination.mkdir()
    sentinel = destination / "lineage.jsonl"
    sentinel.write_text("winner\n", encoding="utf-8")
    with pytest.raises(FileExistsError, match="already contains an artifact"):
        publish_source_lineage(
            (_node("wikidata:P1"),),
            cards_directory=clean_cards,
            output_directory=destination,
            producer="test.lineage",
            snapshot=snapshot,
            raw_inputs={"source.json": raw},
        )
    assert sentinel.read_text(encoding="utf-8") == "winner\n"


def test_publish_source_lineage_cleans_partial_files_after_failed_verification(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    snapshot = SourceSnapshotIdentity(kind="test", value=1)
    raw = tmp_path / "source.json"
    raw.write_text("{}\n", encoding="utf-8")
    cards = _write_card_set(
        tmp_path / "cards",
        namespace="wikidata",
        local_id_field="pid",
        rows=(("P1", "one"),),
        snapshot=snapshot,
    )
    destination = tmp_path / "lineage"

    def reject_publication(_directory: object) -> None:
        raise RuntimeError("staged verification failed")

    monkeypatch.setattr(lineage_module, "verify_source_lineage", reject_publication)
    with pytest.raises(RuntimeError, match="staged verification failed"):
        publish_source_lineage(
            (_node("wikidata:P1"),),
            cards_directory=cards,
            output_directory=destination,
            producer="test.lineage",
            snapshot=snapshot,
            raw_inputs={"source.json": raw},
        )

    assert destination.is_dir()
    assert not (destination / "lineage.jsonl").exists()
    assert not (destination / "lineage.manifest.json").exists()
