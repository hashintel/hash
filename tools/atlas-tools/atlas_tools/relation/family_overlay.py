"""Apply reviewed relation-family assignments to a verified concat artifact.

The source artifacts do not define a complete semantic-family policy. This
module therefore treats the assignment file as an explicit reviewed input: it
must cover the deck exactly and bind every relation to the card hash that was
reviewed. The transform publishes a fresh concat directory only after all rows
and all declared input hashes have been verified.
"""

import hashlib
import os
import shutil
import tempfile
from dataclasses import dataclass
from os import PathLike
from pathlib import Path
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    StringConstraints,
    TypeAdapter,
    ValidationError,
)

from atlas_tools.common import Sha256Hex, canonical_json_bytes, sha256_file
from atlas_tools.relation.concat import (
    FAMILY_OVERLAY_ALGORITHM,
    ConcatCardRow,
    ConcatConfig,
    ConcatDetails,
    ConcatInput,
    ConcatPaths,
    ConcatProvenance,
    FamilyOverlayDetails,
    VerifiedConcatArtifact,
    concat_input_hashes,
    verify_concat_artifact,
)
from atlas_tools.relation_cards.common.cards import RelationId

_CONTROL_CHARACTER_BOUND = 32
_DELETE = 127


def _validate_family_id(value: str) -> str:
    if value != value.strip():
        raise ValueError("family_id must not have outer whitespace")
    if any(
        ord(character) < _CONTROL_CHARACTER_BOUND or ord(character) == _DELETE
        for character in value
    ):
        raise ValueError("family_id must not contain control characters")
    return value


type RelationFamilyId = Annotated[
    str,
    StringConstraints(min_length=1),
    AfterValidator(_validate_family_id),
]

_FAMILY_ID_ADAPTER = TypeAdapter(RelationFamilyId)


class FamilyAssignment(BaseModel):
    """Bind one reviewed card version to its semantic relation family."""

    schema_version: Literal[1]
    relation_id: RelationId
    card_hash: Sha256Hex
    family_id: RelationFamilyId

    model_config = ConfigDict(extra="forbid", frozen=True)


@dataclass(frozen=True, slots=True)
class _LoadedAssignments:
    by_relation_id: dict[RelationId, FamilyAssignment]
    content_hash: Sha256Hex


def _require_absent_destination(path: Path, *, publication_started: bool) -> None:
    if path.exists() or path.is_symlink():
        state = "appeared during publication" if publication_started else "already exists"
        raise FileExistsError(f"family overlay destination {state}: {path}")


def _load_assignments(path: Path) -> _LoadedAssignments:
    assignments: dict[RelationId, FamilyAssignment] = {}
    digest = hashlib.sha256()

    with path.open("rb") as input_file:
        for line_number, line in enumerate(input_file, start=1):
            digest.update(line)
            if not line.strip():
                continue
            try:
                assignment = FamilyAssignment.model_validate_json(line, strict=True)
            except ValidationError as error:
                raise ValueError(
                    f"invalid family assignment {path} line {line_number}: {error}"
                ) from error

            if assignment.relation_id in assignments:
                raise ValueError(
                    f"duplicate family assignment for {assignment.relation_id} "
                    f"at {path} line {line_number}"
                )
            assignments[assignment.relation_id] = assignment

    return _LoadedAssignments(
        by_relation_id=assignments,
        content_hash=digest.hexdigest(),
    )


def _coverage_error(*, missing: set[RelationId], unexpected: set[RelationId]) -> ValueError:
    problems: list[str] = []
    if missing:
        problems.append(
            f"missing {len(missing)} deck relations, for example {tuple(sorted(missing)[:5])}"
        )
    if unexpected:
        problems.append(
            "contains "
            f"{len(unexpected)} relations absent from the deck, for example "
            f"{tuple(sorted(unexpected)[:5])}"
        )
    return ValueError("family assignments must cover the deck exactly: " + "; ".join(problems))


def _enrich_row(row: ConcatCardRow, assignment: FamilyAssignment) -> ConcatCardRow:
    if assignment.card_hash != row.card_hash:
        raise ValueError(
            f"family assignment for {row.relation_id} binds card_hash "
            f"{assignment.card_hash}, but the deck contains {row.card_hash}"
        )

    payload = row.model_dump(mode="json")
    existing = payload.get("family_id")
    if existing is not None:
        try:
            existing_family = _FAMILY_ID_ADAPTER.validate_python(existing, strict=True)
        except ValidationError as error:
            raise ValueError(
                f"deck relation {row.relation_id} has an invalid existing family_id: {error}"
            ) from error
        if existing_family != assignment.family_id:
            raise ValueError(
                f"family assignment for {row.relation_id} conflicts with existing family_id "
                f"{existing_family!r}"
            )

    payload["family_id"] = assignment.family_id
    enriched = ConcatCardRow.model_validate(payload, strict=True)
    if (
        enriched.relation_id,
        enriched.card_text,
        enriched.card_hash,
    ) != (row.relation_id, row.card_text, row.card_hash):
        raise RuntimeError("family overlay changed immutable card identity")
    return enriched


def _write_cards(
    path: Path,
    *,
    source: VerifiedConcatArtifact,
    assignments: _LoadedAssignments,
) -> tuple[int, int]:
    rows = source.rows()
    seen: set[RelationId] = set()
    missing: set[RelationId] = set()
    row_count = 0

    with path.open("xb") as output:
        for row in rows:
            if row.relation_id in seen:
                raise ValueError(f"source deck contains duplicate relation_id {row.relation_id}")
            seen.add(row.relation_id)

            assignment = assignments.by_relation_id.get(row.relation_id)
            if assignment is None:
                missing.add(row.relation_id)
                continue

            output.write(canonical_json_bytes(_enrich_row(row, assignment)) + b"\n")
            row_count += 1

        output.flush()
        os.fsync(output.fileno())

    unexpected = set(assignments.by_relation_id) - seen
    if missing or unexpected:
        raise _coverage_error(missing=missing, unexpected=unexpected)
    return row_count, len({item.family_id for item in assignments.by_relation_id.values()})


def apply_family_overlay(
    cards: PathLike,
    assignments: PathLike,
    *,
    out: PathLike,
) -> ConcatPaths:
    """Publish a new concat artifact carrying an exact reviewed family mapping.

    ``assignments`` is JSONL with one schema-v1 :class:`FamilyAssignment` per
    source row. Missing, extra, duplicate, stale, or conflicting assignments
    fail without publishing ``out``. The destination must not already exist.
    """
    output_directory = Path(out)
    _require_absent_destination(output_directory, publication_started=False)

    source = verify_concat_artifact(cards)
    mapping_path = Path(assignments)
    loaded = _load_assignments(mapping_path)
    output_directory.parent.mkdir(parents=True, exist_ok=True)
    temporary_directory = Path(
        tempfile.mkdtemp(
            prefix=f".{output_directory.name}.family-overlay-",
            dir=output_directory.parent,
        )
    )
    try:
        cards_path = temporary_directory / "cards.jsonl"
        row_count, family_count = _write_cards(
            cards_path,
            source=source,
            assignments=loaded,
        )

        details = ConcatDetails(
            sources=source.provenance.details.sources,
            inputs=[
                ConcatInput(
                    artifact_id=source.artifact_id,
                    cards_hash=source.cards_hash,
                    manifest_hash=source.manifest_hash,
                )
            ],
            row_count=row_count,
            family_overlay=FamilyOverlayDetails(
                algorithm=FAMILY_OVERLAY_ALGORITHM,
                assignments_hash=loaded.content_hash,
                assignment_count=row_count,
                family_count=family_count,
            ),
        )
        provenance = ConcatProvenance.make(
            producer="relation.concat",
            input_hashes=concat_input_hashes(details),
            content_hashes={"cards.jsonl": sha256_file(cards_path)},
            config=ConcatConfig(
                source_configs={
                    namespace: item.config for namespace, item in sorted(details.sources.items())
                }
            ),
            details=details,
        )
        manifest_path = provenance.write(temporary_directory / "cards.manifest.json")
        with manifest_path.open("rb") as manifest:
            os.fsync(manifest.fileno())

        _require_absent_destination(output_directory, publication_started=True)
        temporary_directory.rename(output_directory)
    except BaseException:
        shutil.rmtree(temporary_directory, ignore_errors=True)
        raise

    return ConcatPaths(
        cards_jsonl=output_directory / "cards.jsonl",
        manifest=output_directory / "cards.manifest.json",
    )
