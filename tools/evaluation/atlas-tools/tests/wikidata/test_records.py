"""records.jsonl decoupling tests: extraction is separated from card
formatting; rendering is a pure, transport-free projection of records."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from atlas_tools.wikidata.cache import CachingTransport
from atlas_tools.wikidata.cards import ExtractPaths, emit_cards, render_cards
from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.model import Constraints, Example, PropertyRecord
from atlas_tools.wikidata.properties import extract_properties
from atlas_tools.wikidata.records import load_records
from atlas_tools.wikidata.transport import FixtureTransport
from tests.wikidata.conftest import CONFIG_PATH, RESPONSES


def _extract(
    out_dir: Path, cache_dir: Path | None = None
) -> tuple[Config, ExtractPaths]:
    config = Config.load(CONFIG_PATH)
    transport = FixtureTransport(RESPONSES)
    if cache_dir is not None:
        transport = CachingTransport(
            transport, cache_dir, snapshot_date=config.extraction.snapshot_date
        )
    result = extract_properties(config, transport)
    return config, emit_cards(result, config, out_dir)


def test_render_cards_reproduces_extract_cards_byte_identically(tmp_path):
    config, extract_paths = _extract(tmp_path / "extract")

    record_set = load_records(tmp_path / "extract")
    render_paths = render_cards(record_set, config, tmp_path / "render")

    assert (
        render_paths.cards_jsonl.read_bytes()
        == extract_paths.cards.cards_jsonl.read_bytes()
    )

    # Manifests agree except the wall-clock provenance timestamp.
    def manifest(path: Path) -> dict[str, object]:
        data = json.loads(path.read_text(encoding="utf-8"))
        data.pop("created_at")
        return data

    assert manifest(render_paths.manifest) == manifest(extract_paths.cards.manifest)


def test_render_cards_never_constructs_a_transport(tmp_path, monkeypatch):
    config, _ = _extract(tmp_path / "extract")

    def _explode(self, *args: object, **kwargs: object) -> None:
        raise AssertionError("transport constructed during render-cards")

    import atlas_tools.wikidata.transport as transport_module

    monkeypatch.setattr(transport_module.RequestsTransport, "__init__", _explode)
    monkeypatch.setattr(transport_module.FixtureTransport, "__init__", _explode)
    monkeypatch.setattr(CachingTransport, "__init__", _explode)

    # A different token budget changes the projection, from the same records,
    # with zero transport/network involvement.
    tiny_cards = config.cards.model_copy(
        update={"token_budget": 40, "hard_token_budget": 60}
    )
    tiny = config.model_copy(update={"cards": tiny_cards})
    record_set = load_records(tmp_path / "extract" / "records.jsonl")
    paths = render_cards(record_set, tiny, tmp_path / "tiny")

    baseline = (tmp_path / "extract" / "cards.jsonl").read_bytes()
    assert paths.cards_jsonl.read_bytes() != baseline
    rows = [
        json.loads(line)
        for line in paths.cards_jsonl.read_text(encoding="utf-8").splitlines()
    ]
    assert any(row["omitted_fields"] for row in rows)  # budget actually bit

    manifest = json.loads(paths.manifest.read_text(encoding="utf-8"))
    assert manifest["details"]["token_budget"] == 40
    # The manifest pins the records file it was rendered from.
    from atlas_tools.common.provenance import sha256_file

    assert manifest["input_hashes"]["records.jsonl"] == sha256_file(
        tmp_path / "extract" / "records.jsonl"
    )


def test_record_round_trip_exercising_all_fields():
    record = PropertyRecord(
        pid="P361",
        datatype="wikibase-item",
        labels={"en": "part of", "de": "ist Teil von"},
        descriptions={"en": "this item is a part of that item"},
        aliases={"en": ["contained within", "component of"], "de": ["Teil von"]},
        p31=("Q107738",),
        ancestors=("P9005",),
        inverse_pid="P527",
        constraints=Constraints(
            symmetric=True,
            transitive=True,
            single_value=True,
            distinct_values=True,
            subject_types=("Q35120", "Q571"),
            value_types=("Q5",),
            inverse_pid="P527",
            ignored_types=("Q99999999",),
        ),
        usage_count=500000,
        examples=[
            Example(
                subject_label="Left Bank", object_label="Paris", subject_type="Q515"
            ),
            Example(subject_label="Engine", object_label="Car", subject_type=""),
        ],
        example_source="qlever",
        example_skipped=False,
        retrieved_at="2025-06-01T00:00:00+00:00",
    )
    assert PropertyRecord.model_validate(record.model_dump(mode="json")) == record
    # And through actual JSON text, as records.jsonl stores it.
    assert PropertyRecord.model_validate_json(record.model_dump_json()) == record


def test_record_round_trip_with_null_and_skip_fields():
    record = PropertyRecord(
        pid="P9002",
        datatype="wikibase-item",
        labels={"en": "sponsors"},
        example_source=None,
        example_skipped=True,
        usage_count=None,
        retrieved_at=None,
    )
    assert PropertyRecord.model_validate(record.model_dump(mode="json")) == record


def test_records_jsonl_byte_identical_across_warm_cache_reruns(tmp_path):
    cache_dir = tmp_path / "cache"
    _extract(tmp_path / "run1", cache_dir)
    _extract(tmp_path / "run2", cache_dir)

    for name in ("records.jsonl", "entity_labels.json"):
        assert (tmp_path / "run1" / name).read_bytes() == (
            tmp_path / "run2" / name
        ).read_bytes(), name

    # records.meta.json identical except the wall-clock created_at; its
    # config must be the extraction sub-config: card-format-independent.
    def meta(run: str) -> dict[str, object]:
        data = json.loads(
            (tmp_path / run / "records.meta.json").read_text(encoding="utf-8")
        )
        data.pop("created_at")
        return data

    assert meta("run1") == meta("run2")
    records_config = meta("run1")["config"]
    assert isinstance(records_config, dict)
    assert "cards" not in records_config
    assert "token_budget" not in records_config
    assert "tokenizer" not in records_config


def test_records_are_sorted_by_numeric_pid_and_stable_keys(tmp_path):
    _extract(tmp_path / "extract")
    lines = (
        (tmp_path / "extract" / "records.jsonl")
        .read_text(encoding="utf-8")
        .splitlines()
    )
    pids = [json.loads(line)["pid"] for line in lines]
    assert pids == sorted(pids, key=lambda p: int(p[1:]))
    for line in lines:
        row = json.loads(line)
        assert list(row) == sorted(row)  # canonical: sorted key order
        assert "retrieved_at" in row and "usage_count" in row


def test_load_records_rejects_missing_or_wrong_version(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_records(tmp_path)

    _extract(tmp_path / "extract")
    meta_path = tmp_path / "extract" / "records.meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta["details"]["records_format_version"] = 999
    meta_path.write_text(json.dumps(meta), encoding="utf-8")
    with pytest.raises(ValueError, match="records format version"):
        load_records(tmp_path / "extract")
