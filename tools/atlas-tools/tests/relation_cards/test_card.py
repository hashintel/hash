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


def test_sanitize_handles_slash_separated_cross_reference_lists() -> None:
    # P6978 ("Scandinavian middle family name") live-hit: its description
    # says 'use P734/P1950'. A "/" before another identifier is a
    # cross-reference list, not Hermann-Mauguin notation, so both ids must
    # tokenize and resolve -- the P690 slash fix must not swallow them.
    labels: dict[EntityId, EntityLabel] = {
        Pid("P734"): EntityLabel(label="family name"),
        Pid("P1950"): EntityLabel(label="second family name in Spanish name"),
    }
    result = sanitize_prose(
        "for Spanish names, use P734/P1950",
        labels=labels,
        language=EN,
        splitter=NaiveSentenceSplitter(),
    )
    assert result.text == (
        'for Spanish names, use "family name"/"second family name in Spanish name"'
    )
    assert result.substitutions == 2
    assert "P734" not in (result.text or "")
    assert "P1950" not in (result.text or "")


def test_sanitize_leaves_hermann_mauguin_notation_untouched() -> None:
    # The other side of the same boundary: "/" + lowercase is a space-group
    # name, not a reference. It must not tokenize even when its fragment
    # collides with a real property (P6 = head of government, P2 = ...).
    labels: dict[EntityId, EntityLabel] = {
        Pid("P6"): EntityLabel(label="head of government"),
        Pid("P2"): EntityLabel(label="head of state"),
    }
    result = sanitize_prose(
        "crystallizes in P6/mmm and P2\u2081/n forms",
        labels=labels,
        language=EN,
        splitter=NaiveSentenceSplitter(),
    )
    assert result.text == "crystallizes in P6/mmm and P2\u2081/n forms"
    assert result.substitutions == 0
    assert result.dropped_sentences == 0


def test_sanitize_strips_urls_keeping_the_surrounding_gloss() -> None:
    # P1060's live shape: a trailing link-out to a source ontology. The
    # URL is deleted (not sentence-dropped: it is trailing provenance),
    # the gloss survives, and the removal is reported.
    url = "http://purl.obolibrary.org/obo/RO_0002451"
    result = _sanitize(
        f'process by which a pathogen is transmitted, equivalent to "transmitted by" in {url}'
    )
    assert result.text == (
        'process by which a pathogen is transmitted, equivalent to "transmitted by" in'
    )
    assert result.removed_urls == (url,)


def test_sanitize_strips_urls_before_identifier_substitution() -> None:
    # A Wikidata entity URL embeds a QID; stripping the URL first stops
    # the identifier pass from rewriting "Q42" inside the link into a label.
    labels: dict[EntityId, EntityLabel] = {Qid("Q42"): EntityLabel(label="Douglas Adams")}
    result = sanitize_prose(
        "see http://www.wikidata.org/entity/Q42 for details",
        labels=labels,
        language=EN,
        splitter=NaiveSentenceSplitter(),
    )
    assert result.text == "see for details"
    assert result.substitutions == 0
    assert result.removed_urls == ("http://www.wikidata.org/entity/Q42",)
    assert "Douglas Adams" not in (result.text or "")


def test_sanitize_repairs_punctuation_after_a_mid_sentence_url() -> None:
    result = _sanitize("defined at https://example.org/spec. It applies broadly.")
    assert result.text == "defined at. It applies broadly."
    assert result.removed_urls == ("https://example.org/spec",)


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


def test_record_local_identifier_in_a_label_fails_through_the_shared_linter() -> None:
    # Sanitization rewrites prose, never labels. The record's *own*
    # resolved ids are the lint-fatal set: one of them surviving in a
    # label means this record's rendering leaked something it resolved.
    record = _inhibits_record().model_copy(update={"ancestors": (Pid("P276"),)})
    labels: dict[EntityId, EntityLabel] = {
        Qid("Q1"): EntityLabel(label="subtype of P276 locations"),
        Pid("P276"): EntityLabel(label="location"),
    }

    with pytest.raises(IdentifierLeakError, match="P276"):
        build_wikidata_card(
            record=record,
            labels=labels,
            config=Config(extraction={"languages": ["en"]}, cards=_cards_config()),
            counter=HeuristicTokenCounter(),
            splitter=NaiveSentenceSplitter(),
        )


def test_globally_known_id_inside_a_name_ships_and_is_reported() -> None:
    # An id-shaped fragment inside an entity's *name* is part of the name,
    # not a reference: it ships and is histogrammed for triage. Only
    # record-local ids are fatal.
    labels: dict[EntityId, EntityLabel] = {
        Qid("Q1"): EntityLabel(label="subtype of P276 locations"),
        Pid("P276"): EntityLabel(label="location"),
    }

    card = _build_inhibits_card(labels)
    assert card is not None
    assert "subtype of P276 locations" in card.card_text
    assert card.sanitization.known_tokens_retained == {"P276": 1}


def test_notation_like_names_never_tokenize_or_corrupt() -> None:
    # Live regression (P690 "space group"): Hermann-Mauguin names such as
    # "P6\u2083/mmc" and "P2\u2081/n" embed fragments that collide with real
    # property ids (P6 = head of government). A trailing "/" or subscript
    # digit disqualifies the token, so the names render untouched, the
    # linter stays quiet, and prose mentioning the notation is not
    # "substituted" into nonsense.
    record = PropertyRecord(
        pid=Pid("P690"),
        datatype="wikibase-item",
        labels={EN: "space group"},
        descriptions={EN: "symmetry classification such as P6/mmm for crystals"},
        constraints=Constraints(value_types=(Qid("Q899033"),)),
        examples=[
            Example(
                subject_qid="Q83180",
                object_qid="Q13365573",
                subject_label="albite",
                object_label="space group P2\u2081/n",
                subject_type="",
            ),
        ],
    )
    labels: dict[EntityId, EntityLabel] = {
        Pid("P6"): EntityLabel(label="head of government"),
        Pid("P2"): EntityLabel(label="head of state"),
        Qid("Q899033"): EntityLabel(label="space group P6\u2083/mmc"),
    }

    card = build_wikidata_card(
        record=record,
        labels=labels,
        config=Config(extraction={"languages": ["en"]}, cards=_cards_config()),
        counter=HeuristicTokenCounter(),
        splitter=NaiveSentenceSplitter(),
    )
    assert card is not None
    assert "P6/mmm" in card.card_text  # prose notation untouched
    assert "space group P2\u2081/n" in card.card_text
    assert "space group P6\u2083/mmc" in card.card_text
    assert "head of government" not in card.card_text  # no corrupt substitution
    assert card.sanitization.substituted_tokens == {}
    assert card.sanitization.known_tokens_retained == {}
    assert card.sanitization.unknown_tokens == {}


def test_record_example_labels_resolve_ids_the_linter_would_forbid() -> None:
    # Live regression: P517 ("interaction") describes itself as "strong
    # (Q11415), ..., weak (Q11418)", and those QIDs are the record's own
    # example objects, so the linter forbids them. The example rows carry
    # their display labels, so the mentions are substitutable rather than
    # fatal: the sanitizer's universe must cover the linter's forbidden set.
    record = PropertyRecord(
        pid=Pid("P517"),
        datatype="wikibase-item",
        labels={EN: "interaction"},
        descriptions={
            EN: "subset of the fundamental forces (strong (Q11415), weak"
            " (Q11418)) with which a particle interacts"
        },
        examples=[
            Example(
                subject_qid="Q2225",
                object_qid="Q11418",
                subject_label="electron",
                object_label="weak interaction",
                subject_type="",
            ),
            Example(
                subject_qid="Q6718",
                object_qid="Q11415",
                subject_label="quark",
                object_label="strong interaction",
                subject_type="",
            ),
        ],
    )

    card = build_wikidata_card(
        record=record,
        labels={},
        config=Config(extraction={"languages": ["en"]}, cards=_cards_config()),
        counter=HeuristicTokenCounter(),
        splitter=NaiveSentenceSplitter(),
    )
    assert card is not None
    assert "Q11418" not in card.card_text
    assert "Q11415" not in card.card_text
    assert (
        'Description: subset of the fundamental forces (strong ("strong interaction"),'
        ' weak ("weak interaction")) with which a particle interacts' in card.card_text
    )
    assert card.sanitization.substitutions == 2
    assert card.sanitization.dropped_sentences == 0


def test_record_local_ancestor_in_slash_list_does_not_reach_the_linter() -> None:
    # The exact P6978 failure path: a record-local ancestor (P734, the
    # subproperty-of target) mentioned as "P734/P1950" in the description.
    # It must be substituted before the linter's forbidden set (which is
    # the record's own ids) ever sees it.
    record = PropertyRecord(
        pid=Pid("P6978"),
        datatype="wikibase-item",
        labels={EN: "Scandinavian middle family name"},
        descriptions={EN: "a middle family name; for Spanish names, use P734/P1950"},
        ancestors=(Pid("P734"),),
    )
    labels: dict[EntityId, EntityLabel] = {
        Pid("P734"): EntityLabel(label="family name"),
        Pid("P1950"): EntityLabel(label="second family name in Spanish name"),
    }

    card = build_wikidata_card(
        record=record,
        labels=labels,
        config=Config(extraction={"languages": ["en"]}, cards=_cards_config()),
        counter=HeuristicTokenCounter(),
        splitter=NaiveSentenceSplitter(),
    )
    assert card is not None
    assert "P734" not in card.card_text
    assert "P1950" not in card.card_text
    assert '"family name"' in card.card_text


def test_placeholder_labels_are_treated_as_absent() -> None:
    # Bot-imported labels that literally read "Q9000" carry no words:
    # rendering one would expose only an identifier. Phrases skip, examples
    # drop, and strata render bare.
    record = PropertyRecord(
        pid=Pid("P17"),
        datatype="wikibase-item",
        labels={EN: "country"},
        constraints=Constraints(subject_types=(Qid("Q9000"),)),
        examples=[
            Example(
                subject_qid="Q77",
                object_qid="Q30",
                subject_label="Q77",  # placeholder
                object_label="United States",
                subject_type="",
            ),
            Example(
                subject_qid="Q64",
                object_qid="Q183",
                subject_label="Berlin",
                object_label="Germany",
                subject_type="Q515",
                stratum=Qid("Q9000"),
            ),
        ],
    )
    labels: dict[EntityId, EntityLabel] = {Qid("Q9000"): EntityLabel(label="Q9000")}

    card_input = make_card_input(
        record=record, labels=labels, language=EN, splitter=NaiveSentenceSplitter()
    )
    assert card_input is not None
    assert card_input.source_types == ()  # placeholder-labeled phrase skipped
    (example,) = card_input.examples  # placeholder-labeled example dropped
    assert example.subject_label == "Berlin"
    assert example.stratum_label is None  # placeholder stratum renders bare


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
        ancestors=(),
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
