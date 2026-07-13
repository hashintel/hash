"""Canonical relation-card construction, rendering, and truncation.

Card format v5 is deterministic labeled text, never JSON. Datasource
adapters resolve their identifiers into :class:`RelationCardInput` before
calling this module and supply the identifiers they resolved to the final
text linter.

Truncation is structural. Referenced descriptions are split into a lead
sentence and removable detail, then passes run in this fixed order:

1. drop example slots round-robin from the largest strata;
2. remove ancestor, source-type, and target-type description detail;
3. drop whole single-example strata while preserving one example;
4. above the hard budget only, drop examples and then ancestors.

Title, description, inverse, and endpoint-type summaries are never dropped.
"""

import re
from collections.abc import Callable, Generator, Iterable
from typing import Self

from pydantic import BaseModel, ConfigDict, Field
from pydantic_extra_types.language_code import LanguageAlpha2

from atlas_tools.common import Sha256Hex, sha256_bytes
from atlas_tools.relation_cards.common.config import CardsConfig
from atlas_tools.relation_cards.common.model import (
    PhraseInput,
    RelationCardInput,
    RelationConstraints,
)
from atlas_tools.relation_cards.common.sentence import SentenceSplitter
from atlas_tools.relation_cards.common.tokens import TokenCounter

_FORBIDDEN_TEXT_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "URL",
        re.compile(r"(?i)(?<![A-Za-z0-9])(?:[a-z][a-z0-9+.-]*):/{2}"),
    ),
    (
        "UUID",
        re.compile(
            r"(?i)(?<![0-9a-f])"
            r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
            r"(?![0-9a-f])"
        ),
    ),
)


class IdentifierLeakError(ValueError):
    """Card text contains a datasource identifier or database key."""


def lint_card_text(
    card_text: str,
    *,
    forbidden_identifiers: Iterable[str] = (),
) -> None:
    """Reject universal keys and the adapter's known source identifiers."""
    for label, pattern in _FORBIDDEN_TEXT_PATTERNS:
        if pattern.search(card_text):
            raise IdentifierLeakError(f"relation card contains a forbidden {label}")

    for identifier in set(forbidden_identifiers):
        if not identifier:
            continue

        pattern = re.compile(rf"(?<![A-Za-z0-9]){re.escape(identifier)}(?![A-Za-z0-9])")
        if pattern.search(card_text):
            raise IdentifierLeakError(
                f"relation card contains the forbidden source identifier {identifier}"
            )


def slugify(label: str) -> str:
    """Normalize a label into a URL slug."""
    return re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")


def _collapse_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip())


def _flag_value(*, flag: bool | None) -> str:
    if flag is None:
        return "not recorded"

    return "yes" if flag else "no"


def _render_constraints(constraints: RelationConstraints) -> Generator[str]:
    yield f"symmetric? {_flag_value(flag=constraints.symmetric)}"
    yield f"transitive? {_flag_value(flag=constraints.transitive)}"
    yield f"single value? {_flag_value(flag=constraints.single_value)}"
    yield f"distinct values? {_flag_value(flag=constraints.distinct_values)}"
    yield f"direction: {constraints.direction}"


class Phrase(BaseModel):
    """A referenced label plus structurally truncatable description."""

    label: str
    lead: str | None = None
    detail: str | None = None

    def render(self) -> str:
        description = " ".join(part for part in (self.lead, self.detail) if part)
        return f"{self.label} ({description})" if description else self.label

    @classmethod
    def make(
        cls,
        phrase: PhraseInput,
        *,
        language: LanguageAlpha2,
        splitter: SentenceSplitter,
    ) -> Self | None:
        """Normalize and split a canonical phrase for rendering."""
        label = _collapse_whitespace(phrase.label)
        if not label:
            return None

        description = _collapse_whitespace(phrase.description or "")
        if not description:
            return cls(label=label)

        [lead, *detail] = splitter.split(description, language=language)
        return cls(label=label, lead=lead, detail=" ".join(detail) or None)


class ExampleLine(BaseModel):
    """One rendered Examples bullet."""

    text: str
    stratum_label: str | None = None

    def render(self) -> str:
        if self.stratum_label is None:
            return self.text
        return f"{self.stratum_label}: {self.text}"


class CardContents(BaseModel):
    """Structured card body; :meth:`render` is its only text projection."""

    prelude: list[str] = Field(default_factory=list)
    ancestors: list[Phrase] = Field(default_factory=list)
    source_types: list[Phrase] = Field(default_factory=list)
    target_types: list[Phrase] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    examples: list[ExampleLine] = Field(default_factory=list)
    epilogue: list[str] = Field(default_factory=list)

    def _blocks(self) -> Generator[list[str]]:
        if self.prelude:
            yield self.prelude

        for header, phrases in (
            ("Ancestors:", self.ancestors),
            ("Source types:", self.source_types),
            ("Target types:", self.target_types),
        ):
            if phrases:
                yield [header, *(f"  - {phrase.render()}" for phrase in phrases)]

        if self.constraints:
            yield ["Constraints:", *(f"  - {line}" for line in self.constraints)]

        if self.examples:
            yield [
                "Examples:",
                *(f"  - {example.render()}" for example in self.examples),
            ]

        if self.epilogue:
            yield self.epilogue

    def render(self) -> str:
        """Render blank-line-separated blocks with one trailing newline."""
        return "\n\n".join("\n".join(block) for block in self._blocks()) + "\n"

    def tokens(self, *, counter: TokenCounter) -> int:
        return counter.count(self.render())

    @classmethod
    def make(
        cls,
        card_input: RelationCardInput,
        *,
        splitter: SentenceSplitter,
    ) -> Self:
        """Project a canonical input into structurally truncatable contents."""

        def phrase(entry: PhraseInput) -> Phrase | None:
            return Phrase.make(entry, language=card_input.language, splitter=splitter)

        this = cls()
        this.prelude.append(f"Relation: {card_input.title}")
        if card_input.description:
            this.prelude.append(f"Description: {card_input.description}")

        if card_input.aliases:
            this.prelude.append("Aliases:")
            this.prelude.extend(f"  - {alias}" for alias in card_input.aliases)

        if card_input.inverse and (inverse := phrase(card_input.inverse)):
            this.prelude.append(f"Inverse Name: {inverse.render()}")
        else:
            this.prelude.append("Inverse Name: none recorded")

        this.ancestors = [rendered for entry in card_input.ancestors if (rendered := phrase(entry))]
        this.source_types = [
            rendered for entry in card_input.source_types if (rendered := phrase(entry))
        ]
        this.target_types = [
            rendered for entry in card_input.target_types if (rendered := phrase(entry))
        ]
        this.constraints = list(_render_constraints(card_input.constraints))
        this.examples = [
            ExampleLine(
                text=f"{example.subject_label} -> {example.object_label}",
                stratum_label=example.stratum_label,
            )
            for example in card_input.examples
        ]

        slug = card_input.slug if card_input.slug is not None else slugify(card_input.title)
        this.epilogue.append(f"Slug: {slug}")
        return this


class Card(BaseModel):
    """A finished source-neutral card and its budget diagnostics."""

    model_config = ConfigDict(frozen=True)

    contents: CardContents
    card_text: str
    card_hash: Sha256Hex
    token_count: int
    truncations: list[str]
    severely_truncated: bool


type TruncationPass = Callable[[CardContents], str | None]


def _example_groups(examples: list[ExampleLine]) -> list[tuple[str | None, list[int]]]:
    """Group example indices by stratum label in first-seen order."""
    order: list[str | None] = []
    groups: dict[str | None, list[int]] = {}

    for index, line in enumerate(examples):
        if line.stratum_label not in groups:
            groups[line.stratum_label] = []
            order.append(line.stratum_label)
        groups[line.stratum_label].append(index)

    return [(label, groups[label]) for label in order]


def _drop_example_slot(contents: CardContents) -> str | None:
    eligible = [
        (label, indices)
        for label, indices in _example_groups(contents.examples)
        if len(indices) > 1
    ]
    if not eligible:
        return None

    max_size = max(len(indices) for _, indices in eligible)
    _, indices = [entry for entry in eligible if len(entry[1]) == max_size][-1]
    index = indices[-1]
    contents.examples.pop(index)
    return f"example[{index}]"


def _drop_example_stratum(contents: CardContents) -> str | None:
    if len(contents.examples) <= 1:
        return None

    groups = _example_groups(contents.examples)
    label, indices = groups[-1]
    if len(groups) == 1:
        index = indices[-1]
        contents.examples.pop(index)
        return f"example[{index}]"

    for index in reversed(indices):
        contents.examples.pop(index)
    return f"example_stratum[{label}]"


def _strip_details(phrases: list[Phrase], label: str) -> str | None:
    if not any(phrase.detail for phrase in phrases):
        return None
    for phrase in phrases:
        phrase.detail = None
    return label


def _strip_ancestor_details(contents: CardContents) -> str | None:
    return _strip_details(contents.ancestors, "ancestor_details")


def _strip_source_type_details(contents: CardContents) -> str | None:
    return _strip_details(contents.source_types, "source_type_details")


def _strip_target_type_details(contents: CardContents) -> str | None:
    return _strip_details(contents.target_types, "target_type_details")


def _drop_ancestors_section(contents: CardContents) -> str | None:
    if not contents.ancestors:
        return None
    contents.ancestors.clear()
    return "ancestors_section"


def _drop_examples_section(contents: CardContents) -> str | None:
    if not contents.examples:
        return None
    contents.examples.clear()
    return "example_section"


_BUDGET_PASSES: tuple[TruncationPass, ...] = (
    _drop_example_slot,
    _strip_ancestor_details,
    _strip_source_type_details,
    _strip_target_type_details,
    _drop_example_stratum,
)

_HARD_BUDGET_PASSES: tuple[TruncationPass, ...] = (
    _drop_examples_section,
    _drop_ancestors_section,
)


def _run_passes(
    contents: CardContents,
    passes: tuple[TruncationPass, ...],
    *,
    budget: int,
    counter: TokenCounter,
    truncations: list[str],
) -> None:
    for step in passes:
        while contents.tokens(counter=counter) > budget:
            label = step(contents)
            if label is None:
                break
            truncations.append(label)


def build_card(
    card_input: RelationCardInput,
    *,
    config: CardsConfig,
    counter: TokenCounter,
    splitter: SentenceSplitter,
    forbidden_identifiers: Iterable[str] = (),
) -> Card:
    """Construct, budget, render, and hash one canonical relation card."""
    contents = CardContents.make(card_input, splitter=splitter)
    total_examples = len(contents.examples)
    truncations: list[str] = []

    _run_passes(
        contents,
        _BUDGET_PASSES,
        budget=config.token_budget,
        counter=counter,
        truncations=truncations,
    )

    if contents.tokens(counter=counter) > config.hard_token_budget:
        _run_passes(
            contents,
            _HARD_BUDGET_PASSES,
            budget=config.hard_token_budget,
            counter=counter,
            truncations=truncations,
        )

    dropped_examples = total_examples - len(contents.examples)
    severely_truncated = (
        contents.tokens(counter=counter) > config.hard_token_budget
        or dropped_examples * 2 > total_examples
    )

    card_text = contents.render()
    lint_card_text(card_text, forbidden_identifiers=forbidden_identifiers)

    return Card(
        contents=contents,
        card_text=card_text,
        card_hash=sha256_bytes(card_text.encode("utf-8")),
        token_count=contents.tokens(counter=counter),
        truncations=truncations,
        severely_truncated=severely_truncated,
    )
