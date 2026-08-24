"""Pluggable sentence splitting for structural card truncation.

- ``punkt`` (production default): nltk's linguistically aware splitter.
- ``naive`` (tests/offline): deterministic regex splitting after terminal
  punctuation plus whitespace.
"""

import re
from typing import Protocol

from pydantic_extra_types.language_code import LanguageAlpha2

from atlas_tools.relation_cards.common.config import SentenceSplitterName


class SentenceSplitter(Protocol):
    name: SentenceSplitterName

    def split(self, text: str, *, language: LanguageAlpha2) -> list[str]: ...


class PunktSentenceSplitter:
    """nltk punkt: linguistically aware (abbreviations, ordinals, ...)."""

    name: SentenceSplitterName = "punkt"

    def __init__(self) -> None:
        # Imported lazily: naive runs must not pay nltk's import cost.
        from nltk.tokenize import sent_tokenize  # noqa: PLC0415

        self._tokenize = sent_tokenize
        self._probe()

    def _probe(self) -> None:
        try:
            self._tokenize("probe.", language="english")
        except LookupError as error:
            raise RuntimeError(
                "the punkt sentence splitter needs its tokenizer data;"
                " run `uv run python -m nltk.downloader punkt_tab`"
                " (or configure cards.sentence_splitter: naive)"
            ) from error

    def split(self, text: str, *, language: LanguageAlpha2) -> list[str]:
        return self._tokenize(text, language=language.name.lower())


class NaiveSentenceSplitter:
    """Deterministic regex split after ``.``/``!``/``?`` plus whitespace."""

    name: SentenceSplitterName = "naive"

    def split(self, text: str, *, language: LanguageAlpha2) -> list[str]:  # noqa: ARG002
        return [part for part in re.split(r"(?<=[.!?])\s+", text) if part]


def make_sentence_splitter(name: SentenceSplitterName) -> SentenceSplitter:
    match name:
        case "punkt":
            return PunktSentenceSplitter()
        case "naive":
            return NaiveSentenceSplitter()
