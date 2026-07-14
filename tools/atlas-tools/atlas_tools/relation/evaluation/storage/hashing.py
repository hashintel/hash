"""Hash canonical artifacts without retaining their serialized rows.

JSONL identity is the SHA-256 of each canonical model object followed by one
newline. The incremental form accepts one-shot iterables and uses constant
additional memory, which keeps finalization independent of journal size.
"""

import hashlib
from collections.abc import Iterable
from pathlib import Path

import trio
from pydantic import BaseModel

from atlas_tools.common import Sha256Hex, canonical_json_bytes, sha256_file


def jsonl_hash(rows: Iterable[BaseModel]) -> Sha256Hex:
    """Hash canonical JSONL rows in one pass and constant additional memory."""
    digest = hashlib.sha256()

    for row in rows:
        digest.update(canonical_json_bytes(row))
        digest.update(b"\n")

    return digest.hexdigest()


async def file_hash(path: Path) -> Sha256Hex:
    """Hash a file without blocking Trio's event loop."""
    return await trio.to_thread.run_sync(sha256_file, path, abandon_on_cancel=False)
