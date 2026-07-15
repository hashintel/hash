"""Tests for deterministic, atomically published relation-family closures."""

import json
from collections import Counter
from pathlib import Path

import pytest
from pydantic import ValidationError

import atlas_tools.relation.family_closure.artifact as closure_artifact
from atlas_tools.common import canonical_json_bytes, sha256_bytes
from atlas_tools.relation.concat import concat_relations, verify_concat_artifact
from atlas_tools.relation.family_closure.api import (
    HASH_LINK_ROOT_RELATION_ID,
    ClosureEdgePolicy,
    FamilyAssignmentRow,
    FamilyClosureManifest,
    closure_input_hashes,
    family_closure_artifact_id,
    family_id_for_relations,
    publish_family_closure,
    verify_family_closure,
)
from atlas_tools.relation.lineage.api import (
    WIKIDATA_INVERSE_EDGE_KIND,
    SourceSnapshotIdentity,
    publish_source_lineage,
)
from tests.relation.test_lineage import _node, _write_card_set

_HASH_ALPHA_LOCAL = "https://hash.ai/@h/types/entity-type/alpha/v/1"
_HASH_BETA_LOCAL = "https://hash.ai/@h/types/entity-type/beta/v/1"
_HASH_ALPHA = f"hash:{_HASH_ALPHA_LOCAL}"
_HASH_BETA = f"hash:{_HASH_BETA_LOCAL}"
_WIKIDATA_DEPENDENCY = "wikidata:P0"
_WIKIDATA_DECK = ("wikidata:P1", "wikidata:P2", "wikidata:P3")
_GOLDEN_PAIR_FAMILY_ID = (
    "lineage-v1:79d6813d5771fef67ca26a364f9c2821e530d4d783e167a347f87e5bb010aa88"
)


def _publish_inputs(directory: Path) -> tuple[Path, tuple[Path, Path]]:
    hash_snapshot = SourceSnapshotIdentity(kind="hash-schema", value={"revision": 7})
    wikidata_snapshot = SourceSnapshotIdentity(
        kind="wikidata-dump",
        value={"revision": 42},
    )
    hash_cards = _write_card_set(
        directory / "hash-cards",
        namespace="hash",
        local_id_field="base_url",
        rows=((_HASH_ALPHA_LOCAL, "alpha"), (_HASH_BETA_LOCAL, "beta")),
        snapshot=hash_snapshot,
    )
    wikidata_cards = _write_card_set(
        directory / "wikidata-cards",
        namespace="wikidata",
        local_id_field="pid",
        rows=(("P1", "one"), ("P2", "two"), ("P3", "three")),
        snapshot=wikidata_snapshot,
    )
    concat = concat_relations(
        (hash_cards, wikidata_cards),
        out=directory / "cards",
    ).cards_jsonl.parent

    hash_nodes = tuple(
        sorted(
            (
                _node(HASH_LINK_ROOT_RELATION_ID),
                _node(_HASH_ALPHA, extends=(HASH_LINK_ROOT_RELATION_ID,)),
                _node(_HASH_BETA, extends=(HASH_LINK_ROOT_RELATION_ID,)),
            ),
            key=lambda node: node.relation_id,
        )
    )
    hash_raw = directory / "hash-source.json"
    hash_raw.write_text("{}\n", encoding="utf-8")
    hash_lineage = directory / "hash-lineage"
    publish_source_lineage(
        hash_nodes,
        cards_directory=hash_cards,
        output_directory=hash_lineage,
        producer="test.hash-lineage",
        snapshot=hash_snapshot,
        raw_inputs={"hash-source.json": hash_raw},
    )

    wikidata_raw = directory / "wikidata-source.json"
    wikidata_raw.write_text("{}\n", encoding="utf-8")
    wikidata_lineage = directory / "wikidata-lineage"
    publish_source_lineage(
        (
            _node(_WIKIDATA_DEPENDENCY),
            _node(
                "wikidata:P1",
                extends=(_WIKIDATA_DEPENDENCY,),
                inverse=("wikidata:P2",),
            ),
            _node(
                "wikidata:P2",
                extends=(_WIKIDATA_DEPENDENCY,),
                inverse=("wikidata:P1",),
            ),
            _node(
                "wikidata:P3",
                extends=("wikidata:P1", "wikidata:P2"),
            ),
        ),
        cards_directory=wikidata_cards,
        output_directory=wikidata_lineage,
        producer="test.wikidata-lineage",
        snapshot=wikidata_snapshot,
        raw_inputs={"wikidata-source.json": wikidata_raw},
        inverse_edge_kinds=(WIKIDATA_INVERSE_EDGE_KIND,),
    )
    return concat, (wikidata_lineage, hash_lineage)


def _publish_closure(directory: Path) -> tuple[Path, tuple[Path, Path], Path]:
    cards, lineages = _publish_inputs(directory)
    closure = directory / "closure"
    publish_family_closure(cards, lineages, output_directory=closure)
    return cards, lineages, closure


def _rewrite_closure_rows(directory: Path, rows: tuple[FamilyAssignmentRow, ...]) -> None:
    rows = tuple(sorted(rows, key=lambda row: row.relation_id))
    families_payload = b"".join(canonical_json_bytes(row) + b"\n" for row in rows)
    families_hash = sha256_bytes(families_payload)
    manifest_path = directory / "families.manifest.json"
    manifest = FamilyClosureManifest.load(manifest_path)
    component_sizes = Counter(row.family_id for row in rows)
    counts = manifest.details.counts.model_copy(
        update={
            "cards": len(rows),
            "components": len(component_sizes),
            "largest_component": max(component_sizes.values(), default=0),
        }
    )
    provisional = manifest.details.model_copy(
        update={
            "families_hash": families_hash,
            "counts": counts,
        }
    )
    input_hashes = closure_input_hashes(provisional)
    details = provisional.model_copy(
        update={
            "artifact_id": family_closure_artifact_id(
                policy=provisional.edge_policy,
                input_hashes=input_hashes,
                families_hash=families_hash,
            )
        }
    )
    rewritten = manifest.model_copy(
        update={
            "content_hashes": {"families.jsonl": families_hash},
            "input_hashes": input_hashes,
            "details": details,
        }
    )
    (directory / "families.jsonl").write_bytes(families_payload)
    rewritten.write(manifest_path)


def test_closure_models_enforce_strict_schema_and_component_order() -> None:
    family_id = family_id_for_relations(("wikidata:P1",))
    valid = {
        "schema_version": 1,
        "relation_id": "wikidata:P1",
        "card_hash": "0" * 64,
        "family_id": family_id,
    }
    assert FamilyAssignmentRow.model_validate(valid, strict=True).family_id == family_id
    with pytest.raises(ValidationError, match="schema_version"):
        FamilyAssignmentRow.model_validate({**valid, "schema_version": "1"}, strict=True)
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        FamilyAssignmentRow.model_validate({**valid, "unexpected": True}, strict=True)
    with pytest.raises(ValidationError, match="must not contain duplicates"):
        ClosureEdgePolicy(
            root_exclusions=(HASH_LINK_ROOT_RELATION_ID, HASH_LINK_ROOT_RELATION_ID),
        )
    with pytest.raises(ValidationError, match="unsupported root exclusions"):
        ClosureEdgePolicy(root_exclusions=("hash:https://example.com/root",))

    with pytest.raises(ValueError, match="at least one deck relation"):
        family_id_for_relations(())
    with pytest.raises(ValueError, match="ascending order"):
        family_id_for_relations(("wikidata:P2", "wikidata:P1"))
    with pytest.raises(ValueError, match="duplicates"):
        family_id_for_relations(("wikidata:P1", "wikidata:P1"))


def test_family_id_has_a_deterministic_golden_value() -> None:
    assert family_id_for_relations(("wikidata:P1", "wikidata:P2")) == _GOLDEN_PAIR_FAMILY_ID


def test_publish_family_closure_projects_exact_deck_with_graph_semantics(
    tmp_path: Path,
) -> None:
    cards, _, closure = _publish_closure(tmp_path)
    verified = verify_family_closure(closure, concat_directory=cards)
    deck = {row.relation_id: row.card_hash for row in verify_concat_artifact(cards).rows()}
    assignments = {row.relation_id: row for row in verified.rows}

    assert tuple(row.relation_id for row in verified.rows) == tuple(sorted(deck))
    assert {relation_id: row.card_hash for relation_id, row in assignments.items()} == deck
    assert _WIKIDATA_DEPENDENCY not in assignments
    assert HASH_LINK_ROOT_RELATION_ID not in assignments

    wikidata_families = {assignments[relation_id].family_id for relation_id in _WIKIDATA_DECK}
    assert len(wikidata_families) == 1
    assert assignments[_HASH_ALPHA].family_id != assignments[_HASH_BETA].family_id
    assert assignments[_HASH_ALPHA].family_id not in wikidata_families
    assert assignments[_HASH_BETA].family_id not in wikidata_families

    details = verified.manifest.details
    assert details.edge_policy.root_exclusions == (HASH_LINK_ROOT_RELATION_ID,)
    assert tuple(source.namespace for source in details.source_lineages) == ("hash", "wikidata")
    assert details.counts.model_dump() == {
        "cards": 5,
        "lineage_nodes": 7,
        "direct_edges": 6,
        "excluded_edges": 2,
        "inverse_edges": 1,
        "components": 3,
        "largest_component": 3,
    }
    assert (closure / "families.jsonl").read_bytes() == b"".join(
        canonical_json_bytes(row) + b"\n" for row in verified.rows
    )


def test_closure_manifest_rejects_coercion_and_noncanonical_source_order(
    tmp_path: Path,
) -> None:
    _, _, closure = _publish_closure(tmp_path)
    manifest_path = closure / "families.manifest.json"
    original = manifest_path.read_bytes()

    coerced = json.loads(original)
    coerced["details"]["schema_version"] = "1"
    manifest_path.write_text(json.dumps(coerced, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    with pytest.raises(ValueError, match="invalid family closure manifest"):
        verify_family_closure(closure)

    manifest_path.write_bytes(original)
    unsorted = json.loads(original)
    unsorted["details"]["source_lineages"].reverse()
    manifest_path.write_text(
        json.dumps(unsorted, sort_keys=True, indent=2) + "\n", encoding="utf-8"
    )
    with pytest.raises(ValueError, match="source_lineages must use ascending namespace order"):
        verify_family_closure(closure)


@pytest.mark.parametrize(
    ("damage", "message"),
    [
        ("blank", "must not be blank"),
        ("missing-newline", "must end with a newline"),
        ("coerced-schema", "invalid .* line 1"),
        ("row-order", "strictly ascending relation_id order"),
    ],
)
def test_verify_family_closure_rejects_noncanonical_rows(
    tmp_path: Path,
    damage: str,
    message: str,
) -> None:
    _, _, closure = _publish_closure(tmp_path)
    path = closure / "families.jsonl"
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
        verify_family_closure(closure)


def test_verify_family_closure_rejects_tampered_assignment_bytes(tmp_path: Path) -> None:
    _, _, closure = _publish_closure(tmp_path)
    verified = verify_family_closure(closure)
    damaged_rows = (
        verified.rows[0].model_copy(update={"card_hash": "0" * 64}),
        *verified.rows[1:],
    )
    (closure / "families.jsonl").write_bytes(
        b"".join(canonical_json_bytes(row) + b"\n" for row in damaged_rows)
    )

    with pytest.raises(ValueError, match="does not match the content hash"):
        verify_family_closure(closure)


@pytest.mark.parametrize(
    ("damage", "message"),
    [
        ("missing", "deck coverage differs"),
        ("extra", "deck coverage differs"),
        ("stale-hash", "stale card hashes"),
    ],
)
def test_concat_binding_requires_exact_relation_and_card_hash_coverage(
    tmp_path: Path,
    damage: str,
    message: str,
) -> None:
    cards, _, closure = _publish_closure(tmp_path)
    rows = verify_family_closure(closure).rows
    if damage == "missing":
        damaged = tuple(row for row in rows if row.relation_id != _HASH_BETA)
    elif damage == "extra":
        damaged = (
            *rows,
            FamilyAssignmentRow(
                relation_id=_WIKIDATA_DEPENDENCY,
                card_hash="0" * 64,
                family_id=family_id_for_relations((_WIKIDATA_DEPENDENCY,)),
            ),
        )
    else:
        damaged = (
            rows[0].model_copy(update={"card_hash": "0" * 64}),
            *rows[1:],
        )
    _rewrite_closure_rows(closure, damaged)

    verify_family_closure(closure)
    with pytest.raises(ValueError, match=message):
        verify_family_closure(closure, concat_directory=cards)


def test_publish_family_closure_rejects_existing_destination_and_preserves_race_winner(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cards, lineages = _publish_inputs(tmp_path)
    existing = tmp_path / "existing"
    existing.mkdir()
    sentinel = existing / "winner"
    sentinel.write_text("first\n", encoding="utf-8")
    with pytest.raises(FileExistsError, match="destination already exists"):
        publish_family_closure(cards, lineages, output_directory=existing)
    assert sentinel.read_text(encoding="utf-8") == "first\n"

    racing_destination = tmp_path / "race" / "closure"

    def lose_publication_race(_source: Path, destination: Path) -> None:
        destination.mkdir(parents=True)
        (destination / "winner").write_text("other publisher\n", encoding="utf-8")
        raise FileExistsError("lost publication race")

    monkeypatch.setattr(closure_artifact.os, "rename", lose_publication_race)
    with pytest.raises(FileExistsError, match="lost publication race"):
        publish_family_closure(cards, lineages, output_directory=racing_destination)

    assert (racing_destination / "winner").read_text(encoding="utf-8") == "other publisher\n"
    assert list(racing_destination.parent.glob(".closure.staging-*")) == []


def test_publish_family_closure_cleans_staging_if_inputs_change_during_publication(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cards, lineages = _publish_inputs(tmp_path)
    destination = tmp_path / "published" / "closure"
    original_sync = closure_artifact._sync_directory
    changed = False

    def change_input_after_staging(path: Path) -> None:
        nonlocal changed
        original_sync(path)
        if path.name.startswith(".closure.staging-") and not changed:
            cards_path = cards / "cards.jsonl"
            cards_path.write_bytes(cards_path.read_bytes() + b"\n")
            changed = True

    monkeypatch.setattr(closure_artifact, "_sync_directory", change_input_after_staging)
    with pytest.raises(ValueError, match="inputs changed during publication"):
        publish_family_closure(cards, lineages, output_directory=destination)

    assert not destination.exists()
    assert list(destination.parent.glob(".closure.staging-*")) == []
