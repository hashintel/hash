"""Verify concatenated relation cards and build one immutable in-memory index.

The concat manifest binds the exact card bytes and declared source namespaces.
Loading streams the file once, validates every producer row, and recomputes the
digest during that same pass. Downstream code receives only the evaluation
projection and an immutable relation-ID index.
"""

import hashlib
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType

import trio
from pydantic import JsonValue, TypeAdapter, ValidationError

from atlas_tools.common import Sha256Hex, sha256_bytes
from atlas_tools.relation.concat import CONCAT_SCHEMA_VERSION, ConcatCardRow, ConcatProvenance
from atlas_tools.relation.evaluation.domain.api import (
    EvaluationCard,
    RelationFamilyId,
    RelationId,
    RelationNamespace,
)

_JSON_OBJECT_ADAPTER = TypeAdapter(dict[str, JsonValue])
_FAMILY_ADAPTER = TypeAdapter(RelationFamilyId | None)


@dataclass(frozen=True, slots=True, kw_only=True)
class VerifiedDeck:
    """Bind exact source hashes to ordered cards and a prebuilt immutable index."""

    directory: Path
    cards_path: Path
    manifest_path: Path
    source_hashes: Mapping[str, Sha256Hex]
    source_namespaces: frozenset[RelationNamespace]
    cards: tuple[EvaluationCard, ...]
    by_relation_id: Mapping[RelationId, EvaluationCard]


def _project_card(card: ConcatCardRow) -> EvaluationCard:
    payload = _JSON_OBJECT_ADAPTER.validate_python(card.model_dump(mode="json"), strict=True)
    raw_strata = payload.get("pilot_strata", [])
    if not isinstance(raw_strata, list) or any(not isinstance(item, str) for item in raw_strata):
        raise ValueError("pilot_strata must be an array of strings")

    prescreen = payload.get("prescreen_stratum", "unstratified")
    if not isinstance(prescreen, str) or not prescreen:
        raise ValueError("prescreen_stratum must be a non-empty string")

    family = _FAMILY_ADAPTER.validate_python(payload.get("family_id"), strict=True)

    return EvaluationCard(
        relation_id=card.relation_id,
        producer=card.producer,
        card_text=card.card_text,
        card_hash=card.card_hash,
        token_count=card.token_count,
        prescreen_stratum=prescreen,
        pilot_strata=tuple(sorted(set(raw_strata))),
        family_id=family,
    )


def _load_manifest(path: Path) -> tuple[bytes, ConcatProvenance]:
    try:
        manifest_bytes = path.read_bytes()
        provenance = ConcatProvenance.model_validate_json(manifest_bytes, strict=True)
    except (OSError, ValidationError) as error:
        raise ValueError(f"invalid concat manifest {path}: {error}") from error

    if provenance.producer != "relation.concat":
        raise ValueError("evaluation accepts only relation.concat card artifacts")

    if provenance.details.schema_version != CONCAT_SCHEMA_VERSION:
        raise ValueError(f"unsupported concat schema {provenance.details.schema_version}")

    return manifest_bytes, provenance


def _read_cards(
    path: Path,
    *,
    namespaces: frozenset[RelationNamespace],
) -> tuple[tuple[EvaluationCard, ...], dict[RelationId, EvaluationCard], str]:
    digest = hashlib.sha256()
    cards: list[EvaluationCard] = []
    by_id: dict[RelationId, EvaluationCard] = {}
    try:
        input_file = path.open("rb")
    except OSError as error:
        raise ValueError(f"cannot read concat cards {path}: {error}") from error

    with input_file:
        for line_number, line in enumerate(input_file, start=1):
            digest.update(line)
            if not line.strip():
                continue

            try:
                card = _project_card(ConcatCardRow.model_validate_json(line))
            except (TypeError, ValueError, ValidationError) as error:
                raise ValueError(f"invalid cards.jsonl line {line_number}: {error}") from error

            if card.producer not in namespaces:
                raise ValueError(
                    f"relation {card.relation_id} uses undeclared source {card.producer}"
                )

            if card.relation_id in by_id:
                raise ValueError(f"cards.jsonl contains duplicate relation_id {card.relation_id}")

            cards.append(card)
            by_id[card.relation_id] = card

    return tuple(cards), by_id, digest.hexdigest()


def load_deck(directory: Path) -> VerifiedDeck:
    """Load a verified concat artifact or fail before any provider work starts."""
    cards_path = directory / "cards.jsonl"
    manifest_path = directory / "cards.manifest.json"
    manifest_bytes, provenance = _load_manifest(manifest_path)
    expected_hash = (provenance.content_hashes or {}).get("cards.jsonl")
    if expected_hash is None:
        raise ValueError("concat manifest does not bind cards.jsonl")

    namespaces = frozenset(provenance.details.sources)
    cards, by_id, observed_hash = _read_cards(cards_path, namespaces=namespaces)
    if observed_hash != expected_hash:
        raise ValueError("cards.jsonl does not match its concat manifest")

    if len(cards) != provenance.details.row_count:
        raise ValueError(
            f"concat manifest records {provenance.details.row_count} rows, found {len(cards)}"
        )

    return VerifiedDeck(
        directory=directory,
        cards_path=cards_path,
        manifest_path=manifest_path,
        source_hashes=MappingProxyType(
            {
                "cards.jsonl": expected_hash,
                "cards.manifest.json": sha256_bytes(manifest_bytes),
            }
        ),
        source_namespaces=namespaces,
        cards=cards,
        by_relation_id=MappingProxyType(by_id),
    )


async def load_deck_async(directory: Path) -> VerifiedDeck:
    """Validate a deck without blocking Trio's event loop."""
    return await trio.to_thread.run_sync(load_deck, directory, abandon_on_cancel=False)
