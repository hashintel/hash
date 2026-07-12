"""Adapt Wikidata property records to the canonical relation-card renderer."""

import re
from collections.abc import Mapping

from pydantic import ConfigDict
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
    Pid,
    PropertyRecord,
    Qid,
)


def _collapse_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip())


def _phrase_input(
    entity_id: EntityId,
    labels: Mapping[EntityId, EntityLabel],
) -> PhraseInput | None:
    entry = labels.get(entity_id, EntityLabel())
    if not _collapse_whitespace(entry.label):
        # An unlabeled reference would expose only its source identifier.
        return None
    return PhraseInput(label=entry.label, description=entry.description or None)


def make_card_input(
    *,
    record: PropertyRecord,
    labels: Mapping[EntityId, EntityLabel],
    language: LanguageAlpha2,
) -> RelationCardInput | None:
    """Resolve a Wikidata record into identifier-free canonical card input."""
    title = record.labels.get(language)
    if title is None:
        return None

    def phrase(entity_id: EntityId) -> PhraseInput | None:
        return _phrase_input(entity_id, labels)

    def stratum_label(stratum: Qid | None) -> str | None:
        if stratum is None:
            return None
        return _collapse_whitespace(labels.get(stratum, EntityLabel()).label) or None

    constraints = record.constraints
    return RelationCardInput(
        language=language,
        title=title,
        description=record.descriptions.get(language),
        aliases=tuple(record.aliases.get(language, [])),
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
        ),
    )


class Card(RenderedCard):
    """A rendered card plus Wikidata join/provenance metadata."""

    model_config = ConfigDict(frozen=True)

    pid: Pid
    retrieved_at: str | None


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


def build_card(
    *,
    record: PropertyRecord,
    labels: Mapping[EntityId, EntityLabel],
    config: Config,
    counter: TokenCounter,
    splitter: SentenceSplitter,
) -> Card | None:
    """Adapt and render one property, or skip it when its title is absent."""
    card_input = make_card_input(
        record=record,
        labels=labels,
        language=config.extraction.primary_language,
    )
    if card_input is None:
        return None

    rendered = render_card(
        card_input,
        config=config.cards,
        counter=counter,
        splitter=splitter,
        forbidden_identifiers=_source_identifiers(record),
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
    )
