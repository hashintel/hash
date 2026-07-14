"""Build reusable rubric-v1 prompts without provider-specific message types.

[`PromptPack`] resolves every finite bundle once and retains immutable prefixes
for repeated live requests. Its content hash is streamed over the canonical
legacy payload, so memory use is independent of the serialized pack size.
"""

import hashlib
import json
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol, Self, assert_never

from atlas_tools.relation.evaluation.domain.api import (
    BUNDLES,
    BundleId,
    FramingId,
    RelationId,
    Sha256Hex,
    Verdict,
    bundle_parts,
)
from atlas_tools.relation.evaluation.modes._rubric_v1 import (
    FEW_SHOT_ROWS,
    HOLDOUT_ALTERNATES,
    HOLDOUT_ROWS,
    RETRY_INSTRUCTION,
    SYSTEM_PROMPTS,
)


@dataclass(frozen=True, slots=True)
class SystemMessage:
    """A provider-neutral system instruction."""

    content: str
    role: Literal["system"] = "system"


@dataclass(frozen=True, slots=True)
class UserMessage:
    """A provider-neutral user turn."""

    content: str
    role: Literal["user"] = "user"


@dataclass(frozen=True, slots=True)
class AssistantMessage:
    """A provider-neutral assistant turn."""

    content: str
    role: Literal["assistant"] = "assistant"


type PromptMessage = SystemMessage | UserMessage | AssistantMessage
type PromptPrefix = tuple[PromptMessage, ...]


class _Digest(Protocol):
    def update(self, data: bytes, /) -> object: ...


@dataclass(frozen=True, slots=True)
class PromptCard:
    """A card identity and the exact judge-visible text bound to it."""

    relation_id: RelationId
    card_text: str


@dataclass(frozen=True, slots=True)
class FewShot:
    """A fixed demonstration card and its canonical assistant response."""

    relation_id: RelationId
    response: str


@dataclass(frozen=True, slots=True)
class Holdout:
    """A fixed pilot anchor and its canonical rubric-v1 verdict."""

    relation_id: RelationId
    verdict: Verdict


FEW_SHOTS = tuple(
    FewShot(relation_id=relation_id, response=response) for relation_id, response in FEW_SHOT_ROWS
)
HOLDOUTS = tuple(
    Holdout(relation_id=relation_id, verdict=verdict) for relation_id, verdict in HOLDOUT_ROWS
)

_PREFIX_INDEX: dict[BundleId, int] = {
    "S1xF1": 0,
    "S1xF2": 1,
    "S1xF3": 2,
    "S2xF1": 3,
    "S2xF2": 4,
    "S2xF3": 5,
    "S3xF1": 6,
    "S3xF2": 7,
    "S3xF3": 8,
}

_VERDICT_BY_TEXT: dict[str, Verdict] = {
    "coincident": "coincident",
    "proximal": "proximal",
    "overlay": "overlay",
    "unclear": "unclear",
}


def frame_card(*, framing: FramingId, card_text: str) -> str:
    """Apply one of the three finite live-turn framings to a card."""
    match framing:
        case "F1":
            return f"""Here is a link type. Where should B be relative to A on the map?

{card_text}"""
        case "F2":
            return f"""You are setting a single placement policy for every instance of this
link type. Consider the typical instance and which misplacement would
be cheapest if the policy is wrong. What policy do you set?

{card_text}"""
        case "F3":
            return f"""Run the decision tests in order: same thing or distinct? if distinct,
would nearness be expected or is the connection role-crossing or
attribute-like? do any hedge words appear? Then give the verdict for
this link type.

{card_text}"""
        case unreachable:
            assert_never(unreachable)


def accepted_holdout_verdicts(relation_id: RelationId) -> frozenset[Verdict]:
    """Return every rubric-v1 verdict accepted for one fixed holdout."""
    canonical = next(
        (holdout.verdict for holdout in HOLDOUTS if holdout.relation_id == relation_id),
        None,
    )
    if canonical is None:
        raise KeyError(f"relation {relation_id} is not a rubric-v1 holdout")
    return frozenset({canonical}) | HOLDOUT_ALTERNATES.get(relation_id, frozenset())


def message_payload(message: PromptMessage) -> dict[str, str]:
    """Project a neutral message into the two-field provider wire shape."""
    return {"content": message.content, "role": message.role}


def build_repair_messages(
    messages: Sequence[PromptMessage],
    malformed_completion: str,
) -> tuple[PromptMessage, ...]:
    """Append the malformed completion and the fixed corrective user turn.

    The original prompt must end in a [`UserMessage`], which ensures the
    appended assistant turn remains a valid conversation.
    """
    if not messages:
        raise ValueError("cannot repair an empty prompt")
    if not isinstance(messages[-1], UserMessage):
        raise TypeError("a repair prompt must end in a user message")
    return (
        *messages,
        AssistantMessage(content=malformed_completion),
        UserMessage(content=RETRY_INSTRUCTION),
    )


@dataclass(frozen=True, slots=True)
class PromptPack:
    """Nine reusable prompt prefixes and their stable artifact identity."""

    prefixes: tuple[PromptPrefix, ...]
    content_hash: Sha256Hex

    def __post_init__(self) -> None:
        if len(self.prefixes) != len(BUNDLES):
            raise ValueError(f"a rubric-v1 prompt pack requires {len(BUNDLES)} prefixes")
        expected = _prompt_pack_hash(self.prefixes)
        if self.content_hash != expected:
            raise ValueError("prompt pack content hash does not match its prefixes")

    @classmethod
    def from_cards(cls, cards: Iterable[PromptCard]) -> Self:
        """Build every prefix from the exact fixed few-shot card texts.

        Duplicate relation IDs and missing few-shot cards are rejected. Cards
        outside the fixed demonstrations do not affect the prompt pack.
        """
        by_id: dict[RelationId, PromptCard] = {}
        for card in cards:
            if card.relation_id in by_id:
                raise ValueError(f"prompt cards repeat relation {card.relation_id}")
            by_id[card.relation_id] = card
        missing = tuple(shot.relation_id for shot in FEW_SHOTS if shot.relation_id not in by_id)
        if missing:
            raise ValueError(f"prompt cards lack fixed few-shot relations: {missing}")

        prefixes = tuple(_build_prefix(bundle=bundle, cards=by_id) for bundle in BUNDLES)
        return cls(prefixes=prefixes, content_hash=_prompt_pack_hash(prefixes))

    def prefix(self, bundle: BundleId) -> PromptPrefix:
        """Return the precomputed prefix for one finite bundle."""
        return self.prefixes[_PREFIX_INDEX[bundle]]

    def live_messages(self, *, bundle: BundleId, card_text: str) -> tuple[PromptMessage, ...]:
        """Append one framed live card to a precomputed prefix."""
        _, framing = bundle_parts(bundle)
        return (
            *self.prefix(bundle),
            UserMessage(content=frame_card(framing=framing, card_text=card_text)),
        )


def _build_prefix(*, bundle: BundleId, cards: Mapping[RelationId, PromptCard]) -> PromptPrefix:
    shell, framing = bundle_parts(bundle)
    messages: list[PromptMessage] = [SystemMessage(content=SYSTEM_PROMPTS[shell])]
    for shot in FEW_SHOTS:
        messages.extend(
            (
                UserMessage(
                    content=frame_card(framing=framing, card_text=cards[shot.relation_id].card_text)
                ),
                AssistantMessage(content=shot.response),
            )
        )
    return tuple(messages)


def _encoded_string(value: str) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def _update_string_array(digest: _Digest, values: Iterable[str]) -> None:
    digest.update(b"[")
    separator = b""
    for value in values:
        digest.update(separator)
        digest.update(_encoded_string(value))
        separator = b","
    digest.update(b"]")


def _update_message(digest: _Digest, message: PromptMessage) -> None:
    digest.update(b'{"content":')
    digest.update(_encoded_string(message.content))
    digest.update(b',"role":')
    digest.update(_encoded_string(message.role))
    digest.update(b"}")


def _prompt_pack_hash(prefixes: Sequence[PromptPrefix]) -> Sha256Hex:
    digest = hashlib.sha256()
    digest.update(b'{"live_turn_templates":')
    _update_string_array(
        digest,
        (frame_card(framing=framing, card_text="{{card_text}}") for framing in ("F1", "F2", "F3")),
    )
    digest.update(b',"prefixes":[')
    prefix_separator = b""
    for prefix in prefixes:
        digest.update(prefix_separator)
        digest.update(b"[")
        message_separator = b""
        for message in prefix:
            digest.update(message_separator)
            _update_message(digest, message)
            message_separator = b","
        digest.update(b"]")
        prefix_separator = b","
    digest.update(b'],"retry_instruction":')
    digest.update(_encoded_string(RETRY_INSTRUCTION))
    digest.update(b"}")
    return digest.hexdigest()


@dataclass(frozen=True, slots=True)
class JudgeResponse:
    """A strictly parsed rubric-v1 response."""

    reason: str
    verdict: Verdict


class MalformedResponseError(ValueError):
    """A completion does not contain the exact rubric-v1 response object."""


def _last_object_pairs(completion: str) -> tuple[tuple[str, object], ...]:
    decoder = json.JSONDecoder()
    cursor = 0
    last: tuple[tuple[str, object], ...] | None = None

    while (start := completion.find("{", cursor)) >= 0:
        try:
            value, end = decoder.raw_decode(completion, start)
        except json.JSONDecodeError:
            cursor = start + 1
            continue

        if isinstance(value, dict):
            pairs: list[tuple[str, object]] = []
            valid = True

            for key, item in value.items():
                if not isinstance(key, str):
                    valid = False
                    break

                pairs.append((key, item))

            if valid:
                last = tuple(pairs)
        cursor = end

    if last is None:
        raise MalformedResponseError("completion does not contain a JSON object")

    return last


def parse_response(completion: str) -> JudgeResponse:
    """Parse the last JSON object under the exact ordered response contract."""
    pairs = _last_object_pairs(completion)
    if tuple(key for key, _ in pairs) != ("reason", "verdict"):
        raise MalformedResponseError(
            'response must contain exactly the ordered keys "reason", then "verdict"'
        )

    reason = pairs[0][1]
    verdict = pairs[1][1]
    if not isinstance(reason, str) or not isinstance(verdict, str):
        raise MalformedResponseError("response fields are invalid")

    try:
        normalized = _VERDICT_BY_TEXT[verdict.casefold()]
    except KeyError:
        raise MalformedResponseError("response fields are invalid") from None

    return JudgeResponse(reason=reason, verdict=normalized)
