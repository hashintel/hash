"""Single-card construction: structured contents, rendering, truncation.

Card format v5
--------------
A card is deterministic labeled text, never JSON: one section per block,
blank-line separated, in a fixed priority order. Wikidata identifiers stay
out of the text to keep the training and inference distributions matched:
the classifier later scores cards built from ontologies that have no
PIDs or QIDs.

    Relation: <title>
    Description: <description>
    Aliases:
      - <alias>
    Inverse Name: <label> (<description>)

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
      - <stratum label>: <subject> -> <object>

    Slug: <normalized-title>

Examples arrive grouped by source-type stratum (``examples.py``): each
line is prefixed with the label of the subject-type constraint class its
subject belongs to (for example ``municipality: Cluj-Napoca -> Emil Boc``).
Unstratified selections (property without constraints, or the fallback
pool) render the bare ``<subject> -> <object>`` form. The stratum label
vocabulary is part of the card-format version.

Truncation is structural, not textual: descriptions are split into a
``lead`` sentence and the remaining ``detail`` at construction time
(:class:`Phrase`), so truncation drops whole fields, never mid-sentence
text. Passes run in a fixed order while the card exceeds the token budget:

1. ``example[<index>]``: drop example slots round-robin from the largest
   strata (lowest draw rank within the stratum first); a stratum is never
   emptied while any stratum still holds two or more examples;
2. ``ancestor_details`` / ``source_type_details`` / ``target_type_details``:
   reduce ancestor/endpoint descriptions to their lead sentence;
3. ``example_stratum[<index>]``: only after detail-stripping, drop whole
   single-example strata from the end (at least one example survives);
4. hard budget only: ``example_section`` / ``ancestors_section``.

The title, description, inverse, and endpoint-type summaries are never
dropped. ``severely_truncated`` means the card still exceeds the hard
budget after every pass, or more than half of its examples were dropped.

Sentence splitting is pluggable and lives in ``sentence.py``
(:class:`~atlas_tools.wikidata.sentence.SentenceSplitter`), mirroring
``tokens.TokenCounter``.
"""

import re
from collections.abc import Callable, Generator, Mapping
from typing import Self

from pydantic import BaseModel, ConfigDict, Field
from pydantic_extra_types.language_code import LanguageAlpha2

from atlas_tools.common import Sha256Hex, sha256_bytes
from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.model import (
    Constraints,
    EntityId,
    EntityLabel,
    Pid,
    PropertyRecord,
    Qid,
)
from atlas_tools.wikidata.sentence import SentenceSplitter
from atlas_tools.wikidata.tokens import TokenCounter


def slugify(label: str) -> str:
    """Normalize a label into a URL slug (lowercase; non-alphanumeric runs become '-')."""
    return re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")


def yes_no(*, flag: bool) -> str:
    return "yes" if flag else "no"


def _collapse_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip())


def _render_constraints(constraints: Constraints) -> Generator[str]:
    direction = "symmetric" if constraints.symmetric else "source -> target"

    yield f"symmetric? {yes_no(flag=constraints.symmetric)}"
    yield f"transitive? {yes_no(flag=constraints.transitive)}"
    yield f"single value? {yes_no(flag=constraints.single_value)}"
    yield f"distinct values? {yes_no(flag=constraints.distinct_values)}"
    yield f"direction: {direction}"


class Phrase(BaseModel):
    """A referenced entity rendered as text.

    The label plus a description split at construction time into the lead
    sentence and the truncatable ``detail`` (the remaining sentences), so
    truncation later drops whole fields rather than mid-sentence text.
    """

    label: str

    lead: str | None = None
    detail: str | None = None

    def render(self) -> str:
        description = " ".join(part for part in (self.lead, self.detail) if part)

        return f"{self.label} ({description})" if description else self.label

    @classmethod
    def make(
        cls,
        entity_id: EntityId,
        labels: Mapping[EntityId, EntityLabel],
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


class ExampleLine(BaseModel):
    """One Examples bullet.

    The rendered pair text plus its stratum label; the label is ``None``
    on unstratified cards, and then no prefix is rendered.
    """

    text: str
    stratum_label: str | None = None

    def render(self) -> str:
        if self.stratum_label is None:
            return self.text

        return f"{self.stratum_label}: {self.text}"


class CardContents(BaseModel):
    """Structured card body; ``render()`` is the only text projection."""

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
        """Render the card text: blank-line separated blocks, trailing newline."""
        return "\n\n".join("\n".join(block) for block in self._blocks()) + "\n"

    def tokens(self, *, counter: TokenCounter) -> int:
        return counter.count(self.render())

    @classmethod
    def make(
        cls,
        *,
        record: PropertyRecord,
        labels: Mapping[EntityId, EntityLabel],
        config: Config,
        splitter: SentenceSplitter,
    ) -> Self | None:
        language = config.extraction.primary_language

        title = record.labels.get(language)
        if title is None:
            # No title in the primary language: nothing embeddable.
            return None

        def phrase(entity_id: EntityId) -> Phrase | None:
            return Phrase.make(entity_id, labels, language=language, splitter=splitter)

        this = cls()
        this.prelude.append(f"Relation: {title}")
        if description := record.descriptions.get(language):
            this.prelude.append(f"Description: {description}")

        if aliases := record.aliases.get(language, []):
            this.prelude.append("Aliases:")
            this.prelude.extend(f"  - {alias}" for alias in aliases)

        if record.inverse_pid and (inverse := phrase(record.inverse_pid)):
            this.prelude.append(f"Inverse Name: {inverse.render()}")
        else:
            this.prelude.append("Inverse Name: none recorded")

        this.ancestors = [entry for ancestor in record.ancestors if (entry := phrase(ancestor))]

        this.source_types = [
            entry
            for subject_type in record.constraints.subject_types
            if (entry := phrase(subject_type))
        ]
        this.target_types = [
            entry for value_type in record.constraints.value_types if (entry := phrase(value_type))
        ]

        this.constraints = list(_render_constraints(record.constraints))

        def stratum_label(stratum: Qid | None) -> str | None:
            # An unlabeled constraint class carries no transferable signal;
            # its examples render bare, like unstratified ones.
            if stratum is None:
                return None

            return _collapse_whitespace(labels.get(stratum, EntityLabel()).label) or None

        this.examples = [
            ExampleLine(
                text=f"{example.subject_label} -> {example.object_label}",
                stratum_label=stratum_label(example.stratum),
            )
            for example in record.examples
        ]

        this.epilogue.append(f"Slug: {slugify(title)}")
        return this


class Card(BaseModel):
    """One finished card.

    Structured contents plus the rendered projection, frozen together at
    build time so they cannot drift.
    """

    model_config = ConfigDict(frozen=True)

    pid: Pid

    contents: CardContents
    card_text: str
    card_hash: Sha256Hex  # sha256 of the UTF-8 card text

    token_count: int

    truncations: list[str]
    severely_truncated: bool
    retrieved_at: str | None


# One budget-recovery step: shrinks the contents in place and returns the
# omission label, or ``None`` once the pass is exhausted.
type TruncationPass = Callable[[CardContents], str | None]


def _example_groups(
    examples: list[ExampleLine],
) -> list[tuple[str | None, list[int]]]:
    """Group example indices by stratum label, in first-seen order.

    Selection emits examples already grouped, so groups are contiguous.
    """
    order: list[str | None] = []
    groups: dict[str | None, list[int]] = {}

    for index, line in enumerate(examples):
        if line.stratum_label not in groups:
            groups[line.stratum_label] = []
            order.append(line.stratum_label)
        groups[line.stratum_label].append(index)

    return [(label, groups[label]) for label in order]


def _drop_example_slot(contents: CardContents) -> str | None:
    """Drop one example from the currently-largest stratum (lowest draw rank first).

    Ties go to the latest group, which makes repeated calls round-robin
    across equally-sized strata. This pass never empties a stratum; groups
    of one are left to :func:`_drop_example_stratum`.
    """
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
    """Drop the last whole stratum.

    Runs after detail-stripping, when every stratum is down to one
    example. At least one example always survives the soft passes.
    """
    if len(contents.examples) <= 1:
        return None

    groups = _example_groups(contents.examples)
    label, indices = groups[-1]

    if len(groups) == 1:
        # A single (possibly unstratified) group: shrink it instead of
        # dropping it, preserving the one-example floor.
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


# Pass order: example slots first (round-robin from the largest strata),
# then sentence-level detail in ancestor -> source -> target priority, and
# only then whole single-example strata, so a stratum outlives every
# expendable description sentence. The title, description, inverse, and
# endpoint-type summaries are never dropped.
_BUDGET_PASSES: tuple[TruncationPass, ...] = (
    _drop_example_slot,
    _strip_ancestor_details,
    _strip_source_type_details,
    _strip_target_type_details,
    _drop_example_stratum,
)

# Run only when the soft passes leave the card above the hard budget.
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
    labels: Mapping[EntityId, EntityLabel],
    config: Config,
    counter: TokenCounter,
    splitter: SentenceSplitter,
) -> Card | None:
    """Construct and budget one card; returns ``None`` for untitled records."""
    budgets = config.cards
    contents = CardContents.make(record=record, labels=labels, config=config, splitter=splitter)
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
