"""Adapt rubric-v1 prompts to the execution boundary without provider types.

The adapter owns the only lookup from a logical task to judge-visible card
text. It verifies the task's card hash before a paid request can be built, then
delegates prompt shape and response parsing to the finite rubric-v1 mode.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import assert_never

from atlas_tools.relation.evaluation.domain.api import (
    EvaluationCard,
    RelationId,
    VoteTask,
)
from atlas_tools.relation.evaluation.execution.api import ParsedVote
from atlas_tools.relation.evaluation.modes.api import (
    AssistantMessage,
    PromptMessage,
    PromptPack,
    SystemMessage,
    UserMessage,
    build_repair_messages,
    parse_response,
)
from atlas_tools.relation.evaluation.transport.api import CompletionMessage


def _completion_message(message: PromptMessage) -> CompletionMessage:
    return CompletionMessage(role=message.role, content=message.content)


def _prompt_message(message: CompletionMessage) -> PromptMessage:
    match message.role:
        case "system":
            return SystemMessage(content=message.content)
        case "user":
            return UserMessage(content=message.content)
        case "assistant":
            return AssistantMessage(content=message.content)
        case "developer":
            raise TypeError("rubric-v1 does not admit developer messages")
        case unreachable:
            assert_never(unreachable)


@dataclass(frozen=True, slots=True, kw_only=True)
class RubricVotePrompt:
    """Build exact rubric-v1 conversations from verified card projections.

    Construction is constant time. Each initial prompt copies one precomputed
    prefix and performs one immutable card-index lookup. Unknown cards and hash
    drift fail before execution crosses the paid-request boundary.
    """

    pack: PromptPack
    cards: Mapping[RelationId, EvaluationCard]

    def initial(self, task: VoteTask) -> tuple[CompletionMessage, ...]:
        """Build one live prompt after proving its card identity."""
        card = self.cards.get(task.relation_id)
        if card is None:
            raise ValueError(f"vote task refers to unknown relation {task.relation_id}")
        if card.card_hash != task.card_hash:
            raise ValueError(f"vote task card hash drifted for {task.relation_id}")
        if task.prompt_pack_hash != self.pack.content_hash:
            raise ValueError("vote task prompt pack differs from the prepared pack")
        return tuple(
            _completion_message(message)
            for message in self.pack.live_messages(
                bundle=task.bundle_id,
                card_text=card.card_text,
            )
        )

    def repair(
        self,
        messages: tuple[CompletionMessage, ...],
        malformed_completion: str,
    ) -> tuple[CompletionMessage, ...]:
        """Append the sole rubric-v1 conversational repair turn."""
        repaired = build_repair_messages(
            tuple(_prompt_message(message) for message in messages),
            malformed_completion,
        )
        return tuple(_completion_message(message) for message in repaired)

    def parse(self, completion: str) -> ParsedVote:
        """Parse the exact ordered response object into execution vocabulary."""
        response = parse_response(completion)
        return ParsedVote(verdict=response.verdict, reason=response.reason)
