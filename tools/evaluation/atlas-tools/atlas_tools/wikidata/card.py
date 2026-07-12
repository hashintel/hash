import re
from collections.abc import Generator, Mapping
from typing import Callable, Self

from nltk.tokenize import sent_tokenize
from pydantic import BaseModel, Field
from pydantic_extra_types.language_code import LanguageAlpha2

from atlas_tools.common import sha256_bytes
from atlas_tools.wikidata.cards import TokenCounter
from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.model import Constraints, EntityLabel, Pid, PropertyRecord


def slugify(label: str) -> str:
    """Normalized URL slug: lowercase, non-alphanumeric runs -> '-'."""
    return re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")


def _sentences(text: str, *, lang: LanguageAlpha2) -> list[str]:
    return sent_tokenize(text, language=lang.name.lower())


def yes_no(flag: bool) -> str:
    return "yes" if flag else "no"


def _render_constraints(*, constraints: Constraints):
    direction = "symmetric" if constraints.symmetric else "source -> target"

    yield f"  - symmetric? {yes_no(constraints.symmetric)}"
    yield f"  - transitive? {yes_no(constraints.transitive)}"
    yield f"  - single value? {yes_no(constraints.single_value)}"
    yield f"  - distinct values? {yes_no(constraints.distinct_values)}"
    yield f"  - direction: {direction}"


class Phrase(BaseModel):
    label: str

    lead: str | None = None
    detail: str | None = None

    def render(self) -> str:
        description = " ".join(
            sentence for sentence in (self.lead, self.detail) if sentence
        )

        return f"{self.label} ({description})" if description else self.label

    @classmethod
    def make(
        cls,
        entity_id: Pid,
        labels: Mapping[Pid, EntityLabel],
        *,
        lang: LanguageAlpha2,
    ) -> Self | None:
        entry = labels.get(entity_id, EntityLabel())
        label = re.sub(r"\s+", " ", entry.label.strip())

        if not label:
            return None

        this = cls(label=label, lead=None, detail=None)

        description = entry.description.strip()
        description = re.sub(r"\s+", " ", description)
        if description:
            description = _sentences(description, lang=lang)
            [lead, *detail] = description

            this.lead = lead
            this.detail = " ".join(detail) if detail else None

        return this


class CardContents(BaseModel):
    prelude: list[str] = Field(default_factory=list)
    ancestors: list[Phrase] = Field(default_factory=list)
    source_types: list[Phrase] = Field(default_factory=list)
    target_types: list[Phrase] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    examples: list[str] = Field(default_factory=list)
    epilogue: list[str] = Field(default_factory=list)

    def render(self) -> Generator[str]:
        yield from self.prelude

        if self.ancestors:
            yield ""
            yield "Ancestors:"
            for ancestor in self.ancestors:
                yield f"  - {ancestor.render()}"

        yield ""
        yield "Source types:"
        for source_type in self.source_types:
            yield f"  - {source_type.render()}"

        yield ""
        yield "Target types:"
        for target_type in self.target_types:
            yield f"  - {target_type.render()}"

        if self.constraints:
            yield ""
            yield "Constraints:"
            for constraint in self.constraints:
                yield f"  - {constraint}"
        else:
            yield ""
            yield "Constraints: none"

        if self.examples:
            yield ""
            yield "Examples:"

            for example in self.examples:
                yield f"  - {example}"

        yield from self.epilogue

    def tokens(self, *, counter: TokenCounter) -> int:
        return counter.count("\n".join(self.render()))

    @classmethod
    def make(
        cls,
        *,
        record: PropertyRecord,
        labels: Mapping[Pid, EntityLabel],
        config: Config,
    ) -> Self | None:
        primary_language = config.extraction.primary_language

        title = record.labels.get(primary_language, None)
        description = record.descriptions.get(primary_language, None)
        aliases = record.aliases.get(primary_language, [])

        if title is None:
            return None

        this = cls()
        this.prelude.append(f"Relation: {title}")
        if description:
            this.prelude.append(f"Description: {description}")

        if aliases:
            this.prelude.append("Aliases:")

        for alias in aliases:
            this.prelude.append(f"  - {alias}")

        if record.inverse_pid:
            inverse_phrase = Phrase.make(
                record.inverse_pid,
                labels,
                lang=primary_language,
            )

            if inverse_phrase and (rendered := inverse_phrase.render()):
                this.prelude.append(f"Inverse: {rendered}")

        this.ancestors = [
            phrase
            for ancestor in record.ancestors
            if (phrase := Phrase.make(ancestor, labels, lang=primary_language))
        ]

        this.source_types = [
            phrase
            for subject_type in record.constraints.subject_types
            if (phrase := Phrase.make(subject_type, labels, lang=primary_language))
        ]

        this.target_types = [
            phrase
            for value_type in record.constraints.value_types
            if (phrase := Phrase.make(value_type, labels, lang=primary_language))
        ]

        this.constraints = list(_render_constraints(constraints=record.constraints))
        this.examples = [
            f"{example.subject_label} -> {example.object_label}"
            for example in record.examples
        ]

        this.epilogue.append(f"Slug: {slugify(title)}")
        return this


class Card(BaseModel):
    pid: Pid

    contents: CardContents
    contents_hash: str

    token_count: int

    truncations: list[str]
    severely_truncated: bool
    retrieved_at: str | None


type TruncationPass = Callable[[CardContents], bool]


def drop_example(card: CardContents) -> bool:
    if not card.examples:
        return False

    card.examples.pop()
    return True


def strip_ancestor_details(card: CardContents) -> bool:
    hit = False

    for ancestor in card.ancestors:
        hit |= ancestor.detail is not None
        ancestor.detail = None

    return hit


def strip_source_type_details(card: CardContents) -> bool:
    hit = False

    for source_type in card.source_types:
        hit |= source_type.detail is not None
        source_type.detail = None

    return hit


def strip_target_type_details(card: CardContents) -> bool:
    hit = False

    for target_type in card.target_types:
        hit |= target_type.detail is not None
        target_type.detail = None

    return hit


def drop_ancestors(card: CardContents) -> bool:
    hit = len(card.ancestors) > 0
    card.ancestors.clear()

    return hit


_PASSES: list[TruncationPass] = [
    drop_example,
    strip_ancestor_details,
    strip_source_type_details,
    strip_target_type_details,
    drop_ancestors,
]


def build_card(
    *,
    record: PropertyRecord,
    labels: Mapping[Pid, EntityLabel],
    config: Config,
    counter: TokenCounter,
):
    budgets = config.cards
    contents = CardContents.make(record=record, labels=labels, config=config)
    if contents is None:
        return None

    applied: list[TruncationPass] = []
    pass_index = 0
    while (
        pass_index < len(_PASSES)
        and contents.tokens(counter=counter) > budgets.token_budget
    ):
        if _PASSES[pass_index](contents):
            applied.append(_PASSES[pass_index])
        else:
            # This pass has been exhausted, and we move on to the next one
            pass_index += 1

    tokens = contents.tokens(counter=counter)
    # TODO: reclassify what severely truncated means
    if tokens > budgets.token_budget:
        return None

    return Card(
        pid=record.pid,
        contents=contents,
        contents_hash=sha256_bytes("\n".join(contents.render()).encode("utf-8")),
        token_count=tokens,
        truncations=[applied.__name__ for applied in applied],
        severely_truncated=False,
        retrieved_at=record.retrieved_at,
    )
