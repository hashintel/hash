"""Hash and recheck verified sources around long-running application work."""

from collections.abc import Mapping
from pathlib import Path

import trio

from atlas_tools.relation.evaluation.application.preparation import PreparedEvaluation
from atlas_tools.relation.evaluation.domain.api import Sha256Hex
from atlas_tools.relation.evaluation.storage.api import file_hash


async def hash_paths(paths: Mapping[str, Path]) -> dict[str, Sha256Hex]:
    """Hash independent files concurrently and preserve their logical names."""
    hashes: dict[str, Sha256Hex] = {}

    async def hash_one(name: str, path: Path) -> None:
        hashes[name] = await file_hash(path)

    async with trio.open_nursery() as nursery:
        for name, path in paths.items():
            nursery.start_soon(hash_one, name, path)
    if set(hashes) != set(paths):
        raise AssertionError("parallel artifact hashing did not cover every path")
    return hashes


async def verify_deck_sources(prepared: PreparedEvaluation) -> None:
    """Reject a deck changed after its initial verification pass."""
    observed = await hash_paths(
        {
            "cards.jsonl": prepared.deck.cards_path,
            "cards.manifest.json": prepared.deck.manifest_path,
        }
    )
    if observed != dict(prepared.deck.source_hashes):
        changed = tuple(
            name for name in sorted(observed) if observed[name] != prepared.deck.source_hashes[name]
        )
        raise ValueError(f"verified card sources changed during execution: {changed}")
