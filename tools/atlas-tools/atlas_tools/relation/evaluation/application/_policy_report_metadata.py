"""Version and validate policy-report metadata contracts."""

import json
from collections.abc import Mapping
from pathlib import Path
from typing import Literal, Self

from pydantic import NonNegativeInt, model_validator

from atlas_tools.relation.evaluation.analysis.api import (
    PolicyReport,
    PolicyReportWithoutGold,
)
from atlas_tools.relation.evaluation.application._analysis_codec import (
    canonical_json_bytes,
    load_model,
    read_bytes,
    sha256_bytes,
)
from atlas_tools.relation.evaluation.application.analysis_artifact import ArtifactMetadata
from atlas_tools.relation.evaluation.domain.api import Sha256Hex

REPORT_JSON_FILENAME = "report.json"
REPORT_MARKDOWN_FILENAME = "report.md"
REPORT_METADATA_FILENAME = "report.meta.json"
_REPORT_SCHEMA_VERSION_WITH_GOLD = 1
_REPORT_SCHEMA_VERSION_WITHOUT_GOLD = 2

LEGACY_POLICY_REPORT_ALGORITHMS = {
    "analysis": "independent-gold-policy-report-v1",
    "json": "canonical-ascii-json-v1",
    "markdown": "deterministic-ascii-markdown-v1",
    "publication": "atomic-manifest-last-v1",
}
POLICY_REPORT_ALGORITHMS = {
    "analysis": "optional-gold-policy-report-v2",
    "json": "canonical-ascii-json-v1",
    "markdown": "deterministic-ascii-markdown-v2",
    "publication": "atomic-manifest-last-v1",
}

_LEGACY_METADATA_SCHEMA = {
    "artifact": "relation-policy-report",
    "fields": {
        "algorithm_hash": "sha256",
        "algorithms": "map[string,string]",
        "artifact": "literal[relation-policy-report]",
        "classifier_state": "literal[not-provided,evaluated]",
        "content_hashes": "map[string,sha256]",
        "gold_rows": "non-negative-int",
        "metadata_hash": "computed-sha256",
        "report_schema_version": "literal[1]",
        "schema_hashes": "map[string,sha256]",
        "schema_version": "literal[1]",
        "source_hashes": "map[string,sha256]",
    },
    "schema_version": 1,
}
_METADATA_SCHEMA = {
    "artifact": "relation-policy-report",
    "fields": {
        "algorithm_hash": "sha256",
        "algorithms": "map[string,string]",
        "artifact": "literal[relation-policy-report]",
        "classifier_state": "literal[not-provided,evaluated]",
        "content_hashes": "map[string,sha256]",
        "gold_rows": "non-negative-int|null",
        "gold_state": "literal[not-provided,evaluated]",
        "metadata_hash": "computed-sha256",
        "report_schema_version": "literal[1,2]",
        "schema_hashes": "map[string,sha256]",
        "schema_version": "literal[1]",
        "source_hashes": "map[string,sha256]",
    },
    "schema_version": 1,
}


def _schema_hash(value: object) -> Sha256Hex:
    return sha256_bytes(canonical_json_bytes(value))


def _markdown_schema(renderer: str) -> dict[str, object]:
    return {
        "encoding": "ascii",
        "renderer": renderer,
        "trailing_newline": True,
    }


_LEGACY_SCHEMA_HASHES = {
    "metadata": _schema_hash(_LEGACY_METADATA_SCHEMA),
    "report_json": _schema_hash(PolicyReport.model_json_schema()),
    "report_markdown": _schema_hash(_markdown_schema(LEGACY_POLICY_REPORT_ALGORITHMS["markdown"])),
}
_REPORT_SCHEMA_HASHES = {
    1: _schema_hash(PolicyReport.model_json_schema()),
    2: _schema_hash(PolicyReportWithoutGold.model_json_schema()),
}


class LegacyPolicyReportMetadata(ArtifactMetadata):
    """Metadata emitted by the original gold-required report writer."""

    artifact: Literal["relation-policy-report"] = "relation-policy-report"
    report_schema_version: Literal[1] = 1
    gold_rows: NonNegativeInt
    classifier_state: Literal["not-provided", "evaluated"]

    @property
    def gold_state(self) -> Literal["evaluated"]:
        """Legacy reports always loaded an explicitly provided gold artifact."""
        return "evaluated"


class PolicyReportMetadata(ArtifactMetadata):
    """Metadata binding optional-gold report renderings to validated inputs."""

    artifact: Literal["relation-policy-report"] = "relation-policy-report"
    report_schema_version: Literal[1, 2]
    gold_state: Literal["not-provided", "evaluated"]
    gold_rows: NonNegativeInt | None
    classifier_state: Literal["not-provided", "evaluated"]

    @model_validator(mode="after")
    def check_gold(self) -> Self:
        if self.gold_state == "evaluated":
            if (
                self.gold_rows is None
                or self.report_schema_version != _REPORT_SCHEMA_VERSION_WITH_GOLD
                or "gold.jsonl" not in self.source_hashes
            ):
                raise ValueError("evaluated gold requires source, rows, and report schema 1")
        elif (
            self.gold_rows is not None
            or self.report_schema_version != _REPORT_SCHEMA_VERSION_WITHOUT_GOLD
            or "gold.jsonl" in self.source_hashes
        ):
            raise ValueError("unavailable gold requires no source, null rows, and report schema 2")
        return self


type LoadedPolicyReportMetadata = LegacyPolicyReportMetadata | PolicyReportMetadata


def policy_report_schema_hashes(
    report_schema_version: Literal[1, 2],
) -> dict[str, Sha256Hex]:
    """Return current metadata, machine-report, and Markdown schema hashes."""
    return {
        "metadata": _schema_hash(_METADATA_SCHEMA),
        "report_json": _REPORT_SCHEMA_HASHES[report_schema_version],
        "report_markdown": _schema_hash(_markdown_schema(POLICY_REPORT_ALGORITHMS["markdown"])),
    }


def legacy_policy_report_schema_hashes() -> dict[str, Sha256Hex]:
    """Return a copy of the immutable original report schema hashes."""
    return dict(_LEGACY_SCHEMA_HASHES)


def expected_policy_report_schema_hashes(
    metadata: LoadedPolicyReportMetadata,
) -> Mapping[str, Sha256Hex]:
    """Select the exact schema contract recorded by a loaded metadata generation."""
    if isinstance(metadata, LegacyPolicyReportMetadata):
        return _LEGACY_SCHEMA_HASHES
    return policy_report_schema_hashes(metadata.report_schema_version)


def expected_policy_report_algorithms(
    metadata: LoadedPolicyReportMetadata,
) -> Mapping[str, str]:
    """Select the exact algorithm contract recorded by a metadata generation."""
    if isinstance(metadata, LegacyPolicyReportMetadata):
        return LEGACY_POLICY_REPORT_ALGORITHMS
    return POLICY_REPORT_ALGORITHMS


def load_policy_report_metadata(path: Path) -> LoadedPolicyReportMetadata:
    """Load either strict metadata generation without weakening either schema."""
    payload = read_bytes(path)
    try:
        decoded: object = json.loads(payload)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError(f"invalid analysis artifact metadata {path}: {error}") from error
    if isinstance(decoded, Mapping) and "gold_state" not in decoded:
        return load_model(path, LegacyPolicyReportMetadata)
    return load_model(path, PolicyReportMetadata)
