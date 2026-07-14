"""Behavioral tests for reviewed relation-family deck enrichment."""

from pathlib import Path

import pytest
from pydantic import JsonValue

from atlas_tools.common import Provenance, canonical_json_bytes, sha256_bytes, sha256_file
from atlas_tools.relation.concat import (
    FAMILY_OVERLAY_ALGORITHM,
    ConcatCardRow,
    ConcatProvenance,
    concat_relations,
    verify_concat_artifact,
)
from atlas_tools.relation.evaluation.storage.deck import load_deck
from atlas_tools.relation.family_overlay import (
    FamilyAssignment,
    apply_family_overlay,
)
from atlas_tools.relation_cards.common.cards import (
    CardRow,
    RelationSourceSpec,
    qualify_relation_id,
)


def _write_leaf(
    directory: Path,
    rows: list[tuple[str, str, str | None]],
) -> Path:
    directory.mkdir()
    cards_path = directory / "cards.jsonl"
    cards: list[CardRow] = []
    for pid, text, family_id in rows:
        payload: dict[str, JsonValue] = {
            "pid": pid,
            "relation_id": qualify_relation_id("wikidata", pid),
            "card_text": text,
            "card_hash": sha256_bytes(text.encode("utf-8")),
            "token_count": len(text.split()),
            "truncations": [],
            "severely_truncated": False,
            "prescreen_stratum": "property",
            "pilot_strata": ["wikidata"],
        }
        if family_id is not None:
            payload["family_id"] = family_id
        cards.append(CardRow.model_validate(payload))

    cards_path.write_bytes(b"".join(canonical_json_bytes(row) + b"\n" for row in cards))
    Provenance[JsonValue, JsonValue].make(
        producer="wikidata.render-cards",
        content_hashes={"cards.jsonl": sha256_file(cards_path)},
        details={
            "relation_source": RelationSourceSpec(
                namespace="wikidata",
                local_id_field="pid",
            ).model_dump(mode="json")
        },
    ).write(directory / "cards.manifest.json")
    return directory


def _deck(
    tmp_path: Path,
    rows: list[tuple[str, str, str | None]] | None = None,
) -> Path:
    leaf = _write_leaf(
        tmp_path / "leaf",
        rows
        or [
            ("P155", "follows", None),
            ("P156", "followed by", None),
        ],
    )
    return concat_relations([leaf], out=tmp_path / "source").cards_jsonl.parent


def _rows(deck: Path) -> list[ConcatCardRow]:
    return list(verify_concat_artifact(deck).rows())


def _write_assignments(
    path: Path,
    rows: list[tuple[ConcatCardRow, str]],
) -> Path:
    path.write_bytes(
        b"".join(
            canonical_json_bytes(
                FamilyAssignment(
                    schema_version=1,
                    relation_id=row.relation_id,
                    card_hash=row.card_hash,
                    family_id=family_id,
                )
            )
            + b"\n"
            for row, family_id in rows
        )
    )
    return path


def test_family_overlay_preserves_cards_and_binds_its_reviewed_input(tmp_path: Path) -> None:
    source = _deck(tmp_path)
    source_rows = _rows(source)
    assignments = _write_assignments(
        tmp_path / "families.jsonl",
        [(source_rows[1], "wikidata:sequence"), (source_rows[0], "wikidata:sequence")],
    )

    result = apply_family_overlay(source, assignments, out=tmp_path / "enriched")

    enriched_rows = _rows(result.cards_jsonl.parent)
    assert [(row.relation_id, row.card_text, row.card_hash) for row in enriched_rows] == [
        (row.relation_id, row.card_text, row.card_hash) for row in source_rows
    ]
    assert [row.model_extra for row in enriched_rows] == [
        {
            **(row.model_extra or {}),
            "family_id": "wikidata:sequence",
        }
        for row in source_rows
    ]
    loaded_deck = load_deck(result.cards_jsonl.parent)
    assert tuple(card.family_id for card in loaded_deck.cards) == (
        "wikidata:sequence",
        "wikidata:sequence",
    )

    source_artifact = verify_concat_artifact(source)
    manifest = ConcatProvenance.load(result.manifest)
    assert manifest.details.family_overlay is not None
    assert manifest.details.family_overlay.algorithm == FAMILY_OVERLAY_ALGORITHM
    assert manifest.details.family_overlay.assignment_count == 2
    assert manifest.details.family_overlay.family_count == 1
    assert manifest.details.inputs[0].cards_hash == source_artifact.cards_hash
    assert manifest.details.inputs[0].manifest_hash == source_artifact.manifest_hash
    assert manifest.input_hashes == {
        f"inputs/{source_artifact.artifact_id}/cards.jsonl": source_artifact.cards_hash,
        f"inputs/{source_artifact.artifact_id}/cards.manifest.json": (
            source_artifact.manifest_hash
        ),
        "family-overlay/assignments.jsonl": sha256_file(assignments),
    }


def test_family_overlay_rejects_stale_card_binding_without_publishing(tmp_path: Path) -> None:
    source = _deck(tmp_path)
    rows = _rows(source)
    assignments = _write_assignments(
        tmp_path / "families.jsonl",
        [(rows[0], "sequence"), (rows[1], "sequence")],
    )
    original = assignments.read_bytes()
    assignments.write_bytes(original.replace(rows[0].card_hash.encode("ascii"), b"0" * 64))
    destination = tmp_path / "enriched"

    with pytest.raises(ValueError, match="binds card_hash"):
        apply_family_overlay(source, assignments, out=destination)

    assert not destination.exists()
    assert list(tmp_path.glob(".enriched.family-overlay-*")) == []


def test_family_overlay_requires_exact_deck_coverage(tmp_path: Path) -> None:
    source = _deck(tmp_path)
    rows = _rows(source)
    assignments = _write_assignments(
        tmp_path / "families.jsonl",
        [(rows[0], "sequence")],
    )
    with assignments.open("ab") as output:
        output.write(
            canonical_json_bytes(
                FamilyAssignment(
                    schema_version=1,
                    relation_id="wikidata:P999999",
                    card_hash="0" * 64,
                    family_id="unseen",
                )
            )
            + b"\n"
        )

    with pytest.raises(
        ValueError,
        match=r"missing 1 deck relations.*contains 1 relations absent from the deck",
    ):
        apply_family_overlay(source, assignments, out=tmp_path / "enriched")


def test_family_overlay_rejects_duplicate_assignments(tmp_path: Path) -> None:
    source = _deck(tmp_path)
    rows = _rows(source)
    assignments = _write_assignments(
        tmp_path / "families.jsonl",
        [(rows[0], "sequence"), (rows[0], "sequence"), (rows[1], "sequence")],
    )

    with pytest.raises(ValueError, match="duplicate family assignment for wikidata:P155"):
        apply_family_overlay(source, assignments, out=tmp_path / "enriched")


def test_family_overlay_rejects_existing_family_conflict(tmp_path: Path) -> None:
    source = _deck(
        tmp_path,
        rows=[
            ("P155", "follows", "sequence"),
            ("P156", "followed by", "sequence"),
        ],
    )
    rows = _rows(source)
    assignments = _write_assignments(
        tmp_path / "families.jsonl",
        [(rows[0], "timeline"), (rows[1], "sequence")],
    )

    with pytest.raises(ValueError, match="conflicts with existing family_id 'sequence'"):
        apply_family_overlay(source, assignments, out=tmp_path / "enriched")


def test_family_overlay_never_replaces_an_existing_destination(tmp_path: Path) -> None:
    source = _deck(tmp_path)
    rows = _rows(source)
    assignments = _write_assignments(
        tmp_path / "families.jsonl",
        [(rows[0], "sequence"), (rows[1], "sequence")],
    )
    destination = tmp_path / "enriched"
    destination.mkdir()
    marker = destination / "owned-by-user"
    marker.write_text("keep", encoding="utf-8")

    with pytest.raises(FileExistsError, match="destination already exists"):
        apply_family_overlay(source, assignments, out=destination)

    assert marker.read_text(encoding="utf-8") == "keep"
