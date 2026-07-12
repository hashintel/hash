"""Single-card construction: structured contents, rendering, truncation.

Card format v3
--------------
A card is deterministic labeled TEXT (never JSON), one section per block,
blank-line separated, in the atlas-spec priority order. All Wikidata
identifiers stay OUT of the text (train/inference distribution match: the
classifier later scores cards built from ontologies that have no PIDs/QIDs).

    Relation: <title>
    Description: <description>
    Aliases:
      - <alias>
    Inverse: <label> (<description>)

    Ancestors:
      - <label> (<description>)

    Source types:
      - <label> (<description>)

    Target types:
      - <label> (<description>)

    Constraints:
      - symmetric? yes|no
      ...

    Examples:
      - <subject> -> <object>

    Slug: <normalized-title>

Truncation is structural, not textual: descriptions are split into a
``lead`` sentence and the remaining ``detail`` at construction time
(:class:`Phrase`), so truncation drops *fields*, never mid-sentence text.
Passes run in spec order while the card
 exceeds the token budget:

1. ``example[<rank>]`` — drop examples from the end (lowest diversity rank
   first);
2. ``ancestor_details`` / ``source_type_details`` / ``target_type_details``
   — reduce ancestor/endpoint descriptions to their lead sentence;
3. hard budget only: ``ancestors_section`` — drop the ancestors block.

The title, description, inverse, and endpoint-type summaries are never
dropped. ``severely_truncated`` = the card still exceeds the hard budget
after every pass, or more than half of its examples were dropped.

Sentence splitting is pluggable and lives in ``sentence.py``
(:class:`~atlas_tools.wikidata.sentence.SentenceSplitter`), mirroring
``tokens.TokenCounter``.
"""

import re
from collections.abc import Callable, Generator, Mapping
from typing import Self

from pydantic import BaseModel, ConfigDict, Field
from pydantic_extra_types.language_code import LanguageAlpha2

from atlas_tools.common import sha256_bytes
from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.model import Constraints, EntityLabel, Pid, PropertyRecord
from atlas_tools.wikidata.sentence import SentenceSplitter
from atlas_tools.wikidata.tokens import TokenCounter


def slugify(label: str) -> str:
    """Normalized URL slug: lowercase, non-alphanumeric runs -> '-'."""
    return re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")


def yes_no(flag: bool) -> str:
    return "yes" if flag else "no"


def _collapse_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip())


def _render_constraints(constraints: Constraints) -> Generator[str]:
    direction = "symmetric" if constraints.symmetric else "source -> target"

    yield f"symmetric? {yes_no(constraints.symmetric)}"
    yield f"transitive? {yes_no(constraints.transitive)}"
    yield f"single value? {yes_no(constraints.single_value)}"
    yield f"distinct values? {yes_no(constraints.distinct_values)}"
    yield f"direction: {direction}"


class Phrase(BaseModel):
    """A referenced entity as text: label plus a description split into the
    lead sentence and truncatable detail (the remaining sentences)."""

    label: str

    lead: str | None = None
    detail: str | None = None

    def render(self) -> str:
        description = " ".join(part for part in (self.lead, self.detail) if part)

        return f"{self.label} ({description})" if description else self.label

    @classmethod
    def make(
        cls,
        entity_id: Pid,
        labels: Mapping[Pid, EntityLabel],
        *,
        language: LanguageAlpha2,
        splitter: SentenceSplitter,
    ) -> Self | None:
        entry = labels.get(entity_id, EntityLabel())
        label = _collapse_whitespace(entry.label)

        if not label:
            # An unlabeled reference is a bare identifier: no transferable
            # signal, so it contributes nothing to the card.
            return None

        description = _collapse_whitespace(entry.description)
        if not description:
            return cls(label=label)

        [lead, *detail] = splitter.split(description, language=language)
        return cls(label=label, lead=lead, detail=" ".join(detail) or None)


class CardContents(BaseModel):
    """Structured card body; ``render()`` is the only text projection."""

    prelude: list[str] = Field(default_factory=list)
    ancestors: list[Phrase] = Field(default_factory=list)
    source_types: list[Phrase] = Field(default_factory=list)
    target_types: list[Phrase] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    examples: list[str] = Field(default_factory=list)
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
            yield ["Examples:", *(f"  - {example}" for example in self.examples)]

        if self.epilogue:
            yield self.epilogue

    def render(self) -> str:
        """The card text: blank-line separated blocks, trailing newline."""
        return "\n\n".join("\n".join(block) for block in self._blocks()) + "\n"

    def tokens(self, *, counter: TokenCounter) -> int:
        return counter.count(self.render())

    @classmethod
    def make(
        cls,
        *,
        record: PropertyRecord,
        labels: Mapping[Pid, EntityLabel],
        config: Config,
        splitter: SentenceSplitter,
    ) -> Self | None:
        language = config.extraction.primary_language

        title = record.labels.get(language)
        if title is None:
            # No title in the primary language: nothing embeddable.
            return None

        def phrase(entity_id: Pid) -> Phrase | None:
            return Phrase.make(entity_id, labels, language=language, splitter=splitter)

        this = cls()
        this.prelude.append(f"Relation: {title}")
        if description := record.descriptions.get(language):
            this.prelude.append(f"Description: {description}")

        if aliases := record.aliases.get(language, []):
            this.prelude.append("Aliases:")
            this.prelude.extend(f"  - {alias}" for alias in aliases)

        if record.inverse_pid and (inverse := phrase(record.inverse_pid)):
            this.prelude.append(f"Inverse: {inverse.render()}")

        this.ancestors = [
            entry for ancestor in record.ancestors if (entry := phrase(ancestor))
        ]

        this.source_types = [
            entry
            for subject_type in record.constraints.subject_types
            if (entry := phrase(subject_type))
        ]
        this.target_types = [
            entry
            for value_type in record.constraints.value_types
            if (entry := phrase(value_type))
        ]

        this.constraints = list(_render_constraints(record.constraints))
        this.examples = [
            f"{example.subject_label} -> {example.object_label}"
            for example in record.examples
        ]

        this.epilogue.append(f"Slug: {slugify(title)}")
        return this


class Card(BaseModel):
    """One finished card: structured contents plus the rendered projection
    (frozen together at build time so they cannot drift)."""

    model_config = ConfigDict(frozen=True)

    pid: Pid

    contents: CardContents
    card_text: str
    card_hash: str  # sha256 of the UTF-8 card text

    token_count: int

    truncations: list[str]
    severely_truncated: bool
    retrieved_at: str | None


# One budget-recovery step: shrinks the contents in place and returns the
# omission label, or ``None`` once the pass is exhausted.
type TruncationPass = Callable[[CardContents], str | None]


def _drop_example(contents: CardContents) -> str | None:
    # We want to preserve at least *one* example
    if len(contents.examples) <= 1:
        return None

    contents.examples.pop()
    return f"example[{len(contents.examples)}]"


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


# Spec order: examples first (from the end), then sentence-level detail in
# ancestor -> source -> target priority. Title, description, inverse, and
# endpoint-type summaries are never dropped.
_BUDGET_PASSES: tuple[TruncationPass, ...] = (
    _drop_example,
    _strip_ancestor_details,
    _strip_source_type_details,
    _strip_target_type_details,
)

# Only when even that leaves the card above the HARD budget.
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
                break  # exhausted; move to the next pass

            truncations.append(label)


def build_card(
    *,
    record: PropertyRecord,
    labels: Mapping[Pid, EntityLabel],
    config: Config,
    counter: TokenCounter,
    splitter: SentenceSplitter,
) -> Card | None:
    """Construct + budget one card; ``None`` for untitled records."""
    budgets = config.cards
    contents = CardContents.make(
        record=record, labels=labels, config=config, splitter=splitter
    )
    if contents is None:
        return None

    total_examples = len(contents.examples)
    truncations: list[str] = []

    _run_passes(
        contents,
        _BUDGET_PASSES,
        budget=budgets.token_budget,
        counter=counter,
        truncations=truncations,
    )

    if contents.tokens(counter=counter) > budgets.hard_token_budget:
        _run_passes(
            contents,
            _HARD_BUDGET_PASSES,
            budget=budgets.hard_token_budget,
            counter=counter,
            truncations=truncations,
        )

    dropped_examples = total_examples - len(contents.examples)
    severely_truncated = (
        contents.tokens(counter=counter) > budgets.hard_token_budget
        or dropped_examples * 2 > total_examples
    )

    card_text = contents.render()
    return Card(
        pid=record.pid,
        contents=contents,
        card_text=card_text,
        card_hash=sha256_bytes(card_text.encode("utf-8")),
        token_count=contents.tokens(counter=counter),
        truncations=truncations,
        severely_truncated=severely_truncated,
        retrieved_at=record.retrieved_at,
    )
