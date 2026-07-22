"""Config loading tests (pydantic model tree, unknown keys rejected)."""

import pytest
from pydantic import ValidationError

from atlas_tools.wikidata.config import Config, EndpointsConfig


def test_defaults() -> None:
    config = Config()
    assert config.extraction.languages == ("en", "de")
    assert config.cards.tokenizer == "cl100k"  # production default
    assert config.cards.token_budget == 6000
    assert config.cards.hard_token_budget == 7500
    assert config.extraction.endpoints == EndpointsConfig()
    assert "Q18644435" in config.extraction.maintenance_classes
    assert "Q18644427" in config.extraction.deprecated_classes
    # Geometric offsets reach the long tail; QLever-first is evidence-based
    # (WDQS times out on deep-offset subqueries).
    assert config.extraction.example_offsets == (0, 1_000, 10_000, 100_000)
    assert config.extraction.example_endpoint_ladder == ("qlever", "wdqs")


def test_empty_endpoint_ladder_rejected() -> None:
    with pytest.raises(ValidationError, match="example_endpoint_ladder"):
        Config.model_validate({"extraction": {"example_endpoint_ladder": []}})


def test_unknown_keys_rejected() -> None:
    with pytest.raises(ValidationError, match="typo_key"):
        Config.model_validate({"typo_key": 1})
    with pytest.raises(ValidationError, match="typo_key"):
        Config.model_validate({"extraction": {"typo_key": 1}})


def test_unknown_tokenizer_rejected() -> None:
    with pytest.raises(ValidationError, match="tokenizer"):
        Config.model_validate({"cards": {"tokenizer": "gpt9"}})


def test_partial_endpoint_override_keeps_defaults() -> None:
    config = Config.model_validate(
        {"extraction": {"endpoints": {"wdqs": "http://local.test/sparql"}}}
    )
    assert config.extraction.endpoints.wdqs == "http://local.test/sparql"
    assert config.extraction.endpoints.qlever == EndpointsConfig().qlever


def test_sparql_url_dispatch() -> None:
    endpoints = EndpointsConfig(wdqs="http://w.test", qlever="http://q.test")
    assert endpoints.sparql_url("wdqs") == "http://w.test"
    assert endpoints.sparql_url("qlever") == "http://q.test"


def test_fixture_config_loads(config: Config) -> None:
    assert config.cards.tokenizer == "heuristic"  # tests must never hit tiktoken
    assert config.extraction.snapshot_date == "2025-06-01"
    assert config.extraction.stratification.per_class_caps == {"Q515": 3}
    assert config.extraction.seed == 7
    assert config.extraction.politeness.max_retries == 2
