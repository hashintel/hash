"""Shared fixtures: everything runs offline against committed fixtures."""

from pathlib import Path

import pytest

from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.taxonomy import Taxonomy
from atlas_tools.wikidata.transport import FixtureTransport

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "wikidata"
RESPONSES = FIXTURES / "responses"
DUMP_EXCERPT = FIXTURES / "dump_excerpt.jsondump"
CONFIG_PATH = FIXTURES / "config.yaml"
TAXONOMY_PATH = FIXTURES / "taxonomy.parquet"


@pytest.fixture
def fixtures_dir() -> Path:
    return FIXTURES


@pytest.fixture
def config() -> Config:
    return Config.load(CONFIG_PATH)


@pytest.fixture
def fixture_transport() -> FixtureTransport:
    return FixtureTransport(RESPONSES)


@pytest.fixture
def taxonomy() -> Taxonomy:
    return Taxonomy.load(TAXONOMY_PATH)
