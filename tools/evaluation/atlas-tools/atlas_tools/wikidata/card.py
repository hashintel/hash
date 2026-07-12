import re
from collections.abc import Callable, Generator, Mapping
from enum import Enum, auto

from nltk.tokenize import sent_tokenize
from pydantic.dataclasses import dataclass
from pydantic_extra_types.language_code import LanguageAlpha2

from atlas_tools.wikidata.cards import TokenCounter
from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.model import Constraints, EntityLabel, Pid, PropertyRecord


def slugify(label: str) -> str:
    """Normalized URL slug: lowercase, non-alphanumeric runs -> '-'."""
    return re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")


def _sentences(text: str, *, lang: LanguageAlpha2) -> list[str]:
    return sent_tokenize(text, language=lang.name.lower())


def _entity_phrase(
    entity_id: Pid,
    labels: Mapping[Pid, EntityLabel],
    *,
    lang: LanguageAlpha2,
) -> str | None:
    entry = labels.get(entity_id, EntityLabel())
    output = re.sub(r"\s+", " ", entry.label.strip())

    if not output:
        return None

    description = entry.description.strip()
    description = re.sub(r"\s+", " ", description)
    if description:
        description = _sentences(description, lang=lang)
        [first, *rest] = description
        description = first

        if rest:
            rest = " ".join(rest)
            rest = f"\u200b{rest}\u200b"
            description = f"{first} {rest}"

        output = f"{output} ({description})"

    return output


def _entity_phrase_list(
    entity_ids: tuple[Pid, ...],
    labels: Mapping[Pid, EntityLabel],
    *,
    lang: LanguageAlpha2,
):
    for entity_id in entity_ids:
        if phrase := _entity_phrase(entity_id, labels, lang=lang):
            yield f"  - {phrase}"


class Section(Enum):
    PRELUDE = auto()
    ANCESTORS = auto()
    SOURCE = auto()
    TARGET = auto()
    CONSTRAINTS = auto()
    EXAMPLES = auto()
    EXAMPLE = auto()
    EPILOGUE = auto()


@dataclass
class _TruncationState:
    example_count: int
    drop_examples_section: bool = False
    drop_ancestors_section: bool = False
    truncate_ancestors: bool = False
    truncate_source_types: bool = False
    truncate_destination_types: bool = False


def yes_no(flag: bool) -> str:
    return "yes" if flag else "no"


def _render_constraints(*, constraints: Constraints):
    direction = "symmetric" if constraints.symmetric else "source -> target"

    yield f"  - symmetric? {yes_no(constraints.symmetric)}"
    yield f"  - transitive? {yes_no(constraints.transitive)}"
    yield f"  - single value? {yes_no(constraints.single_value)}"
    yield f"  - distinct values? {yes_no(constraints.distinct_values)}"
    yield f"  - direction: {direction}"


def _render(
    *,
    record: PropertyRecord,
    labels: Mapping[Pid, EntityLabel],
    config: Config,
) -> Generator[str | Section]:
    primary_language = config.extraction.primary_language

    title = record.labels.get(primary_language, None)
    description = record.descriptions.get(primary_language, None)
    aliases = record.aliases.get(primary_language, [])

    if title is None:
        return

    yield Section.PRELUDE
    yield f"Relation: {title}"
    if description:
        yield f"Description: {description}"

    if aliases:
        yield "Aliases:"

    for alias in aliases:
        yield f"  - {alias}"

    if record.inverse_pid:
        inverse_phrase = _entity_phrase(
            record.inverse_pid,
            labels,
            lang=primary_language,
        )

        if inverse_phrase:
            yield f"Inverse: {inverse_phrase}"

    if record.ancestors:
        yield Section.ANCESTORS

        yield "Ancestors:"
        yield from _entity_phrase_list(
            record.ancestors,
            labels,
            lang=primary_language,
        )

    yield Section.SOURCE
    yield "Source types:"
    yield from _entity_phrase_list(
        record.constraints.subject_types,
        labels,
        lang=primary_language,
    )

    yield Section.TARGET
    yield "Target types:"
    yield from _entity_phrase_list(
        record.constraints.value_types,
        labels,
        lang=primary_language,
    )

    yield Section.CONSTRAINTS
    yield "Constraints:"
    yield from _render_constraints(constraints=record.constraints)

    if record.examples:
        yield Section.EXAMPLES
        yield "Examples:"

        for example in record.examples:
            yield Section.EXAMPLE
            yield f"  - {example.subject_label} -> {example.object_label}"

    yield Section.EPILOGUE
    yield f"Slug: {slugify(title)}"


def _count_tokens(lines: list[Section | str], *, counter: TokenCounter) -> int:
    sum = 0
    for line in lines:
        if isinstance(line, Section):
            sum += counter.count("\n")
            continue

        sum += counter.count(line)
        sum += counter.count("\n")

    return sum


def _rposition[T](iter: list[T], predicate: Callable[[T], bool]) -> int | None:
    return next(
        (
            i
            for i, v in ((j, iter[j]) for j in reversed(range(len(iter))))
            if predicate(v)
        ),
        None,
    )


def _position[T](iter: list[T], predicate: Callable[[T], bool]) -> int | None:
    return next(
        (i for i, v in ((j, iter[j]) for j in range(len(iter))) if predicate(v)),
        None,
    )


def build_card(
    *,
    record: PropertyRecord,
    labels: Mapping[Pid, EntityLabel],
    config: Config,
    counter: TokenCounter,
):
    budgets = config.cards
    lines = list(_render(record=record, labels=labels, config=config))
    count = _count_tokens(lines, counter=counter)
    removed: list[Section | str] = []

    # (a) drop examples from the end, lowest diversity rank first
    while count > budgets.token_budget:
        position = _rposition(lines, lambda line: line == Section.EXAMPLE)
        if position is None:
            break

        # Find the next section after the example, drop everything between them
        next_position = _position(
            lines[position + 1 :], lambda line: isinstance(line, Section)
        )

        if next_position is None:
            omitted = lines[position + 1 :]
            lines = lines[:position]
        else:
            omitted = lines[position + 1 : position + 1 + next_position]
            lines = lines[:position] + lines[position + next_position + 1 :]

        removed.extend(omitted)
        count = _count_tokens(lines, counter=counter)

    # (b) sentence-boundary truncation, in priority order
    if count > budgets.token_budget:
        # first truncate the description inside of ancestors
        position = _position(lines, lambda line: line == Section.ANCESTORS)
        if position is not None:
            # Find the next section after the ancestors, drop everything between them
            next_position = _position(
                lines[position + 1 :], lambda line: isinstance(line, Section)
            )
            next_index = (
                position + 1 + next_position
                if next_position is not None
                else len(lines)
            )

            # We mark truncatable content with surrounding ZWS, so we can just remove it
            for index in range(position + 1, next_index):
                line = lines[index]
                if isinstance(line, str):
                    lines[index] = re.sub(r"(?<!\u200B)(?<!\n)\s+(?!\u200B)", "", line)

    ...  # TODO: you can finish this
