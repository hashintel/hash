"""Typed YAML configuration for the Wikidata miner.

All behaviour that affects output content is driven by this config so that
runs are reproducible. The tree mirrors the mining/formatting decoupling:

- ``extraction`` (:class:`ExtractionConfig`) — everything that shapes the
  MINED artifacts: languages, endpoints, politeness, snapshot date, example
  sampling, exclusion class lists, plus the W2b dump/stratification knobs.
  The records provenance envelope hashes exactly this sub-model, so the
  records config hash is card-format-independent by construction.
- ``cards`` (:class:`CardsConfig`) — the card-format knobs (token budgets,
  tokenizer). Changing these re-renders cards without invalidating records.

Every model rejects unknown keys (``extra="forbid"``); config hashes are
computed with ``canonical_json_bytes(model)``, which dumps JSON-mode first.
"""

from __future__ import annotations

from os import PathLike
from typing import Literal, Self

import yaml
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    NonNegativeInt,
    PositiveInt,
)
from pydantic_extra_types.language_code import LanguageAlpha2

from atlas_tools.wikidata.model import ExampleSource
from atlas_tools.wikidata.transport import RetryPolicy

type TokenizerName = Literal["cl100k", "heuristic"]
type SentenceSplitterName = Literal["punkt", "naive"]

# Properties whose P31 intersects these classes are excluded as
# Wikimedia-maintenance properties (Q18644435 "Wikidata property for
# Wikimedia projects"-style classes).
DEFAULT_MAINTENANCE_CLASSES: tuple[str, ...] = ("Q18644435", "Q51118821")

# Properties whose P31 intersects these classes are excluded as deprecated
# (Q18644427-style "obsolete property" classes / owl:deprecated proxies).
DEFAULT_DEPRECATED_CLASSES: tuple[str, ...] = ("Q18644427",)


class ForbidExtraModel(BaseModel):
    """Base for config models: unknown keys are rejected."""

    model_config = ConfigDict(extra="forbid")


class EndpointsConfig(ForbidExtraModel):
    """API endpoints; the field names are the closed endpoint-name set."""

    wdqs: str = "https://query.wikidata.org/sparql"
    qlever: str = "https://qlever.cs.uni-freiburg.de/api/wikidata"
    wikibase_api: str = "https://www.wikidata.org/w/api.php"

    def sparql_url(self, endpoint: Literal["wdqs", "qlever"]) -> str:
        match endpoint:
            case "wdqs":
                return self.wdqs
            case "qlever":
                return self.qlever


class DumpIdentity(ForbidExtraModel):
    """Dump identity, taken from the mirror's checksum file, never computed
    by hashing the stream locally."""

    date: str = ""
    sha256: str = ""


class StratificationConfig(ForbidExtraModel):
    """Rules for the vec2slug sampling plan (W2b)."""

    default_cap: PositiveInt = 5000
    rare_floor: NonNegativeInt = 50
    per_class_caps: dict[str, PositiveInt] = Field(default_factory=dict)


class ExtractionConfig(ForbidExtraModel):
    """Everything that shapes mined artifacts (records + entity manifest)."""

    languages: tuple[LanguageAlpha2, ...] = (LanguageAlpha2("en"), LanguageAlpha2("de"))
    seed: int = 0
    # W2a: endpoints + politeness
    endpoints: EndpointsConfig = Field(default_factory=EndpointsConfig)
    politeness: RetryPolicy = Field(default_factory=RetryPolicy)
    snapshot_date: str = ""
    # W2a: examples. The geometric offset ladder reaches the long tail of
    # each property's statement stream (endpoints stream in ~QID order =
    # prominence order; shallow offsets only ever see countries and heads
    # of state). Empty deep slices are cheap and contribute nothing.
    example_count: PositiveInt = 8
    example_pool_limit: PositiveInt = 50
    example_offsets: tuple[NonNegativeInt, ...] = (0, 1_000, 10_000, 100_000)
    # Endpoint ladder ORDER, first rung first. QLever-first reverses the
    # PRD's WDQS-first prescription on live evidence: Blazegraph (WDQS)
    # structurally times out (>40 s) on the deep-offset subquery form that
    # QLever answers in ~0.2 s, and every WDQS timeout costs the full
    # client timeout before the ladder can fall through.
    example_endpoint_ladder: tuple[ExampleSource, ...] = Field(
        default=("qlever", "wdqs"), min_length=1
    )
    # W2a: exclusions
    maintenance_classes: tuple[str, ...] = DEFAULT_MAINTENANCE_CLASSES
    deprecated_classes: tuple[str, ...] = DEFAULT_DEPRECATED_CLASSES
    # W2b
    checkpoint_interval: PositiveInt = 10_000

    dump: DumpIdentity = Field(default_factory=DumpIdentity)
    stratification: StratificationConfig = Field(default_factory=StratificationConfig)

    @property
    def primary_language(self) -> LanguageAlpha2:
        return self.languages[0]


class CardsConfig(ForbidExtraModel):
    """Card-format knobs; never part of the records config hash."""

    token_budget: PositiveInt = 6000
    hard_token_budget: PositiveInt = 7500
    tokenizer: TokenizerName = "cl100k"  # tests must use "heuristic"
    # punkt requires the nltk punkt_tab data (see README); tests use "naive".
    sentence_splitter: SentenceSplitterName = "punkt"


class Config(ForbidExtraModel):
    """Top-level miner config: mining (``extraction``) vs formatting
    (``cards``)."""

    extraction: ExtractionConfig = Field(default_factory=ExtractionConfig)
    cards: CardsConfig = Field(default_factory=CardsConfig)

    @classmethod
    def load(cls, path: PathLike | str) -> Self:
        with open(path, encoding="utf-8") as f:
            loaded = yaml.safe_load(f) or {}
        if not isinstance(loaded, dict):
            raise ValueError(f"config {path} is not a YAML mapping")
        return cls.model_validate(loaded)
