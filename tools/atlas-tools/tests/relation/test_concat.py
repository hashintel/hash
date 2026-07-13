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
from atlas_tools.relation_cards.common.cards import CardRow


def _card(text: str) -> CardRow:
    return CardRow(
        card_text=text,
        card_hash=sha256_bytes(text.encode("utf-8")),
        token_count=len(text.split()),
        truncations=[],
        severely_truncated=False,
    )


def _write_card_set(
    directory: Path,
    *,
    producer: str,
    texts: list[str],
    config: JsonValue = None,
    details: JsonValue = None,
) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    cards_path = directory / "cards.jsonl"
    cards_path.write_text(
        "".join(canonical_json_bytes(_card(text)).decode("utf-8") + "\n" for text in texts),
        encoding="utf-8",
    )
    Provenance[JsonValue, JsonValue].make(
        producer=producer,
        content_hashes={"cards.jsonl": sha256_file(cards_path)},
        config=config,
        details=details,
    ).write(directory / "cards.manifest.json")
    return directory


def _read_rows(cards_path: Path) -> list[ConcatCardRow]:
    return [
        ConcatCardRow.model_validate_json(line)
        for line in cards_path.read_text("utf-8").splitlines()
    ]


def test_concat_merges_rows_in_input_order_with_producer_tags(tmp_path: Path) -> None:
    first = _write_card_set(
        tmp_path / "a",
        producer="wikidata.render-cards",
        texts=["alpha", "beta"],
        config={"seed": 1},
        details={"rows": 2},
    )
    second = _write_card_set(
        tmp_path / "b",
        producer="hash.extract-relation-cards",
        texts=["gamma"],
        config={"seed": 2},
        details={"rows": 1},
    )

    paths = concat_relations([first, second], out=tmp_path / "out")

    rows = _read_rows(paths.cards_jsonl)
    assert [(row.producer, row.card_text) for row in rows] == [
        ("wikidata.render-cards_0", "alpha"),
        ("wikidata.render-cards_0", "beta"),
        ("hash.extract-relation-cards_1", "gamma"),
    ]
    # Producer tagging must not disturb the underlying card fields.
    assert rows[0].card_hash == _card("alpha").card_hash


def test_concat_manifest_records_inputs_and_verifies(tmp_path: Path) -> None:
    first = _write_card_set(
        tmp_path / "a",
        producer="wikidata.render-cards",
        texts=["alpha"],
        config={"seed": 1},
        details={"rows": 1},
    )
    second = _write_card_set(
        tmp_path / "b",
        producer="hash.extract-relation-cards",
        texts=["gamma"],
        config={"seed": 2},
        details={"rows": 1},
    )

    paths = concat_relations([first, second], out=tmp_path / "out")

    # Loading re-validates config_hash, so this also proves the envelope is untampered.
    provenance = ConcatProvenance.load(paths.manifest)
    assert provenance.producer == "relation.concat"

    assert provenance.content_hashes == {"cards.jsonl": sha256_file(paths.cards_jsonl)}
    assert provenance.input_hashes == {
        "wikidata.render-cards_0/cards.jsonl": sha256_file(first / "cards.jsonl"),
        "hash.extract-relation-cards_1/cards.jsonl": sha256_file(second / "cards.jsonl"),
    }

    assert provenance.config is not None
    assert provenance.config.producers == {
        "wikidata.render-cards_0": {"seed": 1},
        "hash.extract-relation-cards_1": {"seed": 2},
    }
    assert provenance.details.producers == {
        "wikidata.render-cards_0": {"rows": 1},
        "hash.extract-relation-cards_1": {"rows": 1},
    }
    assert provenance.details.input_paths == [first, second]


def test_concat_disambiguates_repeated_producers(tmp_path: Path) -> None:
    first = _write_card_set(tmp_path / "a", producer="same", texts=["alpha"])
    second = _write_card_set(tmp_path / "b", producer="same", texts=["beta"])

    paths = concat_relations([first, second], out=tmp_path / "out")

    assert [row.producer for row in _read_rows(paths.cards_jsonl)] == ["same_0", "same_1"]


def test_concat_creates_missing_output_directory(tmp_path: Path) -> None:
    card_set = _write_card_set(tmp_path / "a", producer="p", texts=["alpha"])

    paths = concat_relations([card_set], out=tmp_path / "deeply" / "nested" / "out")

    assert paths.cards_jsonl.is_file()
    assert paths.manifest.is_file()


def test_concat_rejects_tampered_cards(tmp_path: Path) -> None:
    card_set = _write_card_set(tmp_path / "a", producer="p", texts=["alpha"])
    with (card_set / "cards.jsonl").open("a", encoding="utf-8") as stream:
        stream.write("tampered\n")

    with pytest.raises(ValueError, match="does not match the content hash"):
        concat_relations([card_set], out=tmp_path / "out")


def test_concat_rejects_manifest_without_cards_hash(tmp_path: Path) -> None:
    card_set = _write_card_set(tmp_path / "a", producer="p", texts=["alpha"])
    Provenance[JsonValue, JsonValue].make(
        producer="p",
        content_hashes={"other.jsonl": "0" * 64},
        details=None,
    ).write(card_set / "cards.manifest.json")

    with pytest.raises(ValueError, match="does not record a content hash"):
        concat_relations([card_set], out=tmp_path / "out")


def test_concat_output_is_itself_a_valid_input(tmp_path: Path) -> None:
    first = _write_card_set(tmp_path / "a", producer="p", texts=["alpha"])
    intermediate = concat_relations([first], out=tmp_path / "mid")

    paths = concat_relations([intermediate.cards_jsonl.parent], out=tmp_path / "out")

    rows = _read_rows(paths.cards_jsonl)
    # Rows are re-tagged with the outer concat's producer id; the inner tag is dropped.
    assert [(row.producer, row.card_text) for row in rows] == [("relation.concat_0", "alpha")]
