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
from atlas_tools.relation.evaluation.application.fit_inputs import (
    card_versioned_url,
    raw_concat_cards,
)
from atlas_tools.relation.evaluation.application.placement_confirmation import (
    load_placement_confirmations,
    placement_confirmation_source_hashes,
)
from atlas_tools.relation.evaluation.application.target_resolution import (
    classifier_target_resolution_source_hashes,
    load_target_resolutions,
)
from atlas_tools.relation.evaluation.domain.api import HumanPlacementAction
from atlas_tools.relation.evaluation.storage.api import VerifiedDeck, load_deck

REVIEWED_VERDICTS_SCHEMA: Final = "atlas-reviewed-verdicts/1"
REVIEWED_VERDICTS_FILENAME: Final = "reviewed-verdicts.json"

type PlacementClass = Literal["coincident", "proximal", "overlay"]


class _WireModel(FrozenModel):
    """Validate by field name and serialize the wire aliases."""

    model_config = ConfigDict(serialize_by_alias=True, validate_by_name=True)


class TypeVerdict(_WireModel):
    """One human-confirmed placement class for a relation type.

    ``relation`` is the corpus relation identity in ``namespace:local_id``
    form (``hash``-namespace local ids are base type URLs with a trailing
    slash) and is provenance only. ``versioned_url`` names the exact type
    version whose card the human reviewed and is the trainer's resolution
    key; it is null for cards whose producer records no versioned URL.
    """

    relation: RelationId
    placement_class: PlacementClass = Field(alias="class")
    reviewer: NonEmptyStr
    versioned_url: NonEmptyStr | None


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
    missing_versioned_url_count: int


@dataclass(frozen=True, slots=True, kw_only=True)
class _AttributedVerdict:
    """One placement decision joined with its artifact's reviewer."""

    relation_id: RelationId
    action: HumanPlacementAction
    reviewer: str
    artifact: str


def export_reviewed_verdicts(
    *,
    resolutions_directory: Path,
    soft_labels_path: Path,
    cards_directory: Path,
    output_path: Path,
    confirmations_directory: Path | None = None,
) -> ReviewedVerdictsArtifact:
    """Export the corpus's human placement verdicts as one wire document.

    Verdicts merge the verified target-resolution artifact (human placement
    classes for ambiguous types) with the verified placement-confirmation
    artifact when one is supplied (voluntary human confirmations of
    unambiguous types). Both artifacts bind the same soft labels and deck;
    the merge is uniform, so the document never records which artifact a
    verdict came from, and a relation carrying verdicts from both artifacts
    fails loudly with both classes named. Verification is the corpus
    loaders' own: exact bytes, manifest identity, bound sources, and the
    population contract of each artifact. ``excluded`` decisions are
    supervised exclusions rather than placement classes; the document omits
    them and the returned artifact counts them. Coincident evidence reviews
    audit synthetic votes and never export as human placement verdicts.

    Raises:
        ValueError: The resolutions, confirmations, soft labels, or deck
            violate the corpus verification contract, or the two artifacts
            both carry a verdict for one relation.
        OSError: An input cannot be read or the output cannot be published.

    """
    deck = load_deck(cards_directory)
    resolutions = load_target_resolutions(
        resolutions_directory,
        soft_labels=soft_labels_path,
        expected_cards_hash=deck.source_hashes["cards.jsonl"],
        expected_cards_manifest_hash=deck.source_hashes["cards.manifest.json"],
    )
    confirmations = (
        None
        if confirmations_directory is None
        else load_placement_confirmations(
            confirmations_directory,
            soft_labels=soft_labels_path,
            expected_cards_hash=deck.source_hashes["cards.jsonl"],
            expected_cards_manifest_hash=deck.source_hashes["cards.manifest.json"],
        )
    )
    url_by_relation = _versioned_urls(deck)

    merged: dict[RelationId, _AttributedVerdict] = {}
    for verdict in (
        *(
            _AttributedVerdict(
                relation_id=row.relation_id,
                action=row.action,
                reviewer=resolutions.manifest.reviewer,
                artifact="target resolutions",
            )
            for row in resolutions.rows
        ),
        *(
            ()
            if confirmations is None
            else (
                _AttributedVerdict(
                    relation_id=row.relation_id,
                    action=row.action,
                    reviewer=confirmations.manifest.reviewer,
                    artifact="placement confirmations",
                )
                for row in confirmations.rows
            )
        ),
    ):
        existing = merged.get(verdict.relation_id)
        if existing is not None:
            raise ValueError(
                f"relation {verdict.relation_id} carries verdicts from both artifacts: "
                f"{existing.action} ({existing.artifact}) and "
                f"{verdict.action} ({verdict.artifact})"
            )
        merged[verdict.relation_id] = verdict

    type_verdicts: list[TypeVerdict] = []
    excluded_count = 0
    missing_url_count = 0
    for relation_id in sorted(merged):
        verdict = merged[relation_id]
        placement = _placement_class(verdict.action)
        if placement is None:
            excluded_count += 1
            continue
        versioned_url = url_by_relation[relation_id]
        if versioned_url is None:
            missing_url_count += 1
        type_verdicts.append(
            TypeVerdict(
                relation=relation_id,
                placement_class=placement,
                reviewer=verdict.reviewer,
                versioned_url=versioned_url,
            )
        )

    document = ReviewedVerdictsDocument(
        type_verdicts=tuple(type_verdicts),
        pair_verdicts=(),
        sources={
            **resolutions.manifest.source_hashes,
            **classifier_target_resolution_source_hashes(resolutions),
            **(
                {} if confirmations is None else placement_confirmation_source_hashes(confirmations)
            ),
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
        missing_versioned_url_count=missing_url_count,
    )


def _versioned_urls(deck: VerifiedDeck) -> dict[RelationId, str | None]:
    raw_cards = raw_concat_cards(deck.cards_path)
    projected = tuple((card.relation_id, card.card_hash) for card in deck.cards)
    raw = tuple((card.relation_id, card.card_hash) for card in raw_cards)
    if raw != projected:
        raise ValueError("raw cards and the verified evaluation deck do not share one exact domain")
    return {card.relation_id: card_versioned_url(card) for card in raw_cards}


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
