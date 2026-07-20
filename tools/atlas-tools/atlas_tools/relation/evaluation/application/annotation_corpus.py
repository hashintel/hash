"""Assemble the ``atlas-annotation-corpus/1`` wire document.

The document supplies the Rust SALT trainer's annotation ingestion seam
(PLAN-INGEST wire schema v0.1): per card, the structured content the
canonical Rust template consumes, the leakage axes, the corpus flags, and
the verbatim per-vote records. Counts are never shipped; Rust derives them
by counting, so the wire cannot disagree with itself.

This module is pure assembly over already-verified inputs. Content
resolution and artifact verification live in ``annotation_corpus_export``.
"""

from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Final, Literal

from pydantic import ConfigDict, Field, NonNegativeInt

from atlas_tools.common import canonical_json_bytes
from atlas_tools.relation.domain.api import (
    FrozenMapping,
    FrozenModel,
    NonEmptyStr,
    RelationId,
    Sha256Hex,
)
from atlas_tools.relation.evaluation.domain.api import (
    CorpusRecord,
    EvaluationCard,
    FiniteFloat,
    ReasoningEffort,
    Verdict,
    Vote,
)
from atlas_tools.relation.family_closure.api import FamilyAssignmentRow
from atlas_tools.relation_cards.common.api import (
    RelationCardInput,
    RelationDirection,
)
from atlas_tools.relation_cards.common.card import lint_card_text

ANNOTATION_CORPUS_SCHEMA: Final = "atlas-annotation-corpus/1"
ANNOTATION_CORPUS_FILENAME: Final = "annotation-corpus.json"

type CardSource = Literal["hash", "wikidata"]
type WireVerdict = Literal["coincident", "proximal", "overlay", "unclear", "abstain"]


class _WireModel(FrozenModel):
    """Validate by field name and serialize the wire aliases."""

    model_config = ConfigDict(serialize_by_alias=True, validate_by_name=True)


class WirePhrase(_WireModel):
    """A transferable label plus optional description; the key is always written."""

    label: NonEmptyStr
    description: str | None


class WireEndpointConstraint(_WireModel):
    """One source type's allowed target types and per-source cardinality."""

    source_type: WirePhrase
    target_types: tuple[WirePhrase, ...]
    minimum_targets: NonNegativeInt | None
    maximum_targets: NonNegativeInt | None


class WireConstraints(_WireModel):
    """Tri-state constraint facts plus the required direction enum.

    The four boolean fields are tri-state per the v0.1 ruling: ``true``,
    ``false`` (negative assertion), ``null`` (the source does not record the
    fact). ``direction`` is carved out as a required enum.
    """

    symmetric: bool | None
    transitive: bool | None
    single_value: bool | None
    distinct_values: bool | None
    direction: RelationDirection


class WireExample(_WireModel):
    """One identifier-free example pair and its optional stratum label."""

    subject_label: NonEmptyStr
    object_label: NonEmptyStr
    stratum_label: str | None


class WireContent(_WireModel):
    """The structured fields the canonical Rust card template consumes.

    ``slug`` is resolved export-side (v0.1 ruling; Rust never ports
    slugify). ``retrieved_at`` and ``source_record_hash`` are the
    immutability pin for unversioned sources; both are null for hash cards,
    whose pin is the versioned URL itself.
    """

    language: NonEmptyStr
    title: NonEmptyStr
    description: str | None
    aliases: tuple[NonEmptyStr, ...]
    inverse: WirePhrase | None
    ancestors: tuple[WirePhrase, ...]
    endpoint_constraints: tuple[WireEndpointConstraint, ...]
    source_types: tuple[WirePhrase, ...]
    target_types: tuple[WirePhrase, ...]
    constraints: WireConstraints
    examples: tuple[WireExample, ...]
    slug: NonEmptyStr
    retrieved_at: str | None
    source_record_hash: Sha256Hex | None


class WireAxes(_WireModel):
    """Leakage axes; Rust unions shared values into fold groups.

    ``base_url`` is a grouping axis only, never an identity (ruling).
    ``inverse_of`` values may reference identities outside the corpus.
    """

    family: NonEmptyStr
    inverse_of: tuple[NonEmptyStr, ...]
    base_url: NonEmptyStr
    publisher: NonEmptyStr


class WireFlags(_WireModel):
    """Corpus flags; handling is explicit assembly-side policy, never omission."""

    shot_excluded: bool
    holdout: Verdict | None
    prescreen_stratum: NonEmptyStr | None


class WireVote(_WireModel):
    """One verbatim vote with its SPEC 3.3.4a provenance.

    ``quantization`` is honestly null: no provider route in the current
    corpus ever reported it. ``card_hash`` is the exact voted rendering.
    """

    verdict: WireVerdict
    model_pinned: NonEmptyStr
    model_returned: NonEmptyStr
    provider: NonEmptyStr
    quantization: None = None
    framing: NonEmptyStr
    effort: ReasoningEffort
    temperature: FiniteFloat | None
    seed: int | None
    repeat_index: NonNegativeInt
    card_hash: Sha256Hex
    prompt_pack_hash: Sha256Hex
    rubric_version: NonEmptyStr


class AnnotationCard(_WireModel):
    """One corpus card: identity, content, axes, flags, and verbatim votes."""

    identity: NonEmptyStr
    source: CardSource
    content: WireContent
    axes: WireAxes
    flags: WireFlags
    votes: tuple[WireVote, ...]


class AnnotationCorpusDocument(_WireModel):
    """The complete ``atlas-annotation-corpus/1`` wire document."""

    schema_id: Literal["atlas-annotation-corpus/1"] = Field(
        default=ANNOTATION_CORPUS_SCHEMA,
        alias="schema",
    )
    cards: tuple[AnnotationCard, ...]
    sources: FrozenMapping[NonEmptyStr, Sha256Hex]


@dataclass(frozen=True, slots=True, kw_only=True)
class ResolvedCardContent:
    """One relation's re-derived content and identity facts, hash-proved.

    ``rendered_card_hash`` is the hash of the Python template's rendering of
    ``card_input``; assembly requires it to equal the deck's card hash, so
    the exported content is provably the input behind the voted text.
    """

    source: CardSource
    identity: str
    base_url: str
    publisher: str
    inverse_of: tuple[str, ...]
    retrieved_at: str | None
    source_record_hash: Sha256Hex | None
    slug: str
    card_input: RelationCardInput
    rendered_card_hash: Sha256Hex


def _wire_phrase(label: str, description: str | None) -> WirePhrase:
    return WirePhrase(label=label, description=description)


def _wire_content(resolved: ResolvedCardContent) -> WireContent:
    card_input = resolved.card_input
    return WireContent(
        language=str(card_input.language),
        title=card_input.title,
        description=card_input.description,
        aliases=card_input.aliases,
        inverse=(
            None
            if card_input.inverse is None
            else _wire_phrase(card_input.inverse.label, card_input.inverse.description)
        ),
        ancestors=tuple(
            _wire_phrase(entry.label, entry.description) for entry in card_input.ancestors
        ),
        endpoint_constraints=tuple(
            WireEndpointConstraint(
                source_type=_wire_phrase(
                    entry.source_type.label,
                    entry.source_type.description,
                ),
                target_types=tuple(
                    _wire_phrase(target.label, target.description)
                    for target in entry.target_types
                ),
                minimum_targets=entry.minimum_targets,
                maximum_targets=entry.maximum_targets,
            )
            for entry in card_input.endpoint_constraints
        ),
        source_types=tuple(
            _wire_phrase(entry.label, entry.description) for entry in card_input.source_types
        ),
        target_types=tuple(
            _wire_phrase(entry.label, entry.description) for entry in card_input.target_types
        ),
        constraints=WireConstraints(
            symmetric=card_input.constraints.symmetric,
            transitive=card_input.constraints.transitive,
            single_value=card_input.constraints.single_value,
            distinct_values=card_input.constraints.distinct_values,
            direction=card_input.constraints.direction,
        ),
        examples=tuple(
            WireExample(
                subject_label=example.subject_label,
                object_label=example.object_label,
                stratum_label=example.stratum_label,
            )
            for example in card_input.examples
        ),
        slug=resolved.slug,
        retrieved_at=resolved.retrieved_at,
        source_record_hash=resolved.source_record_hash,
    )


def _content_strings(content: WireContent) -> tuple[str, ...]:
    phrases = (
        content.inverse,
        *content.ancestors,
        *content.source_types,
        *content.target_types,
        *(entry.source_type for entry in content.endpoint_constraints),
        *(target for entry in content.endpoint_constraints for target in entry.target_types),
    )
    return (
        content.title,
        *((content.description,) if content.description else ()),
        *content.aliases,
        *(
            text
            for phrase in phrases
            if phrase
            for text in (phrase.label, phrase.description or "")
        ),
        *(
            text
            for example in content.examples
            for text in (example.subject_label, example.object_label, example.stratum_label or "")
        ),
        content.slug,
    )


def _wire_verdict(vote: Vote) -> WireVerdict:
    if vote.verdict == "ABSTAIN":
        return "abstain"
    return vote.verdict


def _wire_vote(vote: Vote) -> WireVote:
    return WireVote(
        verdict=_wire_verdict(vote),
        model_pinned=vote.request.judge.model,
        model_returned=vote.model_returned,
        provider=vote.request.judge.provider_slug,
        framing=vote.bundle_id,
        effort=vote.effort,
        temperature=vote.temperature,
        seed=vote.seed,
        repeat_index=vote.repeat_index,
        card_hash=vote.card_hash,
        prompt_pack_hash=vote.prompt_pack_hash,
        rubric_version=vote.rubric_version,
    )


def _deduplicated(votes: Sequence[Vote]) -> dict[RelationId, list[Vote]]:
    by_id: dict[str, Vote] = {}
    grouped: dict[RelationId, list[Vote]] = {}
    for vote in votes:
        existing = by_id.get(vote.vote_id)
        if existing is not None:
            if existing != vote:
                raise ValueError(f"vote {vote.vote_id} occurs twice with differing payloads")
            continue
        by_id[vote.vote_id] = vote
        grouped.setdefault(vote.relation_id, []).append(vote)
    return grouped


def _card_votes(
    record: CorpusRecord,
    votes: Sequence[Vote],
) -> tuple[WireVote, ...]:
    for vote in votes:
        if vote.card_hash != record.card_hash:
            raise ValueError(
                f"vote {vote.vote_id} on {record.relation_id} was cast on card "
                f"{vote.card_hash}, not the corpus card {record.card_hash}"
            )
    wire_votes = [_wire_vote(vote) for vote in votes]
    if record.is_shot_excluded and wire_votes:
        raise ValueError(
            f"shot-excluded card {record.relation_id} carries {len(wire_votes)} votes"
        )
    if not record.is_shot_excluded and all(vote.verdict == "abstain" for vote in wire_votes):
        raise ValueError(f"card {record.relation_id} carries no non-abstain vote")
    return tuple(sorted(wire_votes, key=canonical_json_bytes))


def _checked_card(
    record: CorpusRecord,
    *,
    deck_card: EvaluationCard,
    resolved: ResolvedCardContent,
    family: FamilyAssignmentRow,
    votes: Sequence[Vote],
) -> AnnotationCard:
    for name, card_hash in (
        ("corpus record", record.card_hash),
        ("re-rendered content", resolved.rendered_card_hash),
        ("family closure row", family.card_hash),
    ):
        if card_hash != deck_card.card_hash:
            raise ValueError(
                f"{record.relation_id}: {name} card hash {card_hash} differs from "
                f"the verified deck card {deck_card.card_hash}"
            )
    content = _wire_content(resolved)
    for text in _content_strings(content):
        lint_card_text(text)
    return AnnotationCard(
        identity=resolved.identity,
        source=resolved.source,
        content=content,
        axes=WireAxes(
            family=family.family_id,
            inverse_of=resolved.inverse_of,
            base_url=resolved.base_url,
            publisher=resolved.publisher,
        ),
        flags=WireFlags(
            shot_excluded=record.is_shot_excluded,
            holdout=record.holdout_verdict,
            prescreen_stratum=record.prescreen_stratum,
        ),
        votes=_card_votes(record, votes),
    )


def build_annotation_corpus_document(
    *,
    corpus: Sequence[CorpusRecord],
    deck_cards: Mapping[RelationId, EvaluationCard],
    resolved_contents: Mapping[RelationId, ResolvedCardContent],
    families: Mapping[RelationId, FamilyAssignmentRow],
    votes: Sequence[Vote],
    sources: Mapping[str, Sha256Hex],
) -> AnnotationCorpusDocument:
    """Assemble and validate the complete wire document.

    Every input population must cover exactly the corpus records; every
    card hash must agree across the corpus record, the verified deck, the
    re-rendered content, and the family closure row; every vote must bind
    to its card's exact hash. Cards order strictly ascending by byte-wise
    (UTF-8) lexicographic comparison of ``identity``; votes order by their
    canonical serialization bytes.

    Raises:
        ValueError: Any population, hash, identity, lint, or vote-coverage
            contract is violated.

    """
    corpus_ids = {record.relation_id for record in corpus}
    if len(corpus_ids) != len(corpus):
        raise ValueError("corpus records must not repeat a relation")
    for name, population in (
        ("verified deck", set(deck_cards)),
        ("resolved content", set(resolved_contents)),
        ("family closure", set(families)),
    ):
        if population != corpus_ids:
            missing = sorted(corpus_ids - population)[:3]
            extra = sorted(population - corpus_ids)[:3]
            raise ValueError(
                f"{name} does not cover exactly the corpus: missing {missing}, extra {extra}"
            )

    grouped_votes = _deduplicated(votes)
    unknown_votes = sorted(set(grouped_votes) - corpus_ids)
    if unknown_votes:
        raise ValueError(f"votes reference relations outside the corpus: {unknown_votes[:3]}")

    cards = [
        _checked_card(
            record,
            deck_card=deck_cards[record.relation_id],
            resolved=resolved_contents[record.relation_id],
            family=families[record.relation_id],
            votes=grouped_votes.get(record.relation_id, ()),
        )
        for record in corpus
    ]
    cards.sort(key=lambda card: card.identity.encode("utf-8"))
    identities = Counter(card.identity for card in cards)
    duplicates = sorted(identity for identity, count in identities.items() if count > 1)
    if duplicates:
        raise ValueError(f"card identities must be unique: {duplicates[:3]}")

    return AnnotationCorpusDocument(cards=tuple(cards), sources=dict(sources))


__all__ = [
    "ANNOTATION_CORPUS_FILENAME",
    "ANNOTATION_CORPUS_SCHEMA",
    "AnnotationCard",
    "AnnotationCorpusDocument",
    "CardSource",
    "ResolvedCardContent",
    "WireAxes",
    "WireConstraints",
    "WireContent",
    "WireEndpointConstraint",
    "WireExample",
    "WireFlags",
    "WirePhrase",
    "WireVerdict",
    "WireVote",
    "build_annotation_corpus_document",
]
