"""Concatenate relation-card sets from multiple producers into one combined set.

Each input directory must contain a ``cards.jsonl`` and its ``cards.manifest.json``
provenance sidecar. Inputs are verified against their recorded content hashes before
concatenation, and each row in the combined set is tagged with the producer it came from.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from os import PathLike
from pathlib import Path

from pydantic import BaseModel, JsonValue

from atlas_tools.common import Provenance, Sha256Hex, canonical_json_bytes, sha256_file
from atlas_tools.relation_cards.common.cards import CardRow


class ConcatCardRow(CardRow):
    producer: str


class ConcatDetails(BaseModel):
    input_paths: list[Path]

    producers: dict[str, JsonValue]


class ConcatConfig(BaseModel):
    producers: dict[str, JsonValue]


ConcatProvenance = Provenance[ConcatDetails, ConcatConfig]


@dataclass(frozen=True)
class ConcatPaths:
    """Locations of the files written by :func:`concat_relations`."""

    cards_jsonl: Path
    manifest: Path


def concat_relations(paths: Iterable[PathLike], *, out: PathLike) -> ConcatPaths:
    """Verify and concatenate card sets from ``paths``, writing the result to ``out``."""
    cards: list[ConcatCardRow] = []

    configs: dict[str, JsonValue] = {}
    details: dict[str, JsonValue] = {}
    inputs: list[Path] = []
    input_hashes: dict[str, Sha256Hex] = {}

    for index, card_dir in enumerate(paths):
        inputs.append(Path(card_dir))
        cards_path = Path(card_dir) / "cards.jsonl"
        cards_manifest = Path(card_dir) / "cards.manifest.json"

        provenance = Provenance[JsonValue, JsonValue].load(cards_manifest)
        input_hash = (provenance.content_hashes or {}).get("cards.jsonl")
        if input_hash is None:
            raise ValueError(f"{cards_manifest} does not record a content hash for cards.jsonl")
        if sha256_file(cards_path) != input_hash:
            raise ValueError(
                f"{cards_path} does not match the content hash recorded in its manifest"
            )

        producer_id = f"{provenance.producer}_{index}"
        input_hashes[f"{producer_id}/cards.jsonl"] = input_hash

        cards += [
            ConcatCardRow(producer=producer_id, **row.model_dump())
            for line in cards_path.read_text("utf-8").splitlines()
            if line and (row := CardRow.model_validate_json(line))
        ]

        configs[producer_id] = provenance.config
        details[producer_id] = provenance.details

    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)

    cards_path = out / "cards.jsonl"
    with cards_path.open("w", encoding="utf-8") as output:
        for card in cards:
            output.write(canonical_json_bytes(card).decode("utf-8") + "\n")

    content_hashes = {
        "cards.jsonl": sha256_file(cards_path),
    }
    provenance = ConcatProvenance.make(
        producer="relation.concat",
        input_hashes=input_hashes,
        content_hashes=content_hashes,
        config=ConcatConfig(producers=configs),
        details=ConcatDetails(producers=details, input_paths=inputs),
    )
    manifest_path = provenance.write(out / "cards.manifest.json")

    return ConcatPaths(cards_jsonl=cards_path, manifest=manifest_path)
