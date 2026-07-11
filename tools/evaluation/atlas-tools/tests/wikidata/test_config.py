"""Config loading tests."""

from __future__ import annotations

import pytest
from atlas_tools.wikidata.config import DEFAULT_ENDPOINTS, Config


def test_defaults():
    config = Config.from_dict({})
    assert config.languages == ("en", "de")
    assert config.tokenizer == "cl100k"  # production default
    assert config.token_budget == 6000
    assert config.hard_token_budget == 7500
    assert config.endpoints == DEFAULT_ENDPOINTS
    assert "Q18644435" in config.maintenance_classes
    assert "Q18644427" in config.deprecated_classes


def test_unknown_keys_rejected():
    with pytest.raises(ValueError, match="unknown config keys.*typo_key"):
        Config.from_dict({"typo_key": 1})


def test_unknown_tokenizer_rejected():
    with pytest.raises(ValueError, match="unknown tokenizer"):
        Config.from_dict({"tokenizer": "gpt9"})


def test_partial_endpoint_override_keeps_defaults():
    config = Config.from_dict({"endpoints": {"wdqs": "http://local.test/sparql"}})
    assert config.endpoints["wdqs"] == "http://local.test/sparql"
    assert config.endpoints["qlever"] == DEFAULT_ENDPOINTS["qlever"]


def test_fixture_config_loads(config):
    assert config.tokenizer == "heuristic"  # tests must never hit tiktoken
    assert config.snapshot_date == "2025-06-01"
    assert config.stratification.per_class_caps == {"Q515": 3}
    assert config.raw["seed"] == 7
