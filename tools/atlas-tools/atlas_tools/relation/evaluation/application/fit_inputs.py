"""Export verified relation cards and embeddings for the Rust SALT fitter."""

from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from pydantic import HttpUrl, TypeAdapter

from atlas_tools.common import Sha256Hex, canonical_json_bytes, sha256_bytes
from atlas_tools.relation.concat.api import ConcatCardRow
from atlas_tools.relation.evaluation.analysis.api import EmbeddingRow
from atlas_tools.relation.evaluation.application._analysis_codec import atomic_replace
from atlas_tools.relation.evaluation.application._atlas_classifier_codec import (
    load_atlas_classifier,
)
from atlas_tools.relation.evaluation.application.analysis_codec import load_embeddings
from atlas_tools.relation.evaluation.storage.api import load_deck
from atlas_tools.relation_cards.hash.adapter import versioned_url_base_url

_CANONICAL_DIMENSIONS = 3_072
_URL_ADAPTER = TypeAdapter(HttpUrl)


@dataclass(frozen=True, slots=True, kw_only=True)
class FitInputsArtifact:
    """Describe one content-addressable SALT relation-policy input document."""

    path: Path
    content_hash: Sha256Hex
    relation_count: int
    classifier_hash: Sha256Hex


def _versioned_url(card: ConcatCardRow) -> str | None:
    payload = card.model_dump(mode="json")
    candidate = payload.get("versioned_url")
    if candidate is None:
        return None
    if not isinstance(candidate, str):
        raise TypeError(f"relation {card.relation_id} has a non-string versioned_url")
    url = str(_URL_ADAPTER.validate_python(candidate, strict=True))
    versioned_url_base_url(url)
    return url


def _raw_cards(cards_path: Path) -> tuple[ConcatCardRow, ...]:
    rows: list[ConcatCardRow] = []
    with cards_path.open("rb") as source:
        for line_number, line in enumerate(source, start=1):
            if not line.strip():
                continue
            try:
                rows.append(ConcatCardRow.model_validate_json(line, strict=True))
            except ValueError as error:
                raise ValueError(
                    f"invalid fit-input card at cards.jsonl line {line_number}: {error}"
                ) from error
    return tuple(rows)


def _policy_relations(
    cards: Sequence[ConcatCardRow],
    embeddings: Sequence[EmbeddingRow],
) -> dict[str, object]:
    card_by_relation = {card.relation_id: card for card in cards}
    relations: dict[str, object] = {}
    for embedding in embeddings:
        try:
            card = card_by_relation[embedding.relation_id]
        except KeyError as error:
            raise ValueError(
                f"embedding refers to absent relation card {embedding.relation_id}"
            ) from error
        if embedding.card_hash != card.card_hash:
            raise ValueError(f"embedding card hash differs for relation {embedding.relation_id}")
        url = _versioned_url(card)
        if url is None:
            continue
        if url in relations:
            raise ValueError(f"fit-input cards repeat versioned URL {url}")
        if embedding.dimension != _CANONICAL_DIMENSIONS:
            raise ValueError(
                f"relation {card.relation_id} embedding has {embedding.dimension} components, "
                f"expected {_CANONICAL_DIMENSIONS}"
            )
        vector = np.frombuffer(embedding.vector_f32_le, dtype="<f4", count=embedding.dimension)
        if vector.size != _CANONICAL_DIMENSIONS or not np.isfinite(vector).all():
            raise ValueError(f"relation {card.relation_id} embedding is incomplete or non-finite")
        relations[url] = {
            "embedding": vector.tolist(),
            "strength": 1.0,
            "humanOverride": None,
            "humanReviewed": None,
            "synthetic": None,
        }
    return relations


def export_fit_inputs(
    *,
    classifier_path: Path,
    cards_directory: Path,
    embeddings_path: Path,
    output_path: Path,
) -> FitInputsArtifact:
    """Verify deployment inputs and emit a stable relation-policy superset.

    Cards without a real ``versioned_url`` are excluded because PostgreSQL
    extraction keys relation types by exact SemType URL. Every included card
    retains its real 3,072-component embedding. The classifier remains
    authoritative: no synthetic or unverified policy labels are emitted.

    Raises:
        ValueError: A classifier, card, embedding, URL, or cross-artifact
            identity violates the deployment contract.
        OSError: An input or output artifact cannot be read or published.

    """
    classifier = load_atlas_classifier(classifier_path)
    deck = load_deck(cards_directory)
    embeddings = load_embeddings(embeddings_path)
    expected_cards_hash = deck.source_hashes["cards.jsonl"]
    if embeddings.metadata.source_hashes.get("cards.jsonl") != expected_cards_hash:
        raise ValueError("embeddings do not bind the verified cards.jsonl content")

    raw_cards = _raw_cards(deck.cards_path)
    projected = tuple((card.relation_id, card.card_hash) for card in deck.cards)
    raw = tuple((card.relation_id, card.card_hash) for card in raw_cards)
    if raw != projected:
        raise ValueError("raw cards and the verified evaluation deck do not share one exact domain")
    relations = _policy_relations(raw_cards, embeddings.rows)
    if not relations:
        raise ValueError("verified cards contain no real versioned_url values")

    payload = canonical_json_bytes({"schemaVersion": 1, "relations": relations}) + b"\n"
    atomic_replace(output_path, payload)
    return FitInputsArtifact(
        path=output_path,
        content_hash=sha256_bytes(payload),
        relation_count=len(relations),
        classifier_hash=classifier.content_hash,
    )


__all__ = ["FitInputsArtifact", "export_fit_inputs"]
