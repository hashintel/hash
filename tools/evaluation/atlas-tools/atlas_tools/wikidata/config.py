"""Typed YAML configuration for the Wikidata miner.

All behaviour that affects output content is driven by this config so that
runs are reproducible: languages, endpoints, snapshot date, example counts,
token budgets, tokenizer choice, exclusion class lists, stratification rules,
checkpoint interval, and the seed.

``Config.raw`` preserves the exact dict that was loaded (or built) so that
provenance ``config_hash`` values are stable and human-inspectable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

DEFAULT_ENDPOINTS: dict[str, str] = {
    "wdqs": "https://query.wikidata.org/sparql",
    "qlever": "https://qlever.cs.uni-freiburg.de/api/wikidata",
    "wikibase_api": "https://www.wikidata.org/w/api.php",
}

# Properties whose P31 intersects these classes are excluded as
# Wikimedia-maintenance properties (Q18644435 "Wikidata property for
# Wikimedia projects"-style classes).
DEFAULT_MAINTENANCE_CLASSES: tuple[str, ...] = ("Q18644435", "Q51118821")

# Properties whose P31 intersects these classes are excluded as deprecated
# (Q18644427-style "obsolete property" classes / owl:deprecated proxies).
DEFAULT_DEPRECATED_CLASSES: tuple[str, ...] = ("Q18644427",)


@dataclass(frozen=True)
class StratificationConfig:
    """Rules for the vec2slug sampling plan (W2b)."""

    default_cap: int = 5000
    rare_floor: int = 50
    per_class_caps: dict[str, int] = field(default_factory=dict)


@dataclass(frozen=True)
class DumpConfig:
    """Dump identity, taken from the mirror's checksum file, never computed
    by hashing the stream locally."""

    date: str = ""
    sha256: str = ""


@dataclass(frozen=True)
class Config:
    # Shared
    languages: tuple[str, ...] = ("en", "de")
    seed: int = 0
    # W2a: endpoints + politeness
    endpoints: dict[str, str] = field(default_factory=lambda: dict(DEFAULT_ENDPOINTS))
    rate_limit_per_sec: float = 1.0
    max_retries: int = 3
    backoff_base_seconds: float = 1.0
    snapshot_date: str = ""
    # W2a: examples
    example_count: int = 8
    example_pool_limit: int = 50
    example_offsets: tuple[int, ...] = (0,)
    # W2a: cards
    token_budget: int = 6000
    hard_token_budget: int = 7500
    tokenizer: str = "cl100k"  # "cl100k" (production) or "heuristic" (tests)
    # W2a: exclusions
    maintenance_classes: tuple[str, ...] = DEFAULT_MAINTENANCE_CLASSES
    deprecated_classes: tuple[str, ...] = DEFAULT_DEPRECATED_CLASSES
    # W2b
    checkpoint_interval: int = 10000
    dump: DumpConfig = field(default_factory=DumpConfig)
    stratification: StratificationConfig = field(default_factory=StratificationConfig)
    # The exact dict this config was built from (for config_hash provenance).
    raw: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Config":
        known = {
            "languages",
            "seed",
            "endpoints",
            "rate_limit_per_sec",
            "max_retries",
            "backoff_base_seconds",
            "snapshot_date",
            "example_count",
            "example_pool_limit",
            "example_offsets",
            "token_budget",
            "hard_token_budget",
            "tokenizer",
            "maintenance_classes",
            "deprecated_classes",
            "checkpoint_interval",
            "dump",
            "stratification",
        }
        unknown = sorted(set(data) - known)
        if unknown:
            raise ValueError(f"unknown config keys: {unknown}")

        kwargs: dict[str, Any] = {}
        for key in (
            "languages",
            "example_offsets",
            "maintenance_classes",
            "deprecated_classes",
        ):
            if key in data:
                kwargs[key] = tuple(data[key])
        for key in (
            "seed",
            "max_retries",
            "example_count",
            "example_pool_limit",
            "token_budget",
            "hard_token_budget",
            "checkpoint_interval",
        ):
            if key in data:
                kwargs[key] = int(data[key])
        for key in ("rate_limit_per_sec", "backoff_base_seconds"):
            if key in data:
                kwargs[key] = float(data[key])
        for key in ("snapshot_date", "tokenizer"):
            if key in data:
                kwargs[key] = str(data[key])
        if "endpoints" in data:
            endpoints = dict(DEFAULT_ENDPOINTS)
            endpoints.update({str(k): str(v) for k, v in data["endpoints"].items()})
            kwargs["endpoints"] = endpoints
        if "dump" in data:
            dump = data["dump"]
            kwargs["dump"] = DumpConfig(
                date=str(dump.get("date", "")),
                sha256=str(dump.get("sha256", "")),
            )
        if "stratification" in data:
            strat = data["stratification"]
            kwargs["stratification"] = StratificationConfig(
                default_cap=int(strat.get("default_cap", 5000)),
                rare_floor=int(strat.get("rare_floor", 50)),
                per_class_caps={
                    str(k): int(v) for k, v in strat.get("per_class_caps", {}).items()
                },
            )
        if kwargs.get("tokenizer") not in (None, "cl100k", "heuristic"):
            raise ValueError(
                f"unknown tokenizer {kwargs['tokenizer']!r}; expected 'cl100k' or 'heuristic'"
            )
        return cls(**kwargs, raw=data)

    @classmethod
    def load(cls, path: Path | str) -> "Config":
        with open(path, encoding="utf-8") as f:
            loaded = yaml.safe_load(f) or {}
        if not isinstance(loaded, dict):
            raise ValueError(f"config {path} is not a YAML mapping")
        return cls.from_dict(loaded)
