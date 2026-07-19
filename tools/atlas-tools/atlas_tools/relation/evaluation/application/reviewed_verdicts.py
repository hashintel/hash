"""Export human-confirmed placement verdicts for the Rust SALT trainer."""

from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal

from pydantic import ConfigDict, Field

from atlas_tools.common import canonical_json_bytes, sha256_bytes
from atlas_tools.relation.domain.api import (
    FrozenMapping,
    FrozenModel,
    NonEmptyStr,
    RelationId,
    Sha256Hex,
)
from atlas_tools.relation.evaluation.application._analysis_codec import atomic_replace
from atlas_tools.relation.evaluation.application.target_resolution import (
    classifier_target_resolution_source_hashes,
    load_target_resolutions,
)
from atlas_tools.relation.evaluation.domain.api import HumanPlacementAction
from atlas_tools.relation.evaluation.storage.api import load_deck

REVIEWED_VERDICTS_SCHEMA: Final = "atlas-reviewed-verdicts/1"
REVIEWED_VERDICTS_FILENAME: Final = "reviewed-verdicts.json"

type PlacementClass = Literal["coincident", "proximal", "overlay"]


class _WireModel(FrozenModel):
    """Validate by field name and serialize the wire aliases."""

    model_config = ConfigDict(serialize_by_alias=True, validate_by_name=True)


class TypeVerdict(_WireModel):
    """One human-confirmed placement class for a relation type.

    ``relation`` is the corpus relation identity in ``namespace:local_id``
    form; ``hash``-namespace local ids are versioned type URLs.
    """

    relation: RelationId
    placement_class: PlacementClass = Field(alias="class")
    reviewer: NonEmptyStr


class PairVerdict(_WireModel):
    """One human-confirmed placement class for a concrete entity pair.

    Emission sorts pairs by ``(left, right)``. The corpus records no
    pair-level human reviews, so exports carry an empty list.
    """

    left: NonEmptyStr
    right: NonEmptyStr
    placement_class: PlacementClass = Field(alias="class")
    kind: NonEmptyStr


class ReviewedVerdictsDocument(_WireModel):
    """The complete ``atlas-reviewed-verdicts/1`` wire document."""

    schema_id: Literal["atlas-reviewed-verdicts/1"] = Field(
        default=REVIEWED_VERDICTS_SCHEMA,
        alias="schema",
    )
    type_verdicts: tuple[TypeVerdict, ...]
    pair_verdicts: tuple[PairVerdict, ...]
    sources: FrozenMapping[NonEmptyStr, Sha256Hex]


@dataclass(frozen=True, slots=True, kw_only=True)
class ReviewedVerdictsArtifact:
    """Describe one published reviewed-verdicts document."""

    path: Path
    content_hash: Sha256Hex
    coincident_count: int
    proximal_count: int
    overlay_count: int
    excluded_count: int


def export_reviewed_verdicts(
    *,
    resolutions_directory: Path,
    soft_labels_path: Path,
    cards_directory: Path,
    output_path: Path,
) -> ReviewedVerdictsArtifact:
    """Export the corpus's human placement verdicts as one wire document.

    Verdicts come exclusively from the verified target-resolution artifact:
    the corpus's only human-authored placement classes. Verification is the
    corpus loader's own: exact bytes, manifest identity, bound sources, and
    every-and-only ambiguous coverage against the soft labels and card deck.
    ``excluded`` resolutions are supervised exclusions rather than placement
    classes; the document omits them and the returned artifact counts them.
    Coincident evidence reviews audit synthetic votes and never export as
    human placement verdicts.

    Raises:
        ValueError: The resolutions, soft labels, or deck violate the corpus
            verification contract.
        OSError: An input cannot be read or the output cannot be published.

    """
    deck = load_deck(cards_directory)
    resolutions = load_target_resolutions(
        resolutions_directory,
        soft_labels=soft_labels_path,
        expected_cards_hash=deck.source_hashes["cards.jsonl"],
        expected_cards_manifest_hash=deck.source_hashes["cards.manifest.json"],
    )

    reviewer = resolutions.manifest.reviewer
    type_verdicts: list[TypeVerdict] = []
    excluded_count = 0
    for row in resolutions.rows:
        placement = _placement_class(row.action)
        if placement is None:
            excluded_count += 1
            continue
        type_verdicts.append(
            TypeVerdict(relation=row.relation_id, placement_class=placement, reviewer=reviewer)
        )

    document = ReviewedVerdictsDocument(
        type_verdicts=tuple(type_verdicts),
        pair_verdicts=(),
        sources={
            **resolutions.manifest.source_hashes,
            **classifier_target_resolution_source_hashes(resolutions),
        },
    )
    payload = canonical_json_bytes(document) + b"\n"
    atomic_replace(output_path, payload)

    counts = Counter(verdict.placement_class for verdict in type_verdicts)
    return ReviewedVerdictsArtifact(
        path=output_path,
        content_hash=sha256_bytes(payload),
        coincident_count=counts["coincident"],
        proximal_count=counts["proximal"],
        overlay_count=counts["overlay"],
        excluded_count=excluded_count,
    )


def _placement_class(action: HumanPlacementAction) -> PlacementClass | None:
    match action:
        case "excluded":
            return None
        case "coincident" | "proximal" | "overlay":
            return action


__all__ = [
    "REVIEWED_VERDICTS_FILENAME",
    "REVIEWED_VERDICTS_SCHEMA",
    "PairVerdict",
    "PlacementClass",
    "ReviewedVerdictsArtifact",
    "ReviewedVerdictsDocument",
    "TypeVerdict",
    "export_reviewed_verdicts",
]
