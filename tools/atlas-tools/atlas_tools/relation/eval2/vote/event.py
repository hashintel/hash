from typing import Annotated, Literal

from pydantic import Discriminator, Tag

from atlas_tools.relation.eval.contract import VoteTask
from atlas_tools.relation.eval2.common import FrozenModel
from atlas_tools.relation.eval2.plan import PlanIndex
from atlas_tools.relation.eval2.vote.attempt import VoteAttempt
from atlas_tools.relation.eval2.vote.entry import VoteEntry
from atlas_tools.relation.eval2.vote.executor import WorkerId


class VoteComplete(FrozenModel):
    kind: Literal["vote-complete"] = "vote-complete"

    vote: VoteEntry


class VoteDefer(FrozenModel):
    kind: Literal["vote-defer"] = "vote-defer"

    plan: PlanIndex
    task: VoteTask
    attempts: tuple[VoteAttempt, ...]

    exception: BaseException


class VoteFail(FrozenModel):
    kind: Literal["vote-fail"] = "vote-fail"

    plan: PlanIndex
    exception: BaseException


class VoteStop(FrozenModel):
    kind: Literal["vote-stop"] = "vote-stop"

    plan: PlanIndex


VoteEvent = Annotated[
    Annotated[VoteComplete, Tag("vote-complete")]
    | Annotated[VoteDefer, Tag("vote-defer")]
    | Annotated[VoteFail, Tag("vote-fail")]
    | Annotated[VoteStop, Tag("vote-stop")],
    Discriminator(lambda x: x.kind),
]


class WorkerStop(FrozenModel):
    kind: Literal["worker-stop"] = "worker-stop"

    id: WorkerId
    exception: BaseException | None


WorkerEvent = Annotated[
    Annotated[WorkerStop, Tag("worker-stop")] | VoteEvent,
    Discriminator(lambda x: x.kind),
]
