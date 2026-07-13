"""Adapt Wikidata property records to the canonical relation-card renderer.

Besides resolving structural references (ancestors, endpoint types,
inverse) into labels, the adapter sanitizes Wikidata *prose*: label and
description text on Wikidata routinely cross-references other properties
by identifier ("use P276 for ...", 'inverse property of "has part"
(P527)'). Those identifiers are the exact surface watermark the
identifier-free card contract forbids.

Detection is by membership, not shape. The extraction already
enumerates the identifier universe: the ``labels`` map
(``entity_labels.json``) holds every retained property PID and every
structurally referenced entity, and the extraction's exclusion table
names the property ids it saw but did not retain (external-ID,
maintenance, deprecated). An identifier-shaped token
(``_IDENTIFIER_TOKEN``) is only a *candidate*; membership decides what
it is:

1. in the map with a label, directly preceded by that label: redundant,
   deleted (``"has part" (P527)`` -> ``"has part"``);
2. in the map with a label, anywhere else: replaced by its quoted label
   (``use P276 for ...`` -> ``use "location" for ...``);
3. known but unlabeled (a failed label fetch, or an excluded property):
   a confirmed identifier that cannot be rendered as text, so its
   sentence is dropped whole (deleting just the token would leave
   meaningless prose);
4. unknown: not an identifier as far as the extraction is concerned.
   The prose is left untouched, because a real-world token that merely
   looks like an id (a fiscal "Q1", a cytochrome "P450") must never be
   destroyed on a guess.

Every decision is counted into a :class:`ProseSanitizationSummary`:
per-card summaries land in the cards manifest next to corpus totals,
unknown id-shaped tokens surviving anywhere in the finished card input
are histogrammed for triage, and ``render_cards`` fails the run when
sanitization empties too large a fraction of prose fields
(``CardsConfig.max_prose_field_empty_fraction``), so over-removal is a
measured, gated quantity rather than an invisible one.

Enforcement stays in the one existing lint point: known ids that survive
into any card-input string (titles and labels are never rewritten) are
added to the ``forbidden_identifiers`` set that the shared renderer's
:func:`~atlas_tools.relation_cards.common.card.lint_card_text` already
checks, so a leak fails card construction through the same
:class:`~atlas_tools.relation_cards.common.card.IdentifierLeakError` path
as every other forbidden identifier.
"""

import re
from collections import Counter
from collections.abc import Collection, Generator, Iterable, Mapping
from typing import Self

from pydantic import BaseModel, ConfigDict, Field
from pydantic_extra_types.language_code import LanguageAlpha2

from atlas_tools.relation_cards.common.card import Card as RenderedCard
from atlas_tools.relation_cards.common.card import build_card as render_card
from atlas_tools.relation_cards.common.model import (
    PhraseInput,
    RelationCardInput,
    RelationConstraints,
    RelationExample,
)
from atlas_tools.relation_cards.common.sentence import SentenceSplitter
from atlas_tools.relation_cards.common.tokens import TokenCounter
from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.model import (
    EntityId,
    EntityLabel,
    Example,
    Pid,
    PropertyRecord,
    Qid,
    is_qid,
)


def _collapse_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip())


# A PID/QID-shaped token in running text: a *candidate* identifier whose
# meaning the labels map decides (see module docstring). The boundary
# lookarounds keep fragments of longer words ("IP54", "Q10a") from
# matching.
_IDENTIFIER_TOKEN = re.compile(r"(?<![A-Za-z0-9])[PQ]\d+(?![A-Za-z0-9])")

# Characters that may sit between a label and its own parenthesized
# identifier: whitespace, opening brackets, and straight or typographic
# quotes, as in '"has part" (P527'.
_LABEL_SUFFIX_CHARS = " \t([\"'\u201c\u201d\u2018\u2019"


def _label_precedes(prefix: str, label: str) -> bool:
    trimmed = prefix.rstrip(_LABEL_SUFFIX_CHARS)
    return trimmed.lower().endswith(label.lower())


class ProseSanitization(BaseModel):
    """One field's sanitized text plus what the pass did to produce it.

    Unknown id-shaped tokens are deliberately absent here: they stay in
    the text, so :func:`build_card` histograms them once from the
    finished card input instead of per pass.
    """

    model_config = ConfigDict(frozen=True)

    text: str | None
    substitutions: int = 0
    redundant_removals: int = 0
    dropped_sentences: int = 0
    # Confirmed identifiers (known but unlabeled) whose sentences were
    # dropped.
    dropped_tokens: tuple[str, ...] = ()


class ProseSanitizationSummary(BaseModel):
    """Frozen tally of prose sanitization, per card or per corpus."""

    model_config = ConfigDict(frozen=True)

    # Non-empty prose fields fed through the sanitizer, and how many were
    # emptied entirely (the strongest overfilter signal: nothing sayable
    # survived). ``fields_emptied / fields_sanitized`` is the guarded ratio.
    fields_sanitized: int = 0
    fields_emptied: int = 0
    # Benign, meaning-preserving rewrites: a resolvable identifier replaced
    # by its quoted label, or one deleted as redundant beside its own label.
    substitutions: int = 0
    redundant_removals: int = 0
    # Sentences dropped for confirmed-but-unlabeled identifiers, with the
    # histogram of those tokens.
    dropped_sentences: int = 0
    dropped_tokens: dict[str, int] = Field(default_factory=dict)
    # Id-shaped tokens outside the known universe, left untouched in the
    # finished card input. A non-empty histogram is the triage list for
    # possible watermarks the extraction does not know about.
    unknown_tokens: dict[str, int] = Field(default_factory=dict)

    @property
    def empty_fraction(self) -> float:
        if self.fields_sanitized == 0:
            return 0.0
        return self.fields_emptied / self.fields_sanitized

    @classmethod
    def tally(
        cls,
        results: Iterable[ProseSanitization],
        *,
        unknown_tokens: Mapping[str, int] | None = None,
    ) -> Self:
        """Fold one card's per-field results into a summary."""
        results = list(results)
        dropped: Counter[str] = Counter()
        for result in results:
            dropped.update(result.dropped_tokens)
        return cls(
            fields_sanitized=len(results),
            fields_emptied=sum(result.text is None for result in results),
            substitutions=sum(result.substitutions for result in results),
            redundant_removals=sum(result.redundant_removals for result in results),
            dropped_sentences=sum(result.dropped_sentences for result in results),
            dropped_tokens=dict(dropped),
            unknown_tokens=dict(unknown_tokens or {}),
        )

    @classmethod
    def merge(cls, summaries: Iterable[Self]) -> Self:
        """Sum per-card summaries into one corpus-wide summary."""
        summaries = list(summaries)
        dropped: Counter[str] = Counter()
        unknown: Counter[str] = Counter()
        for summary in summaries:
            dropped.update(summary.dropped_tokens)
            unknown.update(summary.unknown_tokens)
        return cls(
            fields_sanitized=sum(summary.fields_sanitized for summary in summaries),
            fields_emptied=sum(summary.fields_emptied for summary in summaries),
            substitutions=sum(summary.substitutions for summary in summaries),
            redundant_removals=sum(summary.redundant_removals for summary in summaries),
            dropped_sentences=sum(summary.dropped_sentences for summary in summaries),
            dropped_tokens=dict(dropped),
            unknown_tokens=dict(unknown),
        )


def _cleanup_removals(text: str) -> str:
    """Repair punctuation artifacts left by deleting identifier tokens."""
    previous = None
    while previous != text:
        previous = text
        text = re.sub(r"\(\s*,\s*", "(", text)  # "(, see also ..." -> "(see also ..."
        text = re.sub(r"\s*,\s*\)", ")", text)  # "..., )" -> "...)"
        text = re.sub(r"\s*\(\s*\)", "", text)  # dangling empty parentheses
    return _collapse_whitespace(re.sub(r"\s+\)", ")", re.sub(r"\(\s+", "(", text)))


def sanitize_prose(
    text: str,
    *,
    labels: Mapping[EntityId, EntityLabel],
    known_identifiers: Collection[str] = frozenset(),
    language: LanguageAlpha2,
    splitter: SentenceSplitter,
) -> ProseSanitization:
    """Rewrite known identifiers out of one prose field (see module docstring).

    ``known_identifiers`` extends the membership universe beyond the
    labels map with ids the extraction saw but did not resolve (the
    exclusion table). ``text`` is ``None`` in the result when nothing
    sayable survives (the whole field was known identifiers, or every
    sentence carried a confirmed-but-unlabeled one). Prose whose only
    candidate tokens are outside the known universe passes through
    byte-identically.
    """
    substitutions = 0
    redundant_removals = 0

    def substitute(match: re.Match[str]) -> str:
        nonlocal substitutions, redundant_removals
        token = match.group(0)
        entry = labels.get(token)
        label = _collapse_whitespace(entry.label) if entry else ""
        if not label:
            return token  # confirmed-unlabeled or unknown: decided below
        if _label_precedes(text[: match.start()], label):
            redundant_removals += 1
            return ""  # redundant right next to its own label
        substitutions += 1
        return f'"{label}"'

    substituted = _IDENTIFIER_TOKEN.sub(substitute, text)
    # Untouched prose passes through byte-identically; punctuation repair
    # (and its whitespace collapse) applies only where tokens were removed.
    sanitized = _cleanup_removals(substituted) if substituted != text else text

    dropped_sentences = 0
    dropped: list[str] = []
    if _IDENTIFIER_TOKEN.search(sanitized):
        kept: list[str] = []
        for sentence in splitter.split(sanitized, language=language):
            confirmed = [
                token
                for token in _IDENTIFIER_TOKEN.findall(sentence)
                if token in labels or token in known_identifiers
            ]
            if confirmed:
                dropped_sentences += 1
                dropped.extend(confirmed)
            else:
                kept.append(sentence)
        if dropped_sentences:
            sanitized = " ".join(kept)

    return ProseSanitization(
        text=sanitized or None,
        substitutions=substitutions,
        redundant_removals=redundant_removals,
        dropped_sentences=dropped_sentences,
        dropped_tokens=tuple(dropped),
    )


def _phrase_input(
    entity_id: EntityId,
    labels: Mapping[EntityId, EntityLabel],
    *,
    known_identifiers: Collection[str],
    language: LanguageAlpha2,
    splitter: SentenceSplitter,
    sanitizations: list[ProseSanitization],
) -> PhraseInput | None:
    entry = labels.get(entity_id, EntityLabel())
    if not _collapse_whitespace(entry.label):
        # An unlabeled reference would expose only its source identifier.
        return None

    description: str | None = None
    if entry.description:
        result = sanitize_prose(
            entry.description,
            labels=labels,
            known_identifiers=known_identifiers,
            language=language,
            splitter=splitter,
        )
        sanitizations.append(result)
        description = result.text
    return PhraseInput(label=entry.label, description=description)


def make_card_input(
    *,
    record: PropertyRecord,
    labels: Mapping[EntityId, EntityLabel],
    known_identifiers: Collection[str] = frozenset(),
    language: LanguageAlpha2,
    splitter: SentenceSplitter,
    sanitizations: list[ProseSanitization] | None = None,
) -> RelationCardInput | None:
    """Resolve a Wikidata record into identifier-free canonical card input.

    Prose fields (description, aliases, referenced descriptions) pass
    through :func:`sanitize_prose`; examples whose recorded endpoints are
    not item QIDs (property pages that carried a truthy statement before
    the v5 example query excluded them) are skipped.

    ``splitter`` is required (not defaulted) on purpose: the splitter
    shapes the sanitized text itself via the sentence-drop pass, so a
    silent fallback would let two call paths render different bytes for
    the same record under the same config. ``sanitizations``, when given,
    collects one :class:`ProseSanitization` per non-empty prose field so
    the caller can tally them.
    """
    title = record.labels.get(language)
    if title is None:
        return None

    results = sanitizations if sanitizations is not None else []

    def prose(text: str | None) -> str | None:
        if not text:
            return None
        result = sanitize_prose(
            text,
            labels=labels,
            known_identifiers=known_identifiers,
            language=language,
            splitter=splitter,
        )
        results.append(result)
        return result.text

    def phrase(entity_id: EntityId) -> PhraseInput | None:
        return _phrase_input(
            entity_id,
            labels,
            known_identifiers=known_identifiers,
            language=language,
            splitter=splitter,
            sanitizations=results,
        )

    def stratum_label(stratum: Qid | None) -> str | None:
        if stratum is None:
            return None
        return _collapse_whitespace(labels.get(stratum, EntityLabel()).label) or None

    def item_example(example: Example) -> bool:
        return all(not qid or is_qid(qid) for qid in (example.subject_qid, example.object_qid))

    constraints = record.constraints
    return RelationCardInput(
        language=language,
        title=title,
        description=prose(record.descriptions.get(language)),
        aliases=tuple(
            sanitized for alias in record.aliases.get(language, []) if (sanitized := prose(alias))
        ),
        inverse=phrase(record.inverse_pid) if record.inverse_pid else None,
        ancestors=tuple(
            entry for ancestor in record.ancestors if (entry := phrase(ancestor)) is not None
        ),
        source_types=tuple(
            entry
            for source_type in constraints.subject_types
            if (entry := phrase(source_type)) is not None
        ),
        target_types=tuple(
            entry
            for target_type in constraints.value_types
            if (entry := phrase(target_type)) is not None
        ),
        constraints=RelationConstraints(
            symmetric=constraints.symmetric,
            transitive=constraints.transitive,
            single_value=constraints.single_value,
            distinct_values=constraints.distinct_values,
            direction="symmetric" if constraints.symmetric else "source -> target",
        ),
        examples=tuple(
            RelationExample(
                subject_label=example.subject_label,
                object_label=example.object_label,
                stratum_label=stratum_label(example.stratum),
            )
            for example in record.examples
            if item_example(example)
        ),
    )


class Card(RenderedCard):
    """A rendered card plus Wikidata join/provenance metadata."""

    model_config = ConfigDict(frozen=True)

    pid: Pid
    retrieved_at: str | None
    sanitization: ProseSanitizationSummary = Field(default_factory=ProseSanitizationSummary)


def _source_identifiers(record: PropertyRecord) -> set[str]:
    """Collect every Wikidata key resolved while adapting this record."""
    identifiers = {
        record.pid,
        *record.p31,
        *record.ancestors,
        *record.constraints.subject_types,
        *record.constraints.value_types,
    }
    identifiers.update(
        identifier
        for identifier in (record.inverse_pid, record.constraints.inverse_pid)
        if identifier
    )
    identifiers.update(
        identifier
        for example in record.examples
        for identifier in (
            example.subject_qid,
            example.object_qid,
            example.subject_type,
            example.stratum,
        )
        if identifier
    )

    return identifiers


def _input_texts(card_input: RelationCardInput) -> Generator[str]:
    """Every string that can reach the rendered card text."""
    yield card_input.title
    if card_input.description:
        yield card_input.description
    yield from card_input.aliases
    for phrase in (
        card_input.inverse,
        *card_input.ancestors,
        *card_input.source_types,
        *card_input.target_types,
    ):
        if phrase is not None:
            yield phrase.label
            if phrase.description:
                yield phrase.description
    for example in card_input.examples:
        yield example.subject_label
        yield example.object_label
        if example.stratum_label:
            yield example.stratum_label
    if card_input.slug:
        yield card_input.slug


def _partition_candidate_tokens(
    card_input: RelationCardInput,
    labels: Mapping[EntityId, EntityLabel],
    known_identifiers: Collection[str],
) -> tuple[set[str], Counter[str]]:
    """Split surviving id-shaped tokens into (known, unknown-histogram).

    Sanitization clears known ids from prose, so a known survivor sits in
    a title or label, which is never rewritten; feeding those to the
    shared linter's ``forbidden_identifiers`` fails the card through the
    one existing lint path. Unknown tokens are not identifiers as far as
    the extraction is concerned: they stay in the text and are reported
    for triage.
    """
    known: set[str] = set()
    unknown: Counter[str] = Counter()
    for text in _input_texts(card_input):
        for token in _IDENTIFIER_TOKEN.findall(text):
            if token in labels or token in known_identifiers:
                known.add(token)
            else:
                unknown[token] += 1
    return known, unknown


def build_card(
    *,
    record: PropertyRecord,
    labels: Mapping[EntityId, EntityLabel],
    known_identifiers: Collection[str] = frozenset(),
    config: Config,
    counter: TokenCounter,
    splitter: SentenceSplitter,
) -> Card | None:
    """Adapt and render one property, or skip it when its title is absent.

    ``known_identifiers`` carries ids the extraction saw but did not
    resolve into ``labels`` (the exclusion table); together they are the
    membership universe sanitization and linting decide against.
    """
    sanitizations: list[ProseSanitization] = []
    card_input = make_card_input(
        record=record,
        labels=labels,
        known_identifiers=known_identifiers,
        language=config.extraction.primary_language,
        splitter=splitter,
        sanitizations=sanitizations,
    )
    if card_input is None:
        return None

    known_mentions, unknown_tokens = _partition_candidate_tokens(
        card_input, labels, known_identifiers
    )
    rendered = render_card(
        card_input,
        config=config.cards,
        counter=counter,
        splitter=splitter,
        forbidden_identifiers=_source_identifiers(record) | known_mentions,
    )

    return Card(
        pid=record.pid,
        retrieved_at=record.retrieved_at,
        contents=rendered.contents,
        card_text=rendered.card_text,
        card_hash=rendered.card_hash,
        token_count=rendered.token_count,
        truncations=rendered.truncations,
        severely_truncated=rendered.severely_truncated,
        sanitization=ProseSanitizationSummary.tally(sanitizations, unknown_tokens=unknown_tokens),
    )
