"""Verify and concatenate source-qualified relation-card artifacts."""

from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from os import PathLike
from pathlib import Path
from typing import Self

from pydantic import BaseModel, ConfigDict, JsonValue, NonNegativeInt, model_validator

from atlas_tools.common import (
    Provenance,
    Sha256Hex,
    canonical_json_bytes,
    sha256_bytes,
    sha256_file,
)
from atlas_tools.relation_cards.common.cards import (
    CardRow,
    RelationId,
    RelationNamespace,
    RelationSourceSpec,
    qualify_relation_id,
    split_relation_id,
)

CONCAT_SCHEMA_VERSION = 2


class ConcatCardRow(CardRow):
    """A card whose identity remains qualified by its leaf source namespace."""

    relation_id: RelationId
    producer: RelationNamespace

    model_config = ConfigDict(extra="allow", frozen=True)

    @model_validator(mode="after")
    def check_identity(self) -> Self:
        namespace, _ = split_relation_id(self.relation_id)
        if namespace != self.producer:
            raise ValueError("relation_id namespace must equal producer")
        return self


class ConcatSource(BaseModel):
    """Verified leaf artifact represented by one stable namespace."""

    namespace: RelationNamespace
    artifact_producer: str
    local_id_field: str
    cards_hash: Sha256Hex
    manifest_hash: Sha256Hex
    config: JsonValue
    details: JsonValue

    model_config = ConfigDict(extra="forbid", frozen=True)


class ConcatInput(BaseModel):
    """One direct input artifact to a concat operation."""

    artifact_id: Sha256Hex
    cards_hash: Sha256Hex
    manifest_hash: Sha256Hex

    model_config = ConfigDict(extra="forbid", frozen=True)


class ConcatDetails(BaseModel):
    schema_version: int = CONCAT_SCHEMA_VERSION
    sources: dict[RelationNamespace, ConcatSource]
    inputs: list[ConcatInput]
    row_count: NonNegativeInt

    model_config = ConfigDict(extra="forbid", frozen=True)

    @model_validator(mode="after")
    def check_sources(self) -> Self:
        for namespace, source in self.sources.items():
            if namespace != source.namespace:
                raise ValueError("source map key must equal source namespace")
        return self


class ConcatConfig(BaseModel):
    source_configs: dict[RelationNamespace, JsonValue]

    model_config = ConfigDict(extra="forbid", frozen=True)


ConcatProvenance = Provenance[ConcatDetails, ConcatConfig]


@dataclass(frozen=True)
class ConcatPaths:
    """Locations of the files written by :func:`concat_relations`."""

    cards_jsonl: Path
    manifest: Path


@dataclass(frozen=True)
class _InputArtifact:
    cards_path: Path
    cards_hash: Sha256Hex
    manifest_hash: Sha256Hex
    artifact_id: Sha256Hex
    sources: dict[RelationNamespace, ConcatSource]
    nested: bool


def _artifact_id(cards_hash: Sha256Hex, manifest_hash: Sha256Hex) -> Sha256Hex:
    return sha256_bytes(
        canonical_json_bytes(
            {
                "cards_hash": cards_hash,
                "manifest_hash": manifest_hash,
            }
        )
    )


def _verified_artifact(card_dir: Path) -> _InputArtifact:
    cards_path = card_dir / "cards.jsonl"
    manifest_path = card_dir / "cards.manifest.json"
    if not cards_path.is_file() or not manifest_path.is_file():
        raise ValueError(f"{card_dir} must contain cards.jsonl and cards.manifest.json")

    manifest_hash = sha256_file(manifest_path)
    provenance = Provenance[JsonValue, JsonValue].load(manifest_path)
    recorded_hash = (provenance.content_hashes or {}).get("cards.jsonl")
    if recorded_hash is None:
        raise ValueError(f"{manifest_path} does not record a content hash for cards.jsonl")
    cards_hash = sha256_file(cards_path)
    if cards_hash != recorded_hash:
        raise ValueError(f"{cards_path} does not match the content hash recorded in its manifest")

    if provenance.producer == "relation.concat":
        nested = ConcatProvenance.load(manifest_path)
        if nested.details.schema_version != CONCAT_SCHEMA_VERSION:
            raise ValueError(f"unsupported nested concat schema {nested.details.schema_version}")
        sources = nested.details.sources
        is_nested = True
    else:
        if not isinstance(provenance.details, dict):
            raise ValueError(f"{manifest_path} must declare details.relation_source")
        source_payload = provenance.details.get("relation_source")
        if source_payload is None:
            raise ValueError(f"{manifest_path} must declare details.relation_source")
        source_spec = RelationSourceSpec.model_validate(source_payload)
        source = ConcatSource(
            namespace=source_spec.namespace,
            artifact_producer=provenance.producer,
            local_id_field=source_spec.local_id_field,
            cards_hash=cards_hash,
            manifest_hash=manifest_hash,
            config=provenance.config,
            details=provenance.details,
        )
        sources = {source.namespace: source}
        is_nested = False

    return _InputArtifact(
        cards_path=cards_path,
        cards_hash=cards_hash,
        manifest_hash=manifest_hash,
        artifact_id=_artifact_id(cards_hash, manifest_hash),
        sources=dict(sources),
        nested=is_nested,
    )


def _validate_leaf_row(line: str, source: ConcatSource) -> ConcatCardRow:
    card = CardRow.model_validate_json(line)
    payload = card.model_dump(mode="json")
    local_id = payload.get(source.local_id_field)
    if local_id is None:
        raise ValueError(f"missing local identity field {source.local_id_field!r}")
    expected = qualify_relation_id(source.namespace, local_id)
    if payload.get("relation_id") != expected:
        raise ValueError(f"relation_id must be {expected}")
    payload["producer"] = source.namespace
    return ConcatCardRow.model_validate(payload)


def _leaf_rows(artifact: _InputArtifact) -> Iterator[ConcatCardRow]:
    source = next(iter(artifact.sources.values()))
    with artifact.cards_path.open(encoding="utf-8") as input_file:
        for line_number, line in enumerate(input_file, start=1):
            if not line.strip():
                continue
            try:
                yield _validate_leaf_row(line, source)
            except (TypeError, ValueError) as error:
                raise ValueError(
                    f"invalid {artifact.cards_path} line {line_number}: {error}"
                ) from error


def _nested_rows(artifact: _InputArtifact) -> Iterator[ConcatCardRow]:
    with artifact.cards_path.open(encoding="utf-8") as input_file:
        for line_number, line in enumerate(input_file, start=1):
            if not line.strip():
                continue
            try:
                row = ConcatCardRow.model_validate_json(line)
            except ValueError as error:
                raise ValueError(
                    f"invalid {artifact.cards_path} line {line_number}: {error}"
                ) from error
            if row.producer not in artifact.sources:
                raise ValueError(
                    f"{artifact.cards_path} line {line_number} references unknown source "
                    f"{row.producer!r}"
                )
            yield row


def _rows(artifact: _InputArtifact) -> Iterator[ConcatCardRow]:
    return _nested_rows(artifact) if artifact.nested else _leaf_rows(artifact)


def _collect_artifacts(paths: Iterable[PathLike]) -> list[_InputArtifact]:
    artifacts = [_verified_artifact(Path(path)) for path in paths]
    if not artifacts:
        raise ValueError("at least one card-set input is required")

    artifact_ids: set[Sha256Hex] = set()
    namespaces: set[RelationNamespace] = set()
    for artifact in artifacts:
        if artifact.artifact_id in artifact_ids:
            raise ValueError(f"duplicate input artifact {artifact.artifact_id}")
        artifact_ids.add(artifact.artifact_id)
        overlap = namespaces & set(artifact.sources)
        if overlap:
            raise ValueError(f"duplicate relation source namespaces: {sorted(overlap)}")
        namespaces.update(artifact.sources)
    return artifacts


def _claim_relation(relation_id: RelationId, seen: set[RelationId]) -> None:
    if relation_id in seen:
        raise ValueError(f"duplicate relation_id {relation_id}")
    seen.add(relation_id)


def concat_relations(paths: Iterable[PathLike], *, out: PathLike) -> ConcatPaths:
    """Stream verified inputs into a source-qualified, recursively stable card set."""
    artifacts = _collect_artifacts(paths)
    out_dir = Path(out)
    cards_path = out_dir / "cards.jsonl"
    manifest_path = out_dir / "cards.manifest.json"
    if cards_path.exists() or manifest_path.exists():
        raise ValueError(f"output already contains relation-card artifacts: {out_dir}")
    out_dir.mkdir(parents=True, exist_ok=True)

    temporary_cards = out_dir / ".cards.jsonl.tmp"
    if temporary_cards.exists():
        temporary_cards.unlink()

    seen_relations: set[RelationId] = set()
    row_count = 0
    try:
        with temporary_cards.open("x", encoding="utf-8") as output:
            for artifact in artifacts:
                for row in _rows(artifact):
                    _claim_relation(row.relation_id, seen_relations)
                    output.write(canonical_json_bytes(row).decode("utf-8") + "\n")
                    row_count += 1
        temporary_cards.replace(cards_path)
    except BaseException:
        temporary_cards.unlink(missing_ok=True)
        raise

    sources = {
        namespace: source
        for artifact in artifacts
        for namespace, source in artifact.sources.items()
    }
    inputs = [
        ConcatInput(
            artifact_id=artifact.artifact_id,
            cards_hash=artifact.cards_hash,
            manifest_hash=artifact.manifest_hash,
        )
        for artifact in artifacts
    ]
    input_hashes = {
        f"inputs/{artifact.artifact_id}/cards.jsonl": artifact.cards_hash for artifact in artifacts
    } | {
        f"inputs/{artifact.artifact_id}/cards.manifest.json": artifact.manifest_hash
        for artifact in artifacts
    }
    provenance = ConcatProvenance.make(
        producer="relation.concat",
        input_hashes=input_hashes,
        content_hashes={"cards.jsonl": sha256_file(cards_path)},
        config=ConcatConfig(
            source_configs={
                namespace: source.config for namespace, source in sorted(sources.items())
            }
        ),
        details=ConcatDetails(
            sources=dict(sorted(sources.items())),
            inputs=inputs,
            row_count=row_count,
        ),
    )
    temporary_manifest = out_dir / ".cards.manifest.json.tmp"
    try:
        provenance.write(temporary_manifest)
        temporary_manifest.replace(manifest_path)
    except BaseException:
        temporary_manifest.unlink(missing_ok=True)
        cards_path.unlink(missing_ok=True)
        raise

    return ConcatPaths(cards_jsonl=cards_path, manifest=manifest_path)
