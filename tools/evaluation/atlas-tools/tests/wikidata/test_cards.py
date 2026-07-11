"""Golden card tests (pinned hashes from committed fixtures) + truncation."""

from __future__ import annotations

import hashlib
import json
from types import SimpleNamespace

import pytest

from atlas_tools.wikidata.cards import (
    HeuristicTokenCounter,
    build_card,
    emit_cards,
    first_sentence,
    make_token_counter,
    slugify,
)
from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.model import Constraints, Example, PropertyRecord
from atlas_tools.wikidata.properties import extract_properties
from atlas_tools.wikidata.transport import FixtureTransport
from tests.wikidata.conftest import CONFIG_PATH, RESPONSES

# Pinned golden digests: sha256 of the UTF-8 card text bytes, generated once
# from the committed fixtures. Any change to card format v1, the fixtures,
# or the truncation/sampling logic must be a conscious re-pin.
P361_CARD_HASH = "413a7af6dd2f15c9de1cd81532da6c5a58401cdd928c7da7536ee36bcd7a4574"
P50_CARD_HASH = "c9e57945ee1f2fecd9df844f3af111461fa1cb63547a6207df759d0c3a540cd3"

FIXTURE_DATE = "2025-06-01T00:00:00+00:00"


@pytest.fixture(scope="module")
def pipeline(tmp_path_factory):
    config = Config.load(CONFIG_PATH)
    result = extract_properties(config, FixtureTransport(RESPONSES))
    out_dir = tmp_path_factory.mktemp("cards_out")
    paths = emit_cards(result, config, out_dir)
    rows = {}
    with open(paths["cards"], encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            rows[row["pid"]] = row
    with open(paths["manifest"], encoding="utf-8") as f:
        manifest = json.load(f)
    with open(paths["inventory"], encoding="utf-8") as f:
        inventory = json.load(f)
    return SimpleNamespace(
        config=config,
        result=result,
        paths=paths,
        rows=rows,
        manifest=manifest,
        inventory=inventory,
    )


class TestGoldenCards:
    def test_p361_and_p50_cards_are_byte_stable(self, pipeline):
        assert pipeline.rows["P361"]["card_hash"] == P361_CARD_HASH
        assert pipeline.rows["P50"]["card_hash"] == P50_CARD_HASH
        for pid in ("P361", "P50"):
            row = pipeline.rows[pid]
            digest = hashlib.sha256(row["card_text"].encode("utf-8")).hexdigest()
            assert digest == row["card_hash"]

    def test_rerun_is_byte_identical(self, pipeline, tmp_path):
        config = Config.load(CONFIG_PATH)
        result = extract_properties(config, FixtureTransport(RESPONSES))
        paths = emit_cards(result, config, tmp_path)
        assert paths["cards"].read_bytes() == pipeline.paths["cards"].read_bytes()

    def test_cards_are_text_not_json(self, pipeline):
        for row in pipeline.rows.values():
            assert row["card_text"].startswith("Relation: ")
            with pytest.raises(json.JSONDecodeError):
                json.loads(row["card_text"])

    def test_token_budget_respected_with_heuristic_counter(self, pipeline):
        counter = make_token_counter(pipeline.config.tokenizer)
        assert counter.name == "heuristic"
        for row in pipeline.rows.values():
            assert row["token_count"] <= pipeline.config.token_budget
            assert counter.count(row["card_text"]) == row["token_count"]

    def test_inverse_linkage_names_both_directions(self, pipeline):
        assert "Inverse: has part (P527)" in pipeline.rows["P361"]["card_text"]
        assert "Inverse: part of (P361)" in pipeline.rows["P527"]["card_text"]

    def test_retrieved_at_comes_from_response_metadata(self, pipeline):
        # The fixture Date header, not the wall clock at emit time.
        assert pipeline.rows["P361"]["retrieved_at"] == FIXTURE_DATE

    def test_manifest_hashes_match_rows(self, pipeline):
        details = pipeline.manifest["details"]
        assert details["card_format_version"] == 1
        for pid, row in pipeline.rows.items():
            assert details["cards"][pid]["card_hash"] == row["card_hash"]


class TestExclusions:
    def test_p212_excluded_from_inventory_by_datatype(self, pipeline):
        details = pipeline.inventory["details"]
        assert details["excluded"]["P212"] == "datatype:ExternalId"
        assert "P212" not in details["retained"]
        assert "P212" not in pipeline.rows

    def test_maintenance_and_deprecated_properties_excluded(self, pipeline):
        details = pipeline.inventory["details"]
        assert details["excluded"]["P9003"] == "deprecated"
        assert details["excluded"]["P9004"] == "maintenance"
        assert "P9003" not in pipeline.rows
        assert "P9004" not in pipeline.rows

    def test_usage_count_never_appears_in_card_text(self, pipeline):
        # Usage is a sampling aid only (P361 fixture usage = 500000).
        assert "500000" not in pipeline.rows["P361"]["card_text"]


class TestExampleLadder:
    def test_wdqs_timeout_falls_back_to_qlever(self, pipeline):
        flags = pipeline.manifest["details"]["flags"]
        assert flags["example_ladder_fallbacks"] == {"P9001": "qlever"}
        assert "Examples:" in pipeline.rows["P9001"]["card_text"]

    def test_both_endpoints_failing_records_skip_flag(self, pipeline):
        details = pipeline.manifest["details"]
        assert details["flags"]["example_ladder_skips"] == ["P9002"]
        assert details["counts"]["example_skips"] == 1
        assert "Examples:" not in pipeline.rows["P9002"]["card_text"]


# --- truncation ---------------------------------------------------------------

LABELS = {
    "P527": ("has part", "this item has the listed part"),
    "P1000": (
        "umbrella relation",
        "first sentence of the ancestor description. second sentence with"
        " extra ancestor detail that is expendable.",
    ),
    "Q1": ("alpha type", "first alpha sentence. second alpha sentence."),
    "Q2": ("beta type", "first beta sentence. second beta sentence."),
}

BIG = 10_000_000


def _crafted_record(n_examples: int) -> PropertyRecord:
    return PropertyRecord(
        pid="P9999",
        datatype="wikibase-item",
        labels={"en": "test relation"},
        descriptions={"en": "a synthetic relation used to exercise truncation"},
        aliases={"en": ["test rel"]},
        ancestors=("P1000",),
        inverse_pid="P527",
        constraints=Constraints(subject_types=("Q1",), value_types=("Q2",)),
        examples=[
            Example(
                subject_label=f"Subject Item Number {i:02d} With A Long Label",
                object_label=f"Object Item Number {i:02d} With A Long Label",
                subject_type=f"Q{100 + i}",
            )
            for i in range(n_examples)
        ],
    )


def _config(token_budget: int, hard_token_budget: int) -> Config:
    return Config.from_dict(
        {
            "languages": ["en"],
            "tokenizer": "heuristic",
            "token_budget": token_budget,
            "hard_token_budget": hard_token_budget,
        }
    )


def _card_examples(card_text: str) -> list[str]:
    lines = card_text.splitlines()
    return [line[2:] for line in lines if line.startswith("- ")]


def test_examples_dropped_from_end_and_recorded():
    counter = HeuristicTokenCounter()
    record = _crafted_record(10)
    full = build_card(record, LABELS, _config(BIG, BIG), counter)
    assert full.omitted_fields == ()

    budget = full.token_count - 25  # forces at least one example drop
    card = build_card(record, LABELS, _config(budget, BIG), counter)
    assert card.token_count <= budget

    dropped = [f for f in card.omitted_fields if f.startswith("example[")]
    assert dropped, "expected at least one dropped example"
    kept = 10 - len(dropped)
    # Dropped from the END: rank 9 first, then 8, ...
    assert dropped == [f"example[{i}]" for i in range(9, kept - 1, -1)]
    # Survivors are exactly the highest-diversity-rank prefix, in order.
    expected = [
        f"{ex.subject_label} -> {ex.object_label}" for ex in record.examples[:kept]
    ]
    assert _card_examples(card.card_text) == expected
    # Required fields never dropped.
    for prefix in ("Relation: ", "Description: ", "Inverse: ", "Slug: "):
        assert prefix in card.card_text
    assert not card.severely_truncated  # only a few examples lost


def test_severe_flag_when_more_than_half_of_examples_dropped():
    counter = HeuristicTokenCounter()
    record = _crafted_record(10)
    # Budget that fits exactly the 3-example rendering of the same record.
    three = build_card(_crafted_record(3), LABELS, _config(BIG, BIG), counter)
    card = build_card(record, LABELS, _config(three.token_count, BIG), counter)
    kept = 10 - sum(1 for f in card.omitted_fields if f.startswith("example["))
    assert kept <= 3
    assert card.severely_truncated


def test_severe_case_drops_example_and_ancestor_sections_only():
    counter = HeuristicTokenCounter()
    record = _crafted_record(10)
    card = build_card(record, LABELS, _config(1, 1), counter)
    assert card.severely_truncated
    assert "examples_section" in card.omitted_fields
    assert "ancestors_section" in card.omitted_fields
    assert "Examples:" not in card.card_text
    assert "Ancestors:" not in card.card_text
    # Title, description, inverse, and endpoint-type summaries survive.
    assert "Relation: test relation (P9999)" in card.card_text
    assert "Description: " in card.card_text
    assert "Inverse: has part (P527)" in card.card_text
    assert "Source types: alpha type (Q1)" in card.card_text
    assert "Destination types: beta type (Q2)" in card.card_text
    assert "Constraints: " in card.card_text
    assert "Slug: test-relation" in card.card_text


def test_sentence_boundary_truncation_of_ancestor_descriptions():
    counter = HeuristicTokenCounter()
    record = _crafted_record(0)  # no examples: truncation goes to stage (b)
    full = build_card(record, LABELS, _config(BIG, BIG), counter)
    assert "second sentence with extra ancestor detail" in full.card_text

    card = build_card(record, LABELS, _config(full.token_count - 1, BIG), counter)
    assert "ancestor_descriptions_truncated" in card.omitted_fields
    # Exactly the first sentence survives, terminal period restored — never a
    # mid-sentence cut.
    assert "first sentence of the ancestor description." in card.card_text
    assert "second sentence with extra ancestor detail" not in card.card_text


def test_all_description_truncation_stages_without_severe_flag():
    counter = HeuristicTokenCounter()
    record = _crafted_record(0)
    card = build_card(record, LABELS, _config(1, BIG), counter)
    assert "ancestor_descriptions_truncated" in card.omitted_fields
    assert "source_type_descriptions_truncated" in card.omitted_fields
    assert "destination_type_descriptions_truncated" in card.omitted_fields
    assert "first alpha sentence." in card.card_text
    assert "second alpha sentence" not in card.card_text
    assert "first beta sentence." in card.card_text
    assert "second beta sentence" not in card.card_text
    # Under the hard budget and no examples existed: not severe.
    assert not card.severely_truncated


# --- small pure helpers -------------------------------------------------------


def test_heuristic_counter_is_ceil_utf8_bytes_over_4():
    counter = HeuristicTokenCounter()
    assert counter.count("") == 0
    assert counter.count("abcd") == 1
    assert counter.count("abcde") == 2
    assert counter.count("é" * 4) == 2  # 8 UTF-8 bytes


def test_first_sentence():
    assert first_sentence("One. Two. Three.") == "One."
    assert first_sentence("No boundary here") == "No boundary here"


def test_slugify():
    assert slugify("part of") == "part-of"
    assert slugify("A/B test!") == "a-b-test"
