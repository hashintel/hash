"""Byte-stable prompt assembly and strict response parsing for relation judges."""

import json
from collections.abc import Awaitable, Callable, Mapping, Sequence
from typing import Literal, cast

from openrouter.components import (
    ChatAssistantMessage,
    ChatMessages,
    ChatSystemMessage,
    ChatUserMessage,
)
from pydantic import BaseModel, ConfigDict, ValidationError

from atlas_tools.common import Sha256Hex, canonical_json_bytes, sha256_bytes
from atlas_tools.relation_cards.common.cards import (
    CardRow,
    RelationId,
    qualify_relation_id,
)

CORE_AB = """Each card describes a link type from a source entity A to a target
entity B: the card's direction field is source -> target, and every
example line reads A -> B in that order. If the direction is
symmetric, A and B are interchangeable and the placement claim is
mutual."""

CORE_VERDICTS = """Verdicts are defined by conditions on the typical instance (A, B) of
the link type. Evaluate coincident first, then proximal; overlay is
the verdict for genuine links that earn neither; unclear is reserved
for links the procedure cannot settle.

- coincident. Assign only if ALL of:
  (C1) A and B have one referent — one thing under two records — or,
       narrowly, are distinct entities whose subject matter is
       provably identical and exhaustive (identity of extent);
  (C2) the identity is asserted as settled: no dispute, no hedge —
       "said to be", "possibly", "partially", "nearly" fail C2;
  (C3) no remainder: neither side has parts, instances, or content
       the other lacks;
  (C4) the records are separate for administrative or technical
       reasons only, not semantic ones.
  Map consequence: one dot.

- proximal. Assign only if coincident fails and ALL of:
  (P1) A and B are distinct things;
  (P2) the typical instance creates an expectation of co-location:
       exploring one, a user would be surprised not to find the other
       nearby (containment, membership in a territorial organizer,
       kinship, spatial adjacency, taxonomy, formal correspondence);
  (P3) that expectation holds for the majority of instances of the
       type.
  Map consequence: near, never merged.

- overlay. Assign when the link is genuine but the conditions for
  coincident and proximal are not met. Characteristic signatures:
  (O1) shared attribute, name, symbol, or trait — a string, not a
       place;
  (O2) aboutness across roles — a thing and its subject matter
       (authorship, depiction, measurement, modeling);
  (O3) functional, metadata, or qualifier relations;
  (O4) a heterogeneous population whose majority fails P2.
  Map consequence: the edge renders and is traversable; nothing
  moves.

- unclear. Assign only if:
  (U1) the population splits into large sub-uses with conflicting
       verdicts and no safe majority; or
  (U2) the card does not contain enough to evaluate the conditions.
  A real verdict; prefer it over guessing.

Demotion law:
  (D1) Unresolved doubt about any C-condition demotes the verdict to
       proximal. Doubt never promotes: there is no analogous move
       from overlay toward proximal or from proximal toward
       coincident."""

CORE_DISCIPLINE = """1. Judge the TYPICAL case of the link type on a general-purpose map:
   no specific task, no specific user. Answer as if this link is the
   only thing known about the pair; the system combines links later.
2. Surprised-not-nearby test: would a user exploring one end be
   surprised not to find the other? Surprise argues proximal.
3. Membership in an organizing entity: ask whether the organizer has a
   geography or territory. Diocese and metro line: yes, proximal.
   Publisher and employer: generally no, overlay.
4. Shared endpoints pull only when co-membership means something.
   Sharing an attribute, name, symbol, or trait is sharing a string,
   not a place: overlay. This covers the whole attribute family
   (color, surname, handedness, notation, typeface) and the aboutness
   family (authorship, depiction, measurement, modeling): a thing and
   its subject matter link across roles without a placement claim.
5. Hedge words demote coincident to proximal. "Said to be", "partially",
   "possibly", "nearly": the hedge records doubt or remainder, and
   stacking would render the dispute as settled. Wrongly merging two
   distinct things is the worst error the map can make; wrongly
   placing two copies side by side is cosmetic.
6. When one class must cover a heterogeneous population, pick the one
   whose error is cheapest for the majority of instances.
7. Direction and constraints on the card matter: read them before
   deciding. Symmetric relations hint at mutual nearness; qualifiers
   and metadata relations make no placement claim."""

CORE_OUTPUT = """Output exactly one JSON object and nothing else, no code fences:
{"reason": "<at most 60 words; cite the decisive condition ids, e.g.
'fails C2' or 'P1-P3 hold'>", "verdict": "coincident" | "proximal" |
"overlay" | "unclear"}"""

SYSTEM_PROMPT_1 = f"""You are labeling link TYPES for a map of everything: every entity is a
dot, similar things sit near each other, and links between entities
may or may not influence where dots go. For each link type you decide
what placement claim it makes, not how strong it is.

{CORE_AB}

The four verdicts:

{CORE_VERDICTS}

Decision discipline:

{CORE_DISCIPLINE}

{CORE_OUTPUT}"""

SYSTEM_PROMPT_2 = f"""You are the placement editor for an atlas of every entity. Layout
systems downstream will follow the type-level policy you set; your
ruling applies to every instance of a link type, so you rule on the
type, not on any single pair.

Apply this procedure to each card:

{CORE_DISCIPLINE}

{CORE_AB}

Your ruling is one of four:

{CORE_VERDICTS}

{CORE_OUTPUT}"""

SYSTEM_PROMPT_3 = f"""Task: classify the placement claim of a link type for an entity map.
Definitions and procedure follow. Apply them exactly.

Input format.
{CORE_AB}

Verdicts.
{CORE_VERDICTS}

Procedure.
{CORE_DISCIPLINE}

{CORE_OUTPUT}"""


def framing1(card: str) -> str:
    return f"""Here is a link type. Where should B be relative to A on the map?

{card}"""


def framing2(card: str) -> str:
    return f"""You are setting a single placement policy for every instance of this
link type. Consider the typical instance and which misplacement would
be cheapest if the policy is wrong. What policy do you set?

{card}"""


def framing3(card: str) -> str:
    return f"""Run the decision tests in order: same thing or distinct? if distinct,
would nearness be expected or is the connection role-crossing or
attribute-like? do any hedge words appear? Then give the verdict for
this link type.

{card}"""


type Judgement = Literal["coincident", "proximal", "overlay", "unclear"]
type SingleShot = tuple[RelationId, str]
type Holdout = tuple[RelationId, Judgement]
type CompletionSender = Callable[[list[ChatMessages]], Awaitable[str]]
type PromptPrefix = tuple[ChatMessages, ...]

FEW_SHOT: tuple[SingleShot, ...] = (
    (
        qualify_relation_id("wikidata", "P22"),
        (
            '{"reason": "P1: father and child are distinct. P2: exploring a person, you '
            "would be surprised not to find their father, core context. P3: holds for "
            'essentially every instance. Near, never stacked.", "verdict": "proximal"}'
        ),
    ),
    (
        qualify_relation_id("wikidata", "P462"),
        (
            '{"reason": "O1: color is a shared attribute, a string not a place; fails P2, '
            "since pulling everything red gathers fire trucks, apples, and flags into one "
            'meaningless cluster. Render the link, move nothing.", "verdict": "overlay"}'
        ),
    ),
    (
        qualify_relation_id("wikidata", "P658"),
        (
            '{"reason": "P1: album and track are distinct. P2 via containment: exploring '
            "an album, you would be surprised not to find its songs. P3 holds across the "
            'type. Tightly co-located, never merged; template for the part-of family.", '
            '"verdict": "proximal"}'
        ),
    ),
    (
        qualify_relation_id("wikidata", "P913"),
        (
            '{"reason": "O1: one symbol serves many unrelated concepts, so symbol-pull '
            "clusters by typographic accident, share-a-symbol is share-a-string. Where "
            "notation tracks meaning the concepts are already close; elsewhere the pull is "
            'noise. Fails P2.", "verdict": "overlay"}'
        ),
    ),
    (
        qualify_relation_id("wikidata", "P81"),
        (
            '{"reason": "P2 via the organizer-geography test: a metro line is a territory, '
            "a linear corridor; stations gather into it and interchanges settle between "
            "their lines. Cross-role on the surface, territorial underneath. P1 and P3 "
            'hold.", "verdict": "proximal"}'
        ),
    ),
    (
        qualify_relation_id("wikidata", "P734"),
        (
            '{"reason": "O1: a family name is an attribute reified as an entity; name-pull '
            "gathers all Muellers into a namesake cluster, purely incidental. Co-membership "
            'must mean something, and surname bearers share nothing but a string. Fails P2.", '
            '"verdict": "overlay"}'
        ),
    ),
    (
        qualify_relation_id("wikidata", "P279"),
        (
            '{"reason": "P1: both ends are kinds and stay distinct however tight the step. '
            "P2: a narrower kind belongs in its broader kind's neighborhood, so the hierarchy "
            'renders as nested regions. P3 holds. Near, never merged.", "verdict": "proximal"}'
        ),
    ),
    (
        qualify_relation_id("wikidata", "P2575"),
        (
            '{"reason": "O2 aboutness: instrument and phenomenon live in different worlds '
            "on purpose, and measurement-pull would drag hardware into concept-space. The "
            'link is functional, what the tool does, not where it belongs. No placement claim.", '
            '"verdict": "overlay"}'
        ),
    ),
    (
        qualify_relation_id("wikidata", "P460"),
        (
            '{"reason": "Fails C2: identity claimed but hedged, the property exists because '
            "someone resisted merging. D1 demotes to proximal: stacking would render the "
            "dispute settled, and a wrong merge is the map's worst error while adjacency is "
            'cosmetic.", "verdict": "proximal"}'
        ),
    ),
    (
        qualify_relation_id("wikidata", "P741"),
        (
            '{"reason": "O1: a binary trait spanning millions is an attribute, not a '
            "relationship; handedness-pull sorts athletes into two giant meaningless blobs. "
            'Fails P2. Render it, filter by it, move no one.", "verdict": "overlay"}'
        ),
    ),
    (
        qualify_relation_id("wikidata", "P1322"),
        (
            '{"reason": "P1: distinct objects. P2 via formal correspondence: duality is a '
            "precise pairing, each object constructible from the other, and studying one puts "
            'the other in hand. Pairwise, not toward a hub. P3 holds.", "verdict": "proximal"}'
        ),
    ),
    (
        qualify_relation_id("wikidata", "P1441"),
        (
            '{"reason": "U1: the population splits into two large sub-uses with opposite '
            "verdicts. Native fictional characters belong with their work (P2 via containment: "
            "Pettigrew in Goblet of Fire); real and mythical figures appearing in works are "
            "aboutness links (O2: Gandhi in Civilization V). No safe majority is readable from "
            'the card; P3 cannot be established either way.", "verdict": "unclear"}'
        ),
    ),
    (
        qualify_relation_id("wikidata", "P708"),
        (
            '{"reason": "Cross-role surface (parish building, diocese organization), but P2 '
            "holds via the organizer-geography test: a diocese is a territorial jurisdiction, "
            "so pull yields regional parish clusters, honest placement. P3 narrowly holds. "
            'Proximal, narrowly.", "verdict": "proximal"}'
        ),
    ),
    (
        qualify_relation_id("wikidata", "P2959"),
        (
            '{"reason": "C1: one referent, two records. C2: nobody disputes the identity. C3: '
            "no remainder. C4: the separation is wiki-technical only. Two dots would be a bug, "
            'the map shows things, not records.", "verdict": "coincident"}'
        ),
    ),
)

HOLDOUT: tuple[Holdout, ...] = (
    (qualify_relation_id("wikidata", "P6"), "overlay"),
    (qualify_relation_id("wikidata", "P47"), "proximal"),
    (qualify_relation_id("wikidata", "P2634"), "overlay"),
    (qualify_relation_id("wikidata", "P2739"), "overlay"),
    (qualify_relation_id("wikidata", "P1382"), "proximal"),
    (qualify_relation_id("wikidata", "P3403"), "coincident"),
)

SYSTEM_PROMPTS = (SYSTEM_PROMPT_1, SYSTEM_PROMPT_2, SYSTEM_PROMPT_3)
FRAMINGS = (framing1, framing2, framing3)


class Response(BaseModel):
    reason: str
    verdict: Judgement

    model_config = ConfigDict(extra="forbid", frozen=True)


RETRY_INSTRUCTION = "Reply with only the JSON object."
_RESPONSE_KEYS = ("reason", "verdict")


class MalformedResponseError(ValueError):
    """Raised when a completion does not contain a valid judge response."""


def _last_json_object(completion: str) -> dict[str, object]:
    decoder = json.JSONDecoder()
    cursor = 0
    last_object: dict[str, object] | None = None

    while (start := completion.find("{", cursor)) >= 0:
        try:
            value, end = decoder.raw_decode(completion, start)
        except json.JSONDecodeError:
            cursor = start + 1
            continue

        if isinstance(value, dict):
            last_object = cast("dict[str, object]", value)
        cursor = end

    if last_object is None:
        raise MalformedResponseError("completion does not contain a JSON object")
    return last_object


def parse_response(completion: str) -> Response:
    """Extract and validate the last JSON object in a judge completion."""
    payload = _last_json_object(completion)
    if tuple(payload) != _RESPONSE_KEYS:
        raise MalformedResponseError(
            'response must contain exactly the ordered keys "reason", then "verdict"'
        )

    verdict = payload["verdict"]
    if isinstance(verdict, str):
        payload["verdict"] = verdict.casefold()

    try:
        return Response.model_validate(payload, strict=True)
    except ValidationError as error:
        raise MalformedResponseError("response fields are invalid") from error


def build_retry_prompt(
    messages: Sequence[ChatMessages], malformed_completion: str
) -> list[ChatMessages]:
    """Append the malformed answer and the pack's corrective user turn."""
    if not messages:
        raise ValueError("cannot retry an empty prompt")
    if not isinstance(messages[-1], ChatUserMessage):
        raise TypeError("a retry prompt must end in a user message")

    return [
        *messages,
        ChatAssistantMessage(role="assistant", content=malformed_completion),
        ChatUserMessage(role="user", content=RETRY_INSTRUCTION),
    ]


async def request_judgement(
    messages: Sequence[ChatMessages], send: CompletionSender
) -> Response | None:
    """Request a judgement, retry one malformed completion, then abstain."""
    completion = await send(list(messages))
    try:
        return parse_response(completion)
    except MalformedResponseError:
        retry_prompt = build_retry_prompt(messages, completion)

    retry_completion = await send(retry_prompt)
    try:
        return parse_response(retry_completion)
    except MalformedResponseError:
        return None


def build_prompt_prefix(
    *,
    system_prompt: Literal[1, 2, 3],
    framing: Literal[1, 2, 3],
    cards: Mapping[RelationId, CardRow],
) -> PromptPrefix:
    """Build the immutable system-and-shots prefix for one prompt bundle."""
    framing_fn = FRAMINGS[framing - 1]
    messages: list[ChatMessages] = [
        ChatSystemMessage(role="system", content=SYSTEM_PROMPTS[system_prompt - 1])
    ]
    for relation_id, judgement in FEW_SHOT:
        card = cards[relation_id]
        messages.append(ChatUserMessage(role="user", content=framing_fn(card.card_text)))
        messages.append(ChatAssistantMessage(role="assistant", content=judgement))
    return tuple(messages)


def build_live_prompt(
    prefix: PromptPrefix,
    *,
    framing: Literal[1, 2, 3],
    card_text: str,
) -> list[ChatMessages]:
    """Append one live card without rebuilding the byte-stable prefix."""
    return [
        *prefix,
        ChatUserMessage(role="user", content=FRAMINGS[framing - 1](card_text)),
    ]


def builds_prompt(
    *,
    system_prompt: Literal[1, 2, 3],
    framing: Literal[1, 2, 3],
    cards: Mapping[RelationId, CardRow],
    request: str,
) -> list[ChatMessages]:
    """Build a complete prompt; callers executing many cards should cache the prefix."""
    prefix = build_prompt_prefix(
        system_prompt=system_prompt,
        framing=framing,
        cards=cards,
    )
    return build_live_prompt(prefix, framing=framing, card_text=request)


def prompt_pack_hash(cards: Mapping[RelationId, CardRow]) -> Sha256Hex:
    """Hash every static judge-visible byte and the malformed-output repair instruction."""
    prefixes = []
    for system_prompt in (1, 2, 3):
        for framing in (1, 2, 3):
            prefix = build_prompt_prefix(
                system_prompt=system_prompt,
                framing=framing,
                cards=cards,
            )
            prefixes.append(
                [
                    message.model_dump(mode="json", by_alias=True, exclude_unset=True)
                    for message in prefix
                ]
            )

    payload = {
        "prefixes": prefixes,
        "live_turn_templates": [framing("{{card_text}}") for framing in FRAMINGS],
        "retry_instruction": RETRY_INSTRUCTION,
    }
    return sha256_bytes(canonical_json_bytes(payload))
