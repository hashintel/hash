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
    build_card as build_wikidata_card,
)
from atlas_tools.relation_cards.wikidata.card import make_card_input
from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.model import (
    Constraints,
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

    assert make_card_input(record=record, labels=labels, language=EN) == canonical

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
