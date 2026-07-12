"""Pydantic Settings CLI tests for live HASH card extraction."""

from pathlib import Path

import pytest

from atlas_tools.common.postgres import DatabaseConnectionInfo
from atlas_tools.relation_cards.hash import cli
from atlas_tools.relation_cards.hash.cards import HashCardsConfig, HashCardsPaths


def test_cli_reads_database_environment_and_prefers_cli(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    captured: dict[str, object] = {}

    def extract(
        connection_info: DatabaseConnectionInfo,
        config: HashCardsConfig,
        out_dir: Path,
    ) -> HashCardsPaths:
        captured.update(connection=connection_info, config=config, out=out_dir)
        return HashCardsPaths(
            link_types_jsonl=out_dir / "link-types.jsonl",
            cards_jsonl=out_dir / "cards.jsonl",
            manifest=out_dir / "cards.manifest.json",
        )

    monkeypatch.setattr(cli, "extract_and_emit_hash_cards", extract)
    credential = "environment-credential"
    monkeypatch.setenv("HASH_GRAPH_PG_HOST", "database.internal")
    monkeypatch.setenv("HASH_GRAPH_PG_PORT", "6543")
    monkeypatch.setenv("HASH_GRAPH_PG_PASSWORD", credential)
    monkeypatch.setenv("HASH_GRAPH_PG_DATABASE", "live-graph")
    cli.main(
        [
            "extract-cards",
            "--out",
            str(tmp_path),
            "--user",
            "operator",
            "--example-count",
            "3",
            "--tokenizer",
            "heuristic",
            "--sentence-splitter",
            "naive",
        ]
    )

    connection = captured["connection"]
    assert isinstance(connection, DatabaseConnectionInfo)
    assert connection.host == "database.internal"
    assert connection.port == 6543
    assert connection.user == "operator"
    assert connection.password == credential
    assert connection.database == "live-graph"
    config = captured["config"]
    assert isinstance(config, HashCardsConfig)
    assert config.example_count == 3
    assert config.example_security_mode == "none"
    assert config.cards.tokenizer == "heuristic"
    assert captured["out"] == tmp_path
    assert "wrote" in capsys.readouterr().out
