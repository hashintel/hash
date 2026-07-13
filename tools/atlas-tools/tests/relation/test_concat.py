"""Tests for verified, source-qualified relation-card concatenation."""

from pathlib import Path

import pytest
from pydantic import JsonValue

from atlas_tools.common import (
    Provenance,
    canonical_json_bytes,
    sha256_bytes,
    sha256_file,
)
from atlas_tools.relation.concat import (
    ConcatCardRow,
    ConcatProvenance,
    concat_relations,
)
from atlas_tools.relation_cards.common.cards import (
    CardRow,
    RelationNamespace,
    RelationSourceSpec,
    qualify_relation_id,
)


def _card(
    text: str,
    *,
    namespace: RelationNamespace,
    local_id: str,
    local_id_field: str,
) -> CardRow:
    payload: dict[str, JsonValue] = {
        "card_text": text,
        "card_hash": sha256_bytes(text.encode("utf-8")),
        "token_count": len(text.split()),
        "truncations": [],
        "severely_truncated": False,
        "relation_id": qualify_relation_id(namespace, local_id),
    }
    payload[local_id_field] = local_id
    return CardRow.model_validate(payload)


def _source_details(
    namespace: RelationNamespace,
    local_id_field: str,
    details: dict[str, JsonValue] | None = None,
) -> dict[str, JsonValue]:
    manifest_details = dict(details or {})
    manifest_details["relation_source"] = RelationSourceSpec(
        namespace=namespace,
        local_id_field=local_id_field,
    ).model_dump(mode="json")
    return manifest_details


def _write_card_set(
    directory: Path,
    *,
    producer: str,
    namespace: RelationNamespace,
    local_id_field: str,
    rows: list[tuple[str, str]],
    config: JsonValue = None,
    details: dict[str, JsonValue] | None = None,
) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    cards_path = directory / "cards.jsonl"
    cards_path.write_text(
        "".join(
            canonical_json_bytes(
                _card(
                    text,
                    namespace=namespace,
                    local_id=local_id,
                    local_id_field=local_id_field,
                )
            ).decode("utf-8")
            + "\n"
            for local_id, text in rows
        ),
        encoding="utf-8",
    )
    Provenance[JsonValue, JsonValue].make(
        producer=producer,
        content_hashes={"cards.jsonl": sha256_file(cards_path)},
        config=config,
        details=_source_details(namespace, local_id_field, details),
    ).write(directory / "cards.manifest.json")
    return directory


def _read_rows(cards_path: Path) -> list[ConcatCardRow]:
    return [
        ConcatCardRow.model_validate_json(line)
        for line in cards_path.read_text("utf-8").splitlines()
    ]


def test_concat_preserves_qualified_ids_for_same_local_id_across_namespaces(
    tmp_path: Path,
) -> None:
    wikidata = _write_card_set(
        tmp_path / "wikidata",
        producer="wikidata.render-cards",
        namespace="wikidata",
        local_id_field="pid",
        rows=[("P22", "alpha"), ("P23", "beta")],
    )
    hash_cards = _write_card_set(
        tmp_path / "hash",
        producer="hash.extract-relation-cards",
        namespace="hash",
        local_id_field="base_url",
        rows=[("P22", "gamma")],
    )

    paths = concat_relations([wikidata, hash_cards], out=tmp_path / "out")

    rows = _read_rows(paths.cards_jsonl)
    assert [(row.relation_id, row.producer, row.card_text) for row in rows] == [
        ("wikidata:P22", "wikidata", "alpha"),
        ("wikidata:P23", "wikidata", "beta"),
        ("hash:P22", "hash", "gamma"),
    ]
    assert (
        rows[0].card_hash
        == _card(
            "alpha",
            namespace="wikidata",
            local_id="P22",
            local_id_field="pid",
        ).card_hash
    )


def test_concat_manifest_records_verified_inputs_and_leaf_sources(tmp_path: Path) -> None:
    wikidata = _write_card_set(
        tmp_path / "wikidata",
        producer="wikidata.render-cards",
        namespace="wikidata",
        local_id_field="pid",
        rows=[("P22", "alpha")],
        config={"seed": 1},
        details={"rows": 1},
    )
    hash_cards = _write_card_set(
        tmp_path / "hash",
        producer="hash.extract-relation-cards",
        namespace="hash",
        local_id_field="base_url",
        rows=[("P23", "gamma")],
        config={"seed": 2},
        details={"rows": 1},
    )

    paths = concat_relations([wikidata, hash_cards], out=tmp_path / "out")

    provenance = ConcatProvenance.load(paths.manifest)
    assert provenance.producer == "relation.concat"
    assert provenance.content_hashes == {"cards.jsonl": sha256_file(paths.cards_jsonl)}
    assert provenance.details.row_count == 2
    assert set(provenance.details.sources) == {"hash", "wikidata"}

    wikidata_source = provenance.details.sources["wikidata"]
    assert wikidata_source.artifact_producer == "wikidata.render-cards"
    assert wikidata_source.local_id_field == "pid"
    assert wikidata_source.cards_hash == sha256_file(wikidata / "cards.jsonl")
    assert wikidata_source.manifest_hash == sha256_file(wikidata / "cards.manifest.json")
    assert wikidata_source.config == {"seed": 1}
    assert wikidata_source.details == _source_details("wikidata", "pid", {"rows": 1})

    hash_source = provenance.details.sources["hash"]
    assert hash_source.artifact_producer == "hash.extract-relation-cards"
    assert hash_source.local_id_field == "base_url"
    assert hash_source.cards_hash == sha256_file(hash_cards / "cards.jsonl")
    assert hash_source.manifest_hash == sha256_file(hash_cards / "cards.manifest.json")
    assert hash_source.config == {"seed": 2}
    assert hash_source.details == _source_details("hash", "base_url", {"rows": 1})

    direct_inputs = provenance.details.inputs
    assert [(item.cards_hash, item.manifest_hash) for item in direct_inputs] == [
        (sha256_file(wikidata / "cards.jsonl"), sha256_file(wikidata / "cards.manifest.json")),
        (
            sha256_file(hash_cards / "cards.jsonl"),
            sha256_file(hash_cards / "cards.manifest.json"),
        ),
    ]
    assert provenance.input_hashes == {
        path: digest
        for item in direct_inputs
        for path, digest in (
            (f"inputs/{item.artifact_id}/cards.jsonl", item.cards_hash),
            (f"inputs/{item.artifact_id}/cards.manifest.json", item.manifest_hash),
        )
    }
    assert provenance.config is not None
    assert provenance.config.source_configs == {
        "hash": {"seed": 2},
        "wikidata": {"seed": 1},
    }


def test_concat_rejects_duplicate_source_namespaces(tmp_path: Path) -> None:
    first = _write_card_set(
        tmp_path / "a",
        producer="first-renderer",
        namespace="wikidata",
        local_id_field="pid",
        rows=[("P22", "alpha")],
    )
    second = _write_card_set(
        tmp_path / "b",
        producer="second-renderer",
        namespace="wikidata",
        local_id_field="property_id",
        rows=[("P23", "beta")],
    )

    with pytest.raises(ValueError, match=r"duplicate relation source namespaces: .*wikidata"):
        concat_relations([first, second], out=tmp_path / "out")


def test_concat_creates_missing_output_directory(tmp_path: Path) -> None:
    card_set = _write_card_set(
        tmp_path / "a",
        producer="renderer",
        namespace="wikidata",
        local_id_field="pid",
        rows=[("P22", "alpha")],
    )

    paths = concat_relations([card_set], out=tmp_path / "deeply" / "nested" / "out")

    assert paths.cards_jsonl.is_file()
    assert paths.manifest.is_file()


def test_concat_rejects_tampered_cards(tmp_path: Path) -> None:
    card_set = _write_card_set(
        tmp_path / "a",
        producer="renderer",
        namespace="wikidata",
        local_id_field="pid",
        rows=[("P22", "alpha")],
    )
    with (card_set / "cards.jsonl").open("a", encoding="utf-8") as stream:
        stream.write("tampered\n")

    with pytest.raises(ValueError, match="does not match the content hash"):
        concat_relations([card_set], out=tmp_path / "out")


def test_concat_rejects_manifest_without_cards_hash(tmp_path: Path) -> None:
    card_set = _write_card_set(
        tmp_path / "a",
        producer="renderer",
        namespace="wikidata",
        local_id_field="pid",
        rows=[("P22", "alpha")],
    )
    Provenance[JsonValue, JsonValue].make(
        producer="renderer",
        content_hashes={"other.jsonl": "0" * 64},
        details=_source_details("wikidata", "pid"),
    ).write(card_set / "cards.manifest.json")

    with pytest.raises(ValueError, match="does not record a content hash"):
        concat_relations([card_set], out=tmp_path / "out")


def test_nested_concat_preserves_leaf_source_identity(tmp_path: Path) -> None:
    wikidata = _write_card_set(
        tmp_path / "wikidata",
        producer="wikidata.render-cards",
        namespace="wikidata",
        local_id_field="pid",
        rows=[("P22", "alpha")],
    )
    hash_cards = _write_card_set(
        tmp_path / "hash",
        producer="hash.extract-relation-cards",
        namespace="hash",
        local_id_field="base_url",
        rows=[("P22", "beta")],
    )
    intermediate = concat_relations([wikidata, hash_cards], out=tmp_path / "mid")

    paths = concat_relations([intermediate.cards_jsonl.parent], out=tmp_path / "out")

    rows = _read_rows(paths.cards_jsonl)
    assert [(row.relation_id, row.producer, row.card_text) for row in rows] == [
        ("wikidata:P22", "wikidata", "alpha"),
        ("hash:P22", "hash", "beta"),
    ]
    provenance = ConcatProvenance.load(paths.manifest)
    assert set(provenance.details.sources) == {"hash", "wikidata"}
    assert provenance.details.sources["wikidata"].artifact_producer == "wikidata.render-cards"
    assert provenance.details.sources["hash"].artifact_producer == "hash.extract-relation-cards"
