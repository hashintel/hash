"""Pluggable token counting for relation-card budgets."""

import math
from typing import Protocol

from atlas_tools.relation_cards.common.config import TokenizerName


class TokenCounter(Protocol):
    name: TokenizerName

    def count(self, text: str) -> int: ...


class HeuristicTokenCounter:
    """ceil(len(utf8_bytes) / 4): deterministic, offline test counter."""

    name: TokenizerName = "heuristic"

    def count(self, text: str) -> int:
        return math.ceil(len(text.encode("utf-8")) / 4)


class Cl100kTokenCounter:
    """tiktoken cl100k_base (downloads its BPE file on first use)."""

    name: TokenizerName = "cl100k"

    def __init__(self) -> None:
        # Imported lazily because tiktoken may download its BPE file.
        import tiktoken  # noqa: PLC0415

        self._encoding = tiktoken.get_encoding("cl100k_base")

    def count(self, text: str) -> int:
        return len(self._encoding.encode(text))


def make_token_counter(name: TokenizerName) -> TokenCounter:
    match name:
        case "heuristic":
            return HeuristicTokenCounter()
        case "cl100k":
            return Cl100kTokenCounter()
