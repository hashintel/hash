from typing import Annotated, Literal

from pydantic import Discriminator, Tag

from atlas_tools.relation.eval2.common import FrozenModel
from atlas_tools.relation.eval2.plan import PlanIndex
from atlas_tools.relation.eval2.vote.attempt import VoteAttempt
from atlas_tools.relation.eval2.vote.task import VoteTask


class ExecuteVoteCommand(FrozenModel):
    kind: Literal["execute-vote"] = "execute-vote"

    plan: PlanIndex
    task: VoteTask

    attempts: tuple[VoteAttempt, ...]


class StopWorkerCommand(FrozenModel):
    kind: Literal["stop-worker"] = "stop-worker"


WorkerCommand = Annotated[
    Annotated[ExecuteVoteCommand, Tag("execute-vote")]
    | Annotated[StopWorkerCommand, Tag("stop-worker")],
    Discriminator(lambda x: x.kind),
]
