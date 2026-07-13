import asyncio

import pytest
from openrouter.components import (
    ChatAssistantMessage,
    ChatMessages,
    ChatSystemMessage,
    ChatUserMessage,
)

from atlas_tools.relation.eval.prompt import (
    FEW_SHOT,
    RETRY_INSTRUCTION,
    MalformedResponseError,
    Response,
    build_retry_prompt,
    parse_response,
    request_judgement,
)


def test_parse_response_accepts_exact_object_and_case_folds_verdict() -> None:
    response = parse_response('{"reason": "P1-P3 hold", "verdict": "PrOxImAl"}')

    assert response == Response(reason="P1-P3 hold", verdict="proximal")


def test_parse_response_extracts_last_object_from_fenced_completion() -> None:
    response = parse_response(
        "A discarded draft:\n"
        '{"reason": "fails P2", "verdict": "overlay"}\n'
        "```json\n"
        '{"reason": "U1 applies", "verdict": "unclear"}\n'
        "```\n"
    )

    assert response == Response(reason="U1 applies", verdict="unclear")


@pytest.mark.parametrize(
    "completion",
    [
        "no object here",
        '{"reason": "fails P2", "verdict": "overlay",}',
        '{"verdict": "overlay", "reason": "fails P2"}',
        '{"reason": "fails P2"}',
        '{"reason": "fails P2", "verdict": "overlay", "extra": true}',
        '{"reason": 3, "verdict": "overlay"}',
        '{"reason": "indecisive", "verdict": "uncertain"}',
        '{"reason": "indecisive", "verdict": "other"}',
        '{"wrapper": {"reason": "fails P2", "verdict": "overlay"}}',
    ],
)
def test_parse_response_rejects_malformed_votes(completion: str) -> None:
    with pytest.raises(MalformedResponseError):
        parse_response(completion)


def test_every_few_shot_response_matches_the_parser_contract() -> None:
    assert len(FEW_SHOT) == 14
    assert all(relation_id.startswith("wikidata:P") for relation_id, _ in FEW_SHOT)

    responses = {relation_id: parse_response(completion) for relation_id, completion in FEW_SHOT}
    assert responses["wikidata:P1441"].verdict == "unclear"
    assert responses["wikidata:P1441"].reason.startswith("U1:")


def test_request_judgement_retries_malformed_completion_once() -> None:
    messages: list[ChatMessages] = [ChatUserMessage(role="user", content="card")]
    completions = iter(
        [
            "not JSON",
            '{"reason": "P1-P3 hold", "verdict": "proximal"}',
        ]
    )
    attempts: list[list[ChatMessages]] = []

    async def send(attempt: list[ChatMessages]) -> str:
        attempts.append(attempt)
        return next(completions)

    response = asyncio.run(request_judgement(messages, send))

    assert response == Response(reason="P1-P3 hold", verdict="proximal")
    assert attempts == [
        messages,
        [
            *messages,
            ChatAssistantMessage(role="assistant", content="not JSON"),
            ChatUserMessage(role="user", content="Reply with only the JSON object."),
        ],
    ]


def test_request_judgement_abstains_after_second_malformed_completion() -> None:
    messages: list[ChatMessages] = [ChatUserMessage(role="user", content="card")]
    attempts = 0

    async def send(_: list[ChatMessages]) -> str:
        nonlocal attempts
        attempts += 1
        return "still not JSON"

    response = asyncio.run(request_judgement(messages, send))

    assert response is None
    assert attempts == 2


def test_request_judgement_does_not_retry_valid_but_incorrect_verdict() -> None:
    messages: list[ChatMessages] = [ChatUserMessage(role="user", content="holdout card")]
    attempts = 0

    async def send(_: list[ChatMessages]) -> str:
        nonlocal attempts
        attempts += 1
        return '{"reason": "fails P2", "verdict": "overlay"}'

    response = asyncio.run(request_judgement(messages, send))

    assert response == Response(reason="fails P2", verdict="overlay")
    assert attempts == 1


def test_build_retry_prompt_appends_repair_exchange() -> None:
    messages = [
        ChatSystemMessage(role="system", content="policy"),
        ChatUserMessage(role="user", content="card\n"),
    ]

    retry = build_retry_prompt(messages, "not JSON")

    assert retry[:-2] == messages
    assert retry[0] is messages[0]
    assert retry[1] is messages[1]
    assert retry[-2] == ChatAssistantMessage(role="assistant", content="not JSON")
    assert RETRY_INSTRUCTION == "Reply with only the JSON object."
    assert retry[-1] == ChatUserMessage(role="user", content="Reply with only the JSON object.")
    assert messages[-1].content == "card\n"


@pytest.mark.parametrize(
    ("messages", "error", "match"),
    [
        ([], ValueError, "empty prompt"),
        (
            [ChatAssistantMessage(role="assistant", content="not a user turn")],
            TypeError,
            "user message",
        ),
    ],
)
def test_build_retry_prompt_requires_final_user_turn(
    messages: list[ChatMessages], error: type[Exception], match: str
) -> None:
    with pytest.raises(error, match=match):
        build_retry_prompt(messages, "not JSON")
