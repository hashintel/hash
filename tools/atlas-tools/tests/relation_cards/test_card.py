"""Canonical rendering, identifier linting, and adapter parity tests."""

import pytest
from pydantic_extra_types.language_code import LanguageAlpha2

from atlas_tools.relation_cards.common.card import (
    Card,
    IdentifierLeakError,
    build_card,
    lint_card_text,
)
from atlas_tools.relation_cards.common.config import CardsConfig
from atlas_tools.relation_cards.common.model import (
    PhraseInput,
    RelationCardInput,
    RelationConstraints,
    RelationExample,
)
from atlas_tools.relation_cards.common.sentence import NaiveSentenceSplitter
from atlas_tools.relation_cards.common.tokens import HeuristicTokenCounter
from atlas_tools.relation_cards.hash.adapter import build_relation_records
from atlas_tools.relation_cards.wikidata.card import (
    Card as WikidataCard,
)
from atlas_tools.relation_cards.wikidata.card import (
    ProseSanitization,
    make_card_input,
    sanitize_prose,
)
from atlas_tools.relation_cards.wikidata.card import (
    build_card as build_wikidata_card,
)
from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.model import (
    Constraints,
    EntityId,
    EntityLabel,
    Example,
    Pid,
    PropertyRecord,
    Qid,
)
from tests.relation_cards.hash.test_adapter import _fixture_types

EN = LanguageAlpha2("en")
BIG = 10_000_000


def _cards_config(token_budget: int = BIG, hard_token_budget: int = BIG) -> CardsConfig:
    return CardsConfig(
        tokenizer="heuristic",
        sentence_splitter="naive",
        token_budget=token_budget,
        hard_token_budget=hard_token_budget,
    )


def _render(card_input: RelationCardInput, config: CardsConfig | None = None) -> Card:
    return build_card(
        card_input,
        config=config or _cards_config(),
        counter=HeuristicTokenCounter(),
        splitter=NaiveSentenceSplitter(),
    )


def _canonical_input() -> RelationCardInput:
    return RelationCardInput(
        language=EN,
        title="part of",
        description="this item is a part of that item",
        aliases=("contained within", "component of"),
        inverse=PhraseInput(label="has part", description="this item has the listed part"),
        ancestors=(
            PhraseInput(
                label="broader relation",
                description="Lead ancestor sentence. Removable ancestor detail.",
            ),
        ),
        source_types=(
            PhraseInput(
                label="written work",
                description="Lead source sentence. Removable source detail.",
            ),
        ),
        target_types=(PhraseInput(label="creative work", description="a creative artifact"),),
        constraints=RelationConstraints(
            symmetric=False,
            transitive=True,
            single_value=False,
            distinct_values=False,
            direction="source -> target",
        ),
        examples=(
            RelationExample(
                subject_label="Chapter One",
                object_label="Synthetic Novel",
                stratum_label="written work",
            ),
            RelationExample(
                subject_label="Appendix",
                object_label="Field Guide",
                stratum_label="written work",
            ),
        ),
    )


def test_canonical_block_rendering_is_deterministic() -> None:
    first = _render(_canonical_input())
    second = _render(_canonical_input())

    assert first.card_text == second.card_text
    assert first.card_hash == second.card_hash
    assert first.card_text == (
        "Relation: part of\n"
        "Description: this item is a part of that item\n"
        "Aliases:\n"
        "  - contained within\n"
        "  - component of\n"
        "Inverse Name: has part (this item has the listed part)\n\n"
        "Ancestors:\n"
        "  - broader relation (Lead ancestor sentence. Removable ancestor detail.)\n\n"
        "Source types:\n"
        "  - written work (Lead source sentence. Removable source detail.)\n\n"
        "Target types:\n"
        "  - creative work (a creative artifact)\n\n"
        "Constraints:\n"
        "  - symmetric? no\n"
        "  - transitive? yes\n"
        "  - single value? no\n"
        "  - distinct values? no\n"
        "  - direction: source -> target\n\n"
        "Examples:\n"
        "  - written work: Chapter One -> Synthetic Novel\n"
        "  - written work: Appendix -> Field Guide\n\n"
        "Slug: part-of\n"
    )


def test_unavailable_constraint_facts_render_as_not_recorded() -> None:
    card_input = RelationCardInput(
        language=EN,
        title="related to",
        constraints=RelationConstraints(direction="source -> target"),
    )

    text = _render(card_input).card_text
    assert "Constraints:\n  - symmetric? not recorded\n" in text
    assert "  - transitive? not recorded\n" in text
    assert "  - single value? not recorded\n" in text
    assert "  - distinct values? not recorded\n" in text


def test_soft_truncation_uses_shared_structural_passes() -> None:
    card = _render(_canonical_input(), _cards_config(token_budget=1, hard_token_budget=BIG))

    assert "ancestor_details" in card.truncations
    assert "source_type_details" in card.truncations
    assert "Removable ancestor detail" not in card.card_text
    assert "Removable source detail" not in card.card_text
    assert card.card_text.count(" -> ") == 2  # direction plus one surviving example


@pytest.mark.parametrize(
    "leak",
    [
        "see https://example.com/types/entity-type/part-of/v/1",
        "database key 123e4567-e89b-12d3-a456-426614174000",
    ],
)
def test_identifier_linter_rejects_embedded_source_keys(leak: str) -> None:
    card_input = RelationCardInput(
        language=EN,
        title="related to",
        description=leak,
        constraints=RelationConstraints(direction="source -> target"),
    )

    with pytest.raises(IdentifierLeakError):
        _render(card_input)


def test_identifier_linter_allows_similar_ordinary_prose() -> None:
    card_input = RelationCardInput(
        language=EN,
        title="P2P relation",
        description="The Audi Q5 and release 123e4567-e89b are ordinary prose.",
        constraints=RelationConstraints(direction="source -> target"),
    )

    assert _render(card_input).card_text.startswith("Relation: P2P relation\n")


def test_identifier_linter_rejects_adapter_supplied_source_identifier() -> None:
    with pytest.raises(IdentifierLeakError, match="P361"):
        lint_card_text(
            "Relation: source property P361\n",
            forbidden_identifiers={"P361"},
        )


# --- Wikidata prose sanitization ----------------------------------------------
#
# Wikidata property descriptions cross-reference other properties by PID
# ("use P276 for ..."). The adapter must rewrite those meaning-preservingly:
# deleting just the token leaves nonsense, and leaving it ships the exact
# source watermark the identifier-free contract forbids. Detection is by
# membership in the extraction's known-identifier universe, never by token
# shape alone. The prose below is taken from the live P17 ("country") card
# that first tripped the linter.

_PROSE_LABELS: dict[EntityId, EntityLabel] = {
    Pid("P131"): EntityLabel(label="located in the administrative territorial entity"),
    Pid("P276"): EntityLabel(label="location"),
    Pid("P527"): EntityLabel(label="has part"),
    Pid("P706"): EntityLabel(label="located in/on physical feature"),
    Pid("P2670"): EntityLabel(label="has parts of the class"),
    # Known but unlabeled: a reference the extraction saw and could not
    # resolve to a title.
    Pid("P1382"): EntityLabel(),
}


def _sanitize(text: str, known_identifiers: frozenset[str] = frozenset()) -> ProseSanitization:
    return sanitize_prose(
        text,
        labels=_PROSE_LABELS,
        known_identifiers=known_identifiers,
        language=EN,
        splitter=NaiveSentenceSplitter(),
    )


def test_sanitize_substitutes_resolvable_references_with_quoted_labels() -> None:
    result = _sanitize(
        "location of the object; use P131 to indicate the containing"
        " administrative entity, or P706 for geographic entities"
    )
    assert result.text == (
        'location of the object; use "located in the administrative territorial'
        ' entity" to indicate the containing administrative entity,'
        ' or "located in/on physical feature" for geographic entities'
    )
    assert result.substitutions == 2
    assert result.dropped_sentences == 0


def test_sanitize_deletes_identifiers_that_repeat_the_preceding_label() -> None:
    # The nested parenthetical from Wikidata's "part of" description.
    result = _sanitize(
        'inverse property of "has part" (P527, see also "has parts of the class" (P2670))'
    )
    assert result.text == 'inverse property of "has part" (see also "has parts of the class")'
    assert result.redundant_removals == 2


def test_sanitize_drops_sentences_with_known_unlabeled_identifiers() -> None:
    # P1382 is in the known universe but has no label to substitute:
    # confirmed cross-reference, unrenderable, so its sentence goes.
    result = _sanitize(
        "the item is located on the territory of the following administrative"
        " entity. Use P1382 if the item falls only partially into it."
    )
    assert result.text == (
        "the item is located on the territory of the following administrative entity."
    )
    assert result.dropped_sentences == 1
    assert result.dropped_tokens == ("P1382",)


def test_sanitize_drops_sentences_for_excluded_property_mentions() -> None:
    # An external-ID property is never in the labels map, but the
    # extraction's exclusion table still confirms it as an identifier.
    result = _sanitize("See P212 for the ISBN form.", known_identifiers=frozenset({"P212"}))
    assert result.text is None
    assert result.dropped_tokens == ("P212",)


def test_sanitize_returns_none_when_nothing_survives() -> None:
    assert _sanitize("Use P1382 if the item falls only partially into it.").text is None


def test_sanitize_never_guesses_on_unknown_tokens() -> None:
    # "P450" is id-shaped but outside the known universe: real-world
    # prose, not a cross-reference. It must survive byte-identically
    # rather than be dropped (or worse, substituted) on a guess.
    prose = "inhibits cytochrome P450 enzymes. Reported for Q1 of the year."
    result = _sanitize(prose)
    assert result.text == prose
    assert result.dropped_sentences == 0
    assert result.dropped_tokens == ()


def test_sanitize_leaves_identifier_free_prose_byte_identical() -> None:
    prose = "sovereign state that this subject item is in  (two spaces kept)"
    assert _sanitize(prose).text == prose


def test_adapter_sanitizes_descriptions_and_drops_identifier_aliases() -> None:
    record = PropertyRecord(
        pid=Pid("P17"),
        datatype="wikibase-item",
        labels={EN: "country"},
        descriptions={EN: "sovereign state; use P276 for events"},
        aliases={EN: ["sovereign state", "see P1382"]},
        ancestors=(Pid("P131"),),
    )
    labels: dict[EntityId, EntityLabel] = dict(_PROSE_LABELS)
    labels[Pid("P131")] = EntityLabel(
        label="located in the administrative territorial entity",
        description="the containing administrative entity. Use P276 for events.",
    )

    card_input = make_card_input(
        record=record, labels=labels, language=EN, splitter=NaiveSentenceSplitter()
    )
    assert card_input is not None
    assert card_input.description == 'sovereign state; use "location" for events'
    assert card_input.aliases == ("sovereign state",)  # unresolvable alias dropped
    (ancestor,) = card_input.ancestors
    assert (
        ancestor.description == 'the containing administrative entity. Use "location" for events.'
    )


def test_adapter_skips_examples_with_non_item_endpoints() -> None:
    record = PropertyRecord(
        pid=Pid("P17"),
        datatype="wikibase-item",
        labels={EN: "country"},
        examples=[
            Example(
                subject_qid="P8919",  # external-ID property page, not an item
                object_qid="Q30",
                subject_label="AllSides ID",
                object_label="United States",
                subject_type="",
            ),
            Example(
                subject_qid="Q64",
                object_qid="Q183",
                subject_label="Berlin",
                object_label="Germany",
                subject_type="Q515",
            ),
        ],
    )

    card_input = make_card_input(
        record=record, labels={}, language=EN, splitter=NaiveSentenceSplitter()
    )
    assert card_input is not None
    (example,) = card_input.examples
    assert example.subject_label == "Berlin"


def _inhibits_record() -> PropertyRecord:
    return PropertyRecord(
        pid=Pid("P9999"),
        datatype="wikibase-item",
        labels={EN: "inhibits"},
        constraints=Constraints(subject_types=(Qid("Q1"),)),
    )


def _build_inhibits_card(labels: dict[EntityId, EntityLabel]) -> WikidataCard | None:
    return build_wikidata_card(
        record=_inhibits_record(),
        labels=labels,
        config=Config(extraction={"languages": ["en"]}, cards=_cards_config()),
        counter=HeuristicTokenCounter(),
        splitter=NaiveSentenceSplitter(),
    )


def test_known_identifier_in_a_label_fails_through_the_shared_linter() -> None:
    # Sanitization rewrites prose, never labels. A *known* id surviving in
    # a label is fed to the shared linter's forbidden_identifiers, so the
    # one existing lint path rejects the card.
    labels: dict[EntityId, EntityLabel] = {
        Qid("Q1"): EntityLabel(label="subtype of P276 locations"),
        Pid("P276"): EntityLabel(label="location"),
    }

    with pytest.raises(IdentifierLeakError, match="P276"):
        _build_inhibits_card(labels)


def test_unknown_id_shaped_label_ships_and_is_reported() -> None:
    # "P450" is outside the known universe: prose, not an identifier.
    # The card builds; the token is histogrammed for triage instead of
    # destroyed or aborted on a guess.
    labels: dict[EntityId, EntityLabel] = {
        Qid("Q1"): EntityLabel(label="cytochrome P450 inhibitor")
    }

    card = _build_inhibits_card(labels)
    assert card is not None
    assert "cytochrome P450 inhibitor" in card.card_text
    assert card.sanitization.unknown_tokens == {"P450": 1}


def test_wikidata_adapter_has_byte_parity_with_canonical_input() -> None:
    record = PropertyRecord(
        pid=Pid("P361"),
        datatype="wikibase-item",
        labels={EN: "part of"},
        descriptions={EN: "this item is a part of that item"},
        aliases={EN: ["contained within", "component of"]},
        inverse_pid=Pid("P527"),
        ancestors=(Pid("P1000"),),
        constraints=Constraints(
            transitive=True,
            subject_types=(Qid("Q1"),),
            value_types=(Qid("Q2"),),
        ),
        examples=[
            Example(
                subject_label="Chapter One",
                object_label="Synthetic Novel",
                subject_type="Q1",
                stratum=Qid("Q1"),
            ),
            Example(
                subject_label="Appendix",
                object_label="Field Guide",
                subject_type="Q1",
                stratum=Qid("Q1"),
            ),
        ],
        retrieved_at="2025-06-01T00:00:00+00:00",
    )
    labels = {
        Pid("P527"): EntityLabel(
            label="has part",
            description="this item has the listed part",
        ),
        Pid("P1000"): EntityLabel(
            label="broader relation",
            description="Lead ancestor sentence. Removable ancestor detail.",
        ),
        Qid("Q1"): EntityLabel(
            label="written work",
            description="Lead source sentence. Removable source detail.",
        ),
        Qid("Q2"): EntityLabel(label="creative work", description="a creative artifact"),
    }
    canonical = _canonical_input()

    assert (
        make_card_input(record=record, labels=labels, language=EN, splitter=NaiveSentenceSplitter())
        == canonical
    )

    direct = _render(canonical)
    wikidata_config = Config(
        extraction={"languages": ["en"]},
        cards=_cards_config(),
    )
    adapted = build_wikidata_card(
        record=record,
        labels=labels,
        config=wikidata_config,
        counter=HeuristicTokenCounter(),
        splitter=NaiveSentenceSplitter(),
    )
    assert adapted is not None
    assert adapted.card_text == direct.card_text
    assert adapted.card_hash == direct.card_hash


def test_hash_and_wikidata_adapters_have_canonical_format_parity() -> None:
    hash_record = next(
        record
        for record in build_relation_records(_fixture_types(), [], example_count=2)
        if record.card_input.title == "Owns"
    )
    wikidata_record = PropertyRecord(
        pid=Pid("P1"),
        datatype="wikibase-item",
        labels={EN: "Owns"},
        descriptions={EN: "Possession from an owner to an asset."},
        inverse_pid=Pid("P2"),
        ancestors=(Pid("P3"),),
        constraints=Constraints(
            single_value=True,
            subject_types=(Qid("Q1"),),
            value_types=(Qid("Q2"),),
        ),
    )
    wikidata_input = make_card_input(
        record=wikidata_record,
        splitter=NaiveSentenceSplitter(),
        labels={
            Pid("P2"): EntityLabel(label="Owned By"),
            Pid("P3"): EntityLabel(label="Link", description="A generic connection."),
            Qid("Q1"): EntityLabel(label="Person", description="A human being."),
            Qid("Q2"): EntityLabel(
                label="Asset",
                description="Something that can be owned.",
            ),
        },
        language=EN,
    )
    assert wikidata_input is not None

    hash_text = _render(hash_record.card_input).card_text
    wikidata_text = _render(wikidata_input).card_text
    for flag in ("symmetric", "transitive", "distinct values"):
        hash_text = hash_text.replace(f"{flag}? not recorded", f"{flag}? no")

    assert hash_text == wikidata_text
