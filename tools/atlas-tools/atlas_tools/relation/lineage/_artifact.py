"""Verification and durable publication of source lineage artifacts."""

import hashlib
import json
import os
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from os import PathLike
from pathlib import Path

from pydantic import JsonValue, ValidationError

from atlas_tools.common import Provenance, canonical_json_bytes, sha256_bytes, sha256_file
from atlas_tools.relation.concat import card_artifact_id
from atlas_tools.relation.domain.api import RelationId, RelationSourceSpec, Sha256Hex
from atlas_tools.relation.lineage._domain import (
    InverseEdgeKind,
    LeafCardArtifact,
    LineageNode,
    SourceLineageCounts,
    SourceLineageDetails,
    SourceLineageManifest,
    SourceLineagePaths,
    SourceLineagePolicy,
    SourceSnapshotIdentity,
    VerifiedSourceLineage,
    source_lineage_artifact_id,
)
from atlas_tools.relation.lineage._graph import validate_lineage_nodes


@dataclass(frozen=True, slots=True)
class _LeafArtifact:
    cards_hash: Sha256Hex
    manifest_hash: Sha256Hex
    artifact_id: Sha256Hex
    source: RelationSourceSpec
    snapshot: SourceSnapshotIdentity


def _read_manifest(path: Path) -> tuple[bytes, SourceLineageManifest]:
    try:
        payload = path.read_bytes()
        manifest = SourceLineageManifest.model_validate_json(payload, strict=True)
    except (OSError, ValidationError) as error:
        raise ValueError(f"invalid source lineage manifest {path}: {error}") from error
    return payload, manifest


def _read_nodes(path: Path, expected_hash: Sha256Hex) -> tuple[LineageNode, ...]:
    digest = hashlib.sha256()
    nodes: list[LineageNode] = []
    previous: RelationId | None = None
    try:
        stream = path.open("rb")
    except OSError as error:
        raise ValueError(f"cannot read source lineage {path}: {error}") from error

    with stream:
        for line_number, raw_line in enumerate(stream, start=1):
            digest.update(raw_line)
            if not raw_line.endswith(b"\n"):
                raise ValueError(f"{path} line {line_number} must end with a newline")
            if not raw_line.strip():
                raise ValueError(f"{path} line {line_number} must not be blank")
            try:
                node = LineageNode.model_validate_json(raw_line, strict=True)
            except (TypeError, ValidationError) as error:
                raise ValueError(f"invalid {path} line {line_number}: {error}") from error
            if previous is not None and node.relation_id <= previous:
                raise ValueError(
                    f"{path} nodes must use strictly ascending relation_id order; "
                    f"found {node.relation_id} after {previous}"
                )
            previous = node.relation_id
            nodes.append(node)

    observed_hash = digest.hexdigest()
    if observed_hash != expected_hash:
        raise ValueError(f"{path} does not match the content hash recorded in its manifest")
    return tuple(nodes)


def _observed_counts(nodes: tuple[LineageNode, ...]) -> SourceLineageCounts:
    return SourceLineageCounts(
        nodes=len(nodes),
        extends_edges=sum(len(node.extends) for node in nodes),
        inverse_edges=sum(len(node.inverse_edges) for node in nodes),
    )


def verify_source_lineage(directory: PathLike) -> VerifiedSourceLineage:
    """Eagerly verify one schema-v1 source lineage artifact."""
    artifact_directory = Path(directory)
    lineage_path = artifact_directory / "lineage.jsonl"
    manifest_path = artifact_directory / "lineage.manifest.json"
    manifest_bytes, manifest = _read_manifest(manifest_path)
    nodes = _read_nodes(lineage_path, manifest.details.lineage_hash)
    nodes = validate_lineage_nodes(
        nodes,
        source_namespace=manifest.details.relation_source.namespace,
        policy=manifest.details.edge_policy,
    )
    counts = _observed_counts(nodes)
    if counts != manifest.details.counts:
        raise ValueError(
            f"source lineage counts differ: manifest={manifest.details.counts}, observed={counts}"
        )
    return VerifiedSourceLineage(
        directory=artifact_directory,
        lineage_path=lineage_path,
        manifest_path=manifest_path,
        lineage_hash=manifest.details.lineage_hash,
        manifest_hash=sha256_bytes(manifest_bytes),
        manifest=manifest,
        nodes=nodes,
    )


def _verify_leaf_card_artifact(directory: Path) -> _LeafArtifact:
    cards_path = directory / "cards.jsonl"
    manifest_path = directory / "cards.manifest.json"
    try:
        manifest_bytes = manifest_path.read_bytes()
        manifest = Provenance[JsonValue, JsonValue].model_validate_json(manifest_bytes)
    except (OSError, ValidationError) as error:
        raise ValueError(f"invalid leaf card manifest {manifest_path}: {error}") from error
    recorded_hash = (manifest.content_hashes or {}).get("cards.jsonl")
    if recorded_hash is None:
        raise ValueError(f"{manifest_path} does not bind cards.jsonl")
    cards_hash = sha256_file(cards_path)
    if cards_hash != recorded_hash:
        raise ValueError(f"{cards_path} does not match its card manifest")
    if not isinstance(manifest.details, dict):
        raise TypeError(f"{manifest_path} must declare details.relation_source")

    try:
        source = RelationSourceSpec.model_validate(
            manifest.details.get("relation_source"),
            strict=True,
        )
        snapshot = SourceSnapshotIdentity.model_validate(
            manifest.details.get("snapshot"),
            strict=True,
        )
    except ValidationError as error:
        raise ValueError(
            f"{manifest_path} must declare strict details.relation_source and details.snapshot"
        ) from error
    manifest_hash = sha256_bytes(manifest_bytes)
    return _LeafArtifact(
        cards_hash=cards_hash,
        manifest_hash=manifest_hash,
        artifact_id=card_artifact_id(cards_hash, manifest_hash),
        source=source,
        snapshot=snapshot,
    )


def _write_durable(path: Path, payload: bytes) -> None:
    with path.open("xb") as output:
        written = output.write(payload)
        if written != len(payload):
            raise OSError(f"short write for {path}: wrote {written} of {len(payload)} bytes")
        output.flush()
        os.fsync(output.fileno())


def publish_source_lineage(
    nodes: Iterable[LineageNode],
    *,
    cards_directory: PathLike,
    output_directory: PathLike,
    producer: str,
    snapshot: SourceSnapshotIdentity,
    raw_inputs: Mapping[str, PathLike],
    inverse_edge_kinds: tuple[InverseEdgeKind, ...],
    verifier: Callable[[PathLike], VerifiedSourceLineage],
) -> SourceLineagePaths:
    """Publish source lineage bound to an already finalized leaf card artifact."""
    card_artifact = _verify_leaf_card_artifact(Path(cards_directory))
    if snapshot != card_artifact.snapshot:
        raise ValueError("source lineage snapshot differs from the leaf card artifact")
    if not raw_inputs:
        raise ValueError("source lineage requires at least one identity-bearing raw input")
    policy = SourceLineagePolicy(inverse_edge_kinds=inverse_edge_kinds)
    ordered = validate_lineage_nodes(
        tuple(nodes),
        source_namespace=card_artifact.source.namespace,
        policy=policy,
    )
    input_hashes: dict[str, Sha256Hex] = {
        "cards.jsonl": card_artifact.cards_hash,
        "cards.manifest.json": card_artifact.manifest_hash,
    }
    for name, input_path in raw_inputs.items():
        if not name:
            raise ValueError("raw input names must not be empty")
        if name in input_hashes:
            raise ValueError(f"raw input name {name!r} collides with a card artifact input")
        input_hashes[name] = sha256_file(input_path)
    input_hashes = dict(sorted(input_hashes.items()))

    output = Path(output_directory)
    output.mkdir(parents=True, exist_ok=True)
    lineage_path = output / "lineage.jsonl"
    manifest_path = output / "lineage.manifest.json"
    if lineage_path.exists() or manifest_path.exists():
        raise FileExistsError(f"source lineage destination already contains an artifact: {output}")

    lineage_payload = b"".join(canonical_json_bytes(node) + b"\n" for node in ordered)
    lineage_hash = sha256_bytes(lineage_payload)
    artifact_id = source_lineage_artifact_id(
        source=card_artifact.source,
        snapshot=snapshot,
        policy=policy,
        input_hashes=input_hashes,
        lineage_hash=lineage_hash,
    )
    manifest = SourceLineageManifest.make(
        producer=producer,
        input_hashes=input_hashes,
        content_hashes={"lineage.jsonl": lineage_hash},
        details=SourceLineageDetails(
            relation_source=card_artifact.source,
            snapshot=snapshot,
            leaf_card_artifact=LeafCardArtifact(
                artifact_id=card_artifact.artifact_id,
                cards_hash=card_artifact.cards_hash,
                manifest_hash=card_artifact.manifest_hash,
            ),
            edge_policy=policy,
            counts=_observed_counts(ordered),
            lineage_hash=lineage_hash,
            artifact_id=artifact_id,
        ),
    )
    manifest_payload = (
        json.dumps(
            manifest.model_dump(mode="json"),
            sort_keys=True,
            indent=2,
            ensure_ascii=False,
        ).encode("utf-8")
        + b"\n"
    )

    try:
        _write_durable(lineage_path, lineage_payload)
        _write_durable(manifest_path, manifest_payload)
        verifier(output)
    except BaseException:
        manifest_path.unlink(missing_ok=True)
        lineage_path.unlink(missing_ok=True)
        raise

    return SourceLineagePaths(lineage_jsonl=lineage_path, manifest=manifest_path)
