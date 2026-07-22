import pytest

from atlas_tools.relation.evaluation.modes.api import (
    FEW_SHOTS,
    HOLDOUTS,
    RETRY_INSTRUCTION,
    AssistantMessage,
    MalformedResponseError,
    PromptCard,
    PromptPack,
    SystemMessage,
    UserMessage,
    accepted_holdout_verdicts,
    build_repair_messages,
    parse_response,
)


def _prompt_cards() -> tuple[PromptCard, ...]:
    return tuple(
        PromptCard(
            relation_id=shot.relation_id,
            card_text=f"card text for {shot.relation_id}\n",
        )
        for shot in FEW_SHOTS
    )


def test_prompt_pack_has_the_golden_wire_hash_and_reusable_bundle_prefixes() -> None:
    pack = PromptPack.from_cards(reversed(_prompt_cards()))

    assert pack.content_hash == "090802f7243d95c35cb087a20031e2a25fac35fe9a0e2a57bcb0736b287e1259"
    assert len(pack.prefixes) == 9
    assert all(len(prefix) == 29 for prefix in pack.prefixes)

    prefix = pack.prefix("S2xF3")
    assert isinstance(prefix[0], SystemMessage)
    assert prefix[0].content.startswith("You are the placement editor")
    assert isinstance(prefix[1], UserMessage)
    assert prefix[1].content.startswith("Run the decision tests in order")
    assert "card text for wikidata:P22" in prefix[1].content
    assert prefix[2] == AssistantMessage(content=FEW_SHOTS[0].response)
    assert tuple(message.role for message in prefix) == (
        "system",
        *(("user", "assistant") * 14),
    )

    live = pack.live_messages(bundle="S2xF3", card_text="live relation card")
    assert live[:-1] == prefix
    assert live[-1] == UserMessage(
        content=(
            "Run the decision tests in order: same thing or distinct? if distinct,\n"
            "would nearness be expected or is the connection role-crossing or\n"
            "attribute-like? do any hedge words appear? Then give the verdict for\n"
            "this link type.\n\n"
            "live relation card"
        )
    )


def test_prompt_pack_rejects_missing_and_duplicate_demonstrations() -> None:
    cards = _prompt_cards()

    with pytest.raises(ValueError, match="lack fixed few-shot relations"):
        PromptPack.from_cards(cards[:-1])
    with pytest.raises(ValueError, match="repeat relation wikidata:P22"):
        PromptPack.from_cards((*cards, cards[0]))


def test_repair_messages_preserve_the_card_turn_and_append_fixed_correction() -> None:
    prompt = (SystemMessage(content="system"), UserMessage(content="card"))

    repaired = build_repair_messages(prompt, "not valid JSON")

    assert repaired == (
        *prompt,
        AssistantMessage(content="not valid JSON"),
        UserMessage(content=RETRY_INSTRUCTION),
    )
    with pytest.raises(ValueError, match="empty prompt"):
        build_repair_messages((), "bad")
    with pytest.raises(TypeError, match="must end in a user message"):
        build_repair_messages((AssistantMessage(content="bad"),), "bad again")


def test_response_parser_uses_the_last_object_and_enforces_the_exact_shape() -> None:
    completion = (
        'discard {"reason":"old","verdict":"overlay"}\n```json\n'
        '{"reason":"P1-P3 hold","verdict":"PROXIMAL"}\n```'
    )

    response = parse_response(completion)

    assert response.reason == "P1-P3 hold"
    assert response.verdict == "proximal"

    malformed = (
        "no object",
        '{"verdict":"overlay","reason":"wrong order"}',
        '{"reason":"extra","verdict":"overlay","confidence":1}',
        '{"reason":3,"verdict":"overlay"}',
        '{"reason":"unknown","verdict":"near"}',
    )
    for value in malformed:
        with pytest.raises(MalformedResponseError):
            parse_response(value)


def test_rubric_v1_anchors_keep_the_fixed_relations_and_contested_alternate() -> None:
    assert tuple(shot.relation_id for shot in FEW_SHOTS) == (
        "wikidata:P22",
        "wikidata:P462",
        "wikidata:P658",
        "wikidata:P913",
        "wikidata:P81",
        "wikidata:P734",
        "wikidata:P279",
        "wikidata:P2575",
        "wikidata:P460",
        "wikidata:P741",
        "wikidata:P1322",
        "wikidata:P1441",
        "wikidata:P708",
        "wikidata:P2959",
    )
    assert tuple((holdout.relation_id, holdout.verdict) for holdout in HOLDOUTS) == (
        ("wikidata:P6", "overlay"),
        ("wikidata:P47", "proximal"),
        ("wikidata:P2634", "overlay"),
        ("wikidata:P2739", "overlay"),
        ("wikidata:P1382", "proximal"),
        ("wikidata:P3403", "coincident"),
    )
    assert accepted_holdout_verdicts("wikidata:P3403") == frozenset({"coincident", "proximal"})
