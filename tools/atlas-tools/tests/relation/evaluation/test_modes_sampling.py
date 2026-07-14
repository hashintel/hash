import pytest

from atlas_tools.common import sha256_bytes
from atlas_tools.relation.evaluation.domain.api import SliceSamplingConfig
from atlas_tools.relation.evaluation.modes.api import (
    HOLDOUTS,
    SamplingCard,
    derive_pilot_slice,
)

CARDS_HASH = sha256_bytes(b"fixture deck")


def _card(
    relation_id: str,
    *,
    producer: str,
    token_count: int,
    prescreen: str = "ordinary",
    pilot_strata: tuple[str, ...] = (),
) -> SamplingCard:
    return SamplingCard(
        relation_id=relation_id,
        producer=producer,
        card_hash=sha256_bytes(f"card:{relation_id}".encode()),
        token_count=token_count,
        prescreen_stratum=prescreen,
        pilot_strata=pilot_strata,
    )


def _deck() -> tuple[SamplingCard, ...]:
    holdouts = tuple(
        _card(
            holdout.relation_id,
            producer="wikidata",
            token_count=10 + index,
            prescreen="anchor",
        )
        for index, holdout in enumerate(HOLDOUTS)
    )
    return (
        *holdouts,
        _card("wikidata:P22", producer="wikidata", token_count=1),
        _card("test:A", producer="test", token_count=20),
        _card(
            "test:B",
            producer="test",
            token_count=21,
            pilot_strata=("rare", "rare"),
        ),
        _card("other:C", producer="other", token_count=22),
        _card("other:D", producer="other", token_count=23, prescreen="severe"),
        _card("test:E", producer="test", token_count=24),
        _card("other:F", producer="other", token_count=25, pilot_strata=("rare",)),
    )


def test_stratified_sampling_matches_golden_selection_and_hashes() -> None:
    config = SliceSamplingConfig(seed=17, non_holdout_count=3)

    selected = derive_pilot_slice(reversed(_deck()), cards_hash=CARDS_HASH, config=config)
    replay = derive_pilot_slice(_deck(), cards_hash=CARDS_HASH, config=config)

    assert selected == replay
    assert selected.derivation.sampling_config_hash == (
        "14a90fad07292d4a75aecee856d31e0b618af00d3078c2db23e013cde25a5410"
    )
    assert selected.derivation.selection_hash == (
        "b1cd7319fc97d86bed127c27909386f79ec754813440efa60ec237c3cd772c98"
    )
    assert tuple((row.relation_id, row.selection_key) for row in selected.rows) == (
        (
            "other:C",
            "ac36e4fe20383db690853ea1f459ad6f581f1e657f644463388225e8cc020a85",
        ),
        (
            "other:D",
            "1bd2d3de85732d7600217ec8b297cf34b8f3556adeb31c130660a26b0ac15950",
        ),
        (
            "other:F",
            "e914fafee07b3e51c775c71f85b6de08e930f9bce3c1a2c0bdc6839faece0317",
        ),
        (
            "wikidata:P1382",
            "63bcf666ff89e3e9c98a0d48de60ae74d09595c96737947aa7af17ca6367d136",
        ),
        (
            "wikidata:P2634",
            "9f0e69678d109f304b195d6d00a866f2c7809b081e7a0820d5b7cac1480647ff",
        ),
        (
            "wikidata:P2739",
            "aa73b8b4aabf54c0270b8c289646d6d7063acc97468e833b980f4d6a6fda7182",
        ),
        (
            "wikidata:P3403",
            "d06294d25a4c2a89a897468526f4622f5bddaf68c482f20d6ba7c349be27f935",
        ),
        (
            "wikidata:P47",
            "539a2d6c5705266580ba75934fe3e1465f44d45941c665d1fe4a2991c6ccfbd6",
        ),
        (
            "wikidata:P6",
            "4e8550c96f3b41aba7c23af30ee98ef6ea0e87b182007fc034c8f5a710616835",
        ),
    )
    assert selected.derivation.eligible_non_holdouts == 6
    assert selected.derivation.selected_non_holdouts == 3
    assert all(row.relation_id != "wikidata:P22" for row in selected.rows)
    assert sum(row.is_holdout for row in selected.rows) == 6


def test_sampling_fails_closed_on_duplicate_relations_and_missing_holdouts() -> None:
    config = SliceSamplingConfig(seed=17, non_holdout_count=3)
    deck = _deck()

    with pytest.raises(ValueError, match="repeat relation test:A"):
        derive_pilot_slice((*deck, deck[-6]), cards_hash=CARDS_HASH, config=config)
    with pytest.raises(ValueError, match=r"lack fixed holdout relations.*P3403"):
        derive_pilot_slice(
            tuple(card for card in deck if card.relation_id != "wikidata:P3403"),
            cards_hash=CARDS_HASH,
            config=config,
        )
