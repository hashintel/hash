from pathlib import Path

import pytest
from pydantic import ValidationError
from pydantic_settings import CliApp

from atlas_tools.wikidata.cli import (
    BackfillLineageCommand,
    EntityManifestCommand,
    ExtractPropertiesCommand,
)


def test_entity_manifest_uses_one_way_flags() -> None:
    help_text = CliApp.format_help(EntityManifestCommand)

    assert "--no-row-hash" in help_text
    assert "--row-hash" not in help_text
    assert "--quiet" in help_text
    assert "--no-quiet" not in help_text


def test_extract_cache_only_requires_a_cache_directory(tmp_path: Path) -> None:
    config = tmp_path / "config.yaml"
    config.touch()

    with pytest.raises(ValidationError, match="cache-only extraction requires --cache-dir"):
        ExtractPropertiesCommand(
            config=config,
            out=tmp_path / "out",
            cache_only=True,
        )

    help_text = CliApp.format_help(ExtractPropertiesCommand)
    assert "--cache-only" in help_text


def test_backfill_lineage_requires_existing_records_and_card_leaf(tmp_path: Path) -> None:
    with pytest.raises(ValidationError):
        BackfillLineageCommand(
            records=tmp_path / "missing-records",
            cards=tmp_path / "missing-cards",
            out=tmp_path / "out",
        )

    help_text = CliApp.format_help(BackfillLineageCommand)
    assert "--records" in help_text
    assert "--cards" in help_text
