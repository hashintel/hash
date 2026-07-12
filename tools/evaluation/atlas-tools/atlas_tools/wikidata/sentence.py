"""Pluggable sentence splitting (mirrors ``tokens.TokenCounter``).

Card truncation reduces descriptions to their lead sentence, so the split
point matters. The manifest records which splitter was used.

- ``punkt`` (production default): nltk's punkt — linguistically aware
  (abbreviations, ordinals, "5 p.m."). Requires the ``punkt_tab`` tokenizer
  data: ``uv run python -m nltk.downloader punkt_tab`` (see README).
- ``naive`` (tests/offline): deterministic regex split after ``.``/``!``/``?``
  + whitespace. Dependency-free but blind to abbreviations.
"""

import re
from typing import Protocol

from pydantic_extra_types.language_code import LanguageAlpha2

from atlas_tools.wikidata.config import SentenceSplitterName


class SentenceSplitter(Protocol):
    name: SentenceSplitterName

    def split(self, text: str, *, language: LanguageAlpha2) -> list[str]: ...


class PunktSentenceSplitter:
    """nltk punkt: linguistically aware (abbreviations, ordinals, ...)."""

    name: SentenceSplitterName = "punkt"

    def __init__(self) -> None:
        from nltk.tokenize import sent_tokenize

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
    """Deterministic regex split after ``.``/``!``/``?`` + whitespace."""

    name: SentenceSplitterName = "naive"

    def split(self, text: str, *, language: LanguageAlpha2) -> list[str]:
        return [part for part in re.split(r"(?<=[.!?])\s+", text) if part]


def make_sentence_splitter(name: SentenceSplitterName) -> SentenceSplitter:
    match name:
        case "punkt":
            return PunktSentenceSplitter()
        case "naive":
            return NaiveSentenceSplitter()
