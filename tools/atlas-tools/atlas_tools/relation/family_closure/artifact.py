"""Verify and durably publish relation-family closure artifacts."""

import hashlib
import json
import os
import shutil
import tempfile
from collections import defaultdict
from collections.abc import Iterable
from os import PathLike
from pathlib import Path
from types import MappingProxyType

from pydantic import ValidationError

from atlas_tools.common import canonical_json_bytes, sha256_bytes, sha256_file
from atlas_tools.relation.concat import VerifiedConcatArtifact, verify_concat_artifact
from atlas_tools.relation.domain.api import RelationId, RelationNamespace, Sha256Hex
from atlas_tools.relation.family_closure.algorithm import (
    derive_family_assignments,
    family_id_for_relations,
)
from atlas_tools.relation.family_closure.domain import (
    FAMILIES_FILENAME,
    MANIFEST_FILENAME,
    ClosureConcatInput,
    ClosureLineageInput,
    FamilyAssignmentRow,
    FamilyClosureDetails,
    FamilyClosureManifest,
    FamilyClosurePaths,
    FamilyId,
    VerifiedFamilyClosure,
    closure_input_hashes,
    family_closure_artifact_id,
)
from atlas_tools.relation.lineage.api import VerifiedSourceLineage, verify_source_lineage


def _read_manifest(path: Path) -> tuple[bytes, FamilyClosureManifest]:
    try:
        payload = path.read_bytes()
        manifest = FamilyClosureManifest.model_validate_json(payload, strict=True)
    except (OSError, ValidationError) as error:
        raise ValueError(f"invalid family closure manifest {path}: {error}") from error
    return payload, manifest


def _read_rows(path: Path, expected_hash: Sha256Hex) -> tuple[FamilyAssignmentRow, ...]:
    digest = hashlib.sha256()
    rows: list[FamilyAssignmentRow] = []
    previous: RelationId | None = None
    try:
        stream = path.open("rb")
    except OSError as error:
        raise ValueError(f"cannot read family closure {path}: {error}") from error
    with stream:
        for line_number, raw_line in enumerate(stream, start=1):
            digest.update(raw_line)
            if not raw_line.endswith(b"\n"):
                raise ValueError(f"{path} line {line_number} must end with a newline")
            if not raw_line.strip():
                raise ValueError(f"{path} line {line_number} must not be blank")
            try:
                row = FamilyAssignmentRow.model_validate_json(raw_line, strict=True)
            except (TypeError, ValidationError) as error:
                raise ValueError(f"invalid {path} line {line_number}: {error}") from error
            if previous is not None and row.relation_id <= previous:
                raise ValueError(
                    f"{path} rows must use strictly ascending relation_id order; "
                    f"found {row.relation_id} after {previous}"
                )
            previous = row.relation_id
            rows.append(row)
    if digest.hexdigest() != expected_hash:
        raise ValueError(f"{path} does not match the content hash recorded in its manifest")
    return tuple(rows)


def _validate_family_ids(rows: tuple[FamilyAssignmentRow, ...]) -> None:
    relations_by_family: dict[FamilyId, list[RelationId]] = defaultdict(list)
    for row in rows:
        relations_by_family[row.family_id].append(row.relation_id)
    for family_id, relation_ids in relations_by_family.items():
        if family_id != family_id_for_relations(relation_ids):
            raise ValueError(f"family {family_id} differs from its deterministic recomputation")


def _projected_counts(rows: tuple[FamilyAssignmentRow, ...]) -> tuple[int, int]:
    component_sizes: dict[FamilyId, int] = defaultdict(int)
    for row in rows:
        component_sizes[row.family_id] += 1
    return len(component_sizes), max(component_sizes.values(), default=0)


def _verify_concat_binding(
    closure: VerifiedFamilyClosure,
    concat: VerifiedConcatArtifact,
) -> None:
    details = closure.manifest.details.concat
    if (
        details.artifact_id != concat.artifact_id
        or details.cards_hash != concat.cards_hash
        or details.manifest_hash != concat.manifest_hash
    ):
        raise ValueError("family closure is bound to a different concat artifact")
    deck_rows = tuple(concat.rows())
    deck = {row.relation_id: row.card_hash for row in deck_rows}
    assigned = {row.relation_id: row.card_hash for row in closure.rows}
    missing = tuple(sorted(set(deck) - set(assigned)))
    extra = tuple(sorted(set(assigned) - set(deck)))
    if missing or extra:
        raise ValueError(f"family closure deck coverage differs: missing={missing}, extra={extra}")
    stale = tuple(
        relation_id for relation_id in sorted(deck) if deck[relation_id] != assigned[relation_id]
    )
    if stale:
        raise ValueError(f"family closure carries stale card hashes for relations {stale}")


def verify_family_closure(
    directory: PathLike,
    *,
    concat_directory: PathLike | None = None,
) -> VerifiedFamilyClosure:
    """Verify closure bytes, deterministic family IDs, counts, and optional deck binding."""
    artifact_directory = Path(directory)
    families_path = artifact_directory / FAMILIES_FILENAME
    manifest_path = artifact_directory / MANIFEST_FILENAME
    manifest_bytes, manifest = _read_manifest(manifest_path)
    rows = _read_rows(families_path, manifest.details.families_hash)
    _validate_family_ids(rows)
    components, largest = _projected_counts(rows)
    counts = manifest.details.counts
    if counts.cards != len(rows):
        raise ValueError(f"closure manifest records {counts.cards} cards, found {len(rows)}")
    if counts.components != components:
        raise ValueError(
            f"closure manifest records {counts.components} components, found {components}"
        )
    if counts.largest_component != largest:
        raise ValueError("closure manifest largest_component differs from the assignment rows")
    verified = VerifiedFamilyClosure(
        directory=artifact_directory,
        families_path=families_path,
        manifest_path=manifest_path,
        families_hash=manifest.details.families_hash,
        manifest_hash=sha256_bytes(manifest_bytes),
        manifest=manifest,
        rows=rows,
        by_relation_id=MappingProxyType({row.relation_id: row for row in rows}),
    )
    if concat_directory is not None:
        _verify_concat_binding(verified, verify_concat_artifact(concat_directory))
    return verified


def _collect_lineages(directories: Iterable[PathLike]) -> tuple[VerifiedSourceLineage, ...]:
    artifacts = tuple(verify_source_lineage(directory) for directory in directories)
    if not artifacts:
        raise ValueError("at least one source lineage artifact is required")
    by_namespace: dict[RelationNamespace, VerifiedSourceLineage] = {}
    for artifact in artifacts:
        namespace = artifact.manifest.details.relation_source.namespace
        if namespace in by_namespace:
            raise ValueError(f"duplicate source lineage namespace {namespace}")
        by_namespace[namespace] = artifact
    return tuple(by_namespace[namespace] for namespace in sorted(by_namespace))


def _lineage_inputs(
    lineages: tuple[VerifiedSourceLineage, ...],
) -> tuple[ClosureLineageInput, ...]:
    return tuple(
        ClosureLineageInput(
            namespace=lineage.manifest.details.relation_source.namespace,
            producer=lineage.manifest.producer,
            artifact_id=lineage.manifest.details.artifact_id,
            lineage_hash=lineage.lineage_hash,
            manifest_hash=lineage.manifest_hash,
            nodes=lineage.manifest.details.counts.nodes,
            extends_edges=lineage.manifest.details.counts.extends_edges,
            inverse_edges=lineage.manifest.details.counts.inverse_edges,
        )
        for lineage in lineages
    )


def _input_paths(
    concat: VerifiedConcatArtifact,
    lineages: tuple[VerifiedSourceLineage, ...],
) -> dict[str, Path]:
    paths = {
        "cards/cards.jsonl": concat.cards_path,
        "cards/cards.manifest.json": concat.manifest_path,
    }
    for lineage in lineages:
        namespace = lineage.manifest.details.relation_source.namespace
        prefix = f"lineage/{namespace}"
        paths[f"{prefix}/lineage.jsonl"] = lineage.lineage_path
        paths[f"{prefix}/lineage.manifest.json"] = lineage.manifest_path
    return dict(sorted(paths.items()))


def _write_durable(path: Path, payload: bytes) -> None:
    with path.open("xb") as output:
        written = output.write(payload)
        if written != len(payload):
            raise OSError(f"short write for {path}: wrote {written} of {len(payload)} bytes")
        output.flush()
        os.fsync(output.fileno())


def _sync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _manifest_bytes(manifest: FamilyClosureManifest) -> bytes:
    return (
        json.dumps(
            manifest.model_dump(mode="json"),
            sort_keys=True,
            indent=2,
            ensure_ascii=False,
        ).encode("utf-8")
        + b"\n"
    )


def publish_family_closure(
    cards_directory: PathLike,
    lineage_directories: Iterable[PathLike],
    *,
    output_directory: PathLike,
) -> FamilyClosurePaths:
    """Validate all inputs and atomically publish their overlap-safe components."""
    destination = Path(output_directory)
    if destination.exists():
        raise FileExistsError(f"family closure destination already exists: {destination}")
    concat = verify_concat_artifact(cards_directory)
    lineages = _collect_lineages(lineage_directories)
    policy, assignments, counts = derive_family_assignments(concat, lineages)
    concat_input = ClosureConcatInput(
        artifact_id=concat.artifact_id,
        cards_hash=concat.cards_hash,
        manifest_hash=concat.manifest_hash,
    )
    families_payload = b"".join(canonical_json_bytes(row) + b"\n" for row in assignments)
    families_hash = sha256_bytes(families_payload)
    provisional_details = FamilyClosureDetails(
        edge_policy=policy,
        concat=concat_input,
        source_lineages=_lineage_inputs(lineages),
        families_hash=families_hash,
        counts=counts,
        artifact_id="0" * 64,
    )
    input_hashes = closure_input_hashes(provisional_details)
    details = provisional_details.model_copy(
        update={
            "artifact_id": family_closure_artifact_id(
                policy=policy,
                input_hashes=input_hashes,
                families_hash=families_hash,
            )
        }
    )
    manifest = FamilyClosureManifest.make(
        producer="relation.family-closure",
        input_hashes=input_hashes,
        content_hashes={FAMILIES_FILENAME: families_hash},
        details=details,
    )
    input_paths = _input_paths(concat, lineages)
    observed_inputs = {name: sha256_file(path) for name, path in input_paths.items()}
    if observed_inputs != input_hashes:
        raise ValueError("closure inputs changed after verification")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(
        tempfile.mkdtemp(
            prefix=f".{destination.name}.staging-",
            dir=destination.parent,
        )
    )
    published = False
    try:
        _write_durable(temporary / FAMILIES_FILENAME, families_payload)
        _write_durable(temporary / MANIFEST_FILENAME, _manifest_bytes(manifest))
        _sync_directory(temporary)
        verify_family_closure(temporary)
        final_inputs = {name: sha256_file(path) for name, path in input_paths.items()}
        if final_inputs != input_hashes:
            raise ValueError("closure inputs changed during publication")
        os.rename(temporary, destination)  # noqa: PTH104 -- required publication primitive
        published = True
        _sync_directory(destination.parent)
    finally:
        if not published:
            shutil.rmtree(temporary, ignore_errors=True)
    return FamilyClosurePaths(
        families_jsonl=destination / FAMILIES_FILENAME,
        manifest=destination / MANIFEST_FILENAME,
    )
