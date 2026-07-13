"""HASH record and card artifact emission tests."""

import json
from datetime import UTC, datetime
from pathlib import Path

from atlas_tools.common.postgres import DatabaseConnectionInfo
from atlas_tools.common.provenance import sha256_file
from atlas_tools.relation_cards.common.config import CardsConfig
from atlas_tools.relation_cards.hash.adapter import build_relation_records
from atlas_tools.relation_cards.hash.cards import HashCardsConfig, emit_hash_cards
from atlas_tools.relation_cards.hash.postgres import LiveHashExtraction
from tests.relation_cards.hash.test_adapter import _fixture_types


def test_hash_artifacts_keep_identifiers_out_of_card_text(tmp_path: Path) -> None:
    records = build_relation_records(_fixture_types(), [], example_count=2)
    extraction = LiveHashExtraction(
        snapshot_at=datetime(2026, 7, 12, 12, tzinfo=UTC),
        entity_type_versions=len(_fixture_types()),
        example_candidates=0,
        records=records,
    )
    config = HashCardsConfig(
        example_count=2,
        example_security_mode="none",
        cards=CardsConfig(tokenizer="heuristic", sentence_splitter="naive"),
    )
    credential = "test-credential"
    paths = emit_hash_cards(
        extraction,
        config,
        tmp_path,
        connection_info=DatabaseConnectionInfo(
            host="localhost",
            port=5432,
            user="graph",
            password=credential,
            database="graph",
        ),
    )

    record_rows = [
        json.loads(line) for line in paths.link_types_jsonl.read_text(encoding="utf-8").splitlines()
    ]
    card_rows = [
        json.loads(line) for line in paths.cards_jsonl.read_text(encoding="utf-8").splitlines()
    ]
    assert record_rows
    assert card_rows
    assert all(row["base_url"] in paths.link_types_jsonl.read_text() for row in card_rows)
    for row in card_rows:
        assert row["base_url"] not in row["card_text"]
        assert "https://" not in row["card_text"]
        assert row["card_hash"]
        assert "retrieved_at" not in row

    manifest = json.loads(paths.manifest.read_text(encoding="utf-8"))
    details = manifest["details"]
    assert details["link_types"] == len(card_rows)
    assert details["database_name"] == "graph"
    assert details["snapshot_at"] == "2026-07-12T12:00:00Z"
    assert details["example_security_mode"] == "none"
    assert details["example_candidate_pairs"] == 0
    assert details["example_unmatched_candidates"] == 0
    assert details["example_unmatched_fallbacks"] == 0
    assert "password" not in json.dumps(manifest)
    # Content hashes live in the provenance envelope, not the details.
    assert manifest["content_hashes"]["cards.jsonl"] == sha256_file(paths.cards_jsonl)


def test_card_corpus_is_stable_across_unchanged_live_snapshot_times(tmp_path: Path) -> None:
    records = build_relation_records(_fixture_types(), [], example_count=2)
    config = HashCardsConfig(
        example_count=2,
        cards=CardsConfig(tokenizer="heuristic", sentence_splitter="naive"),
    )
    credential = "test-credential"
    connection_info = DatabaseConnectionInfo(
        host="localhost",
        port=5432,
        user="graph",
        password=credential,
        database="graph",
    )

    paths = []
    for hour in (12, 13):
        extraction = LiveHashExtraction(
            snapshot_at=datetime(2026, 7, 12, hour, tzinfo=UTC),
            entity_type_versions=len(_fixture_types()),
            example_candidates=0,
            records=records,
        )
        paths.append(
            emit_hash_cards(
                extraction,
                config,
                tmp_path / f"run-{hour}",
                connection_info=connection_info,
            )
        )

    assert paths[0].cards_jsonl.read_bytes() == paths[1].cards_jsonl.read_bytes()
    assert paths[0].link_types_jsonl.read_bytes() == paths[1].link_types_jsonl.read_bytes()
