"""Canonical rendering tests for source-attached endpoint constraints."""

import pytest
from pydantic_extra_types.language_code import LanguageAlpha2

from atlas_tools.relation_cards.common.api import (
    EndpointTypeConstraint,
    PhraseInput,
    RelationCardInput,
    RelationConstraints,
)
from atlas_tools.relation_cards.common.card import build_card
from atlas_tools.relation_cards.common.config import CardsConfig
from atlas_tools.relation_cards.common.sentence import NaiveSentenceSplitter
from atlas_tools.relation_cards.common.tokens import HeuristicTokenCounter

_ENGLISH = LanguageAlpha2("en")
_BIG = 10_000_000


def _input() -> RelationCardInput:
    return RelationCardInput(
        language=_ENGLISH,
        title="owns",
        endpoint_constraints=(
            EndpointTypeConstraint(
                source_type=PhraseInput(
                    label="Organization",
                    description="A formal group. Additional source detail.",
                ),
                target_types=(
                    PhraseInput(
                        label="Subsidiary",
                        description="A controlled company. Additional target detail.",
                    ),
                    PhraseInput(label="Office"),
                ),
                minimum_targets=1,
                maximum_targets=2,
            ),
            EndpointTypeConstraint(
                source_type=PhraseInput(label="Person"),
                target_types=(PhraseInput(label="Asset"),),
                maximum_targets=1,
            ),
        ),
        constraints=RelationConstraints(
            single_value=False,
            direction="source -> target",
        ),
    )


def _render(card_input: RelationCardInput, *, token_budget: int = _BIG) -> tuple[str, list[str]]:
    card = build_card(
        card_input,
        config=CardsConfig(
            tokenizer="heuristic",
            sentence_splitter="naive",
            token_budget=token_budget,
            hard_token_budget=_BIG,
        ),
        counter=HeuristicTokenCounter(),
        splitter=NaiveSentenceSplitter(),
    )
    return card.card_text, card.truncations


def test_endpoint_constraints_preserve_source_target_associations() -> None:
    text, _truncations = _render(_input())

    assert "Source types:" not in text
    assert "Target types:" not in text
    assert "Endpoint constraints:" in text
    assert (
        "  - Organization (A formal group. Additional source detail.) -> "
        "one of: Subsidiary (A controlled company. Additional target detail.) | Office "
        "[targets per source: 1..2]\n"
    ) in text
    assert "  - Person -> Asset [targets per source: <= 1]\n" in text
    assert "Organization -> Asset" not in text
    assert "Person -> Subsidiary" not in text


def test_endpoint_description_details_are_truncated_without_losing_pairs() -> None:
    text, truncations = _render(_input(), token_budget=1)

    assert "endpoint_type_details" in truncations
    assert "Additional source detail" not in text
    assert "Additional target detail" not in text
    assert "Organization (A formal group.) ->" in text
    assert "Subsidiary (A controlled company.)" in text
    assert "Person -> Asset" in text


def test_single_simple_pair_keeps_the_legacy_unambiguous_sections() -> None:
    card_input = RelationCardInput(
        language=_ENGLISH,
        title="owns",
        endpoint_constraints=(
            EndpointTypeConstraint(
                source_type=PhraseInput(label="Person"),
                target_types=(PhraseInput(label="Asset"),),
                maximum_targets=1,
            ),
        ),
        constraints=RelationConstraints(single_value=True, direction="source -> target"),
    )

    text, _truncations = _render(card_input)
    assert "Endpoint constraints:" not in text
    assert "Source types:\n  - Person\n" in text
    assert "Target types:\n  - Asset\n" in text


def test_endpoint_cardinality_rejects_an_inverted_range() -> None:
    with pytest.raises(ValueError, match="minimum_targets"):
        EndpointTypeConstraint(
            source_type=PhraseInput(label="Person"),
            minimum_targets=2,
            maximum_targets=1,
        )
