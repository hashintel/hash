"""Pluggable token counting (budget proxy for the embedding model).

The manifest records which counter was used.

- ``cl100k`` (production default): tiktoken cl100k_base as a budget proxy.
  It downloads its BPE file on first use, so tests never select it.
- ``heuristic`` (tests/offline): ``tokens = ceil(len(utf8_bytes) / 4)`` — the
  standard "~4 bytes per token" approximation. Deterministic and documented.
"""

from __future__ import annotations

import math
from typing import Protocol

from atlas_tools.wikidata.config import TokenizerName


class TokenCounter(Protocol):
    name: TokenizerName

    def count(self, text: str) -> int: ...


class HeuristicTokenCounter:
    """ceil(len(utf8_bytes) / 4): deterministic, offline, documented above."""

    name: TokenizerName = "heuristic"

    def count(self, text: str) -> int:
        return math.ceil(len(text.encode("utf-8")) / 4)


class Cl100kTokenCounter:
    """tiktoken cl100k_base (downloads its BPE file on first use)."""

    name: TokenizerName = "cl100k"

    def __init__(self) -> None:
        import tiktoken

        self._encoding = tiktoken.get_encoding("cl100k_base")

    def count(self, text: str) -> int:
        return len(self._encoding.encode(text))


def make_token_counter(name: TokenizerName) -> TokenCounter:
    match name:
        case "heuristic":
            return HeuristicTokenCounter()
        case "cl100k":
            return Cl100kTokenCounter()
