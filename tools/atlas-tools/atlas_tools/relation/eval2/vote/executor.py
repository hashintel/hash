from typing import NewType, assert_never

from trio import MemoryReceiveChannel, MemorySendChannel

from atlas_tools.relation.eval2.vote.command import (
    ExecuteVoteCommand,
    StopWorkerCommand,
    WorkerCommand,
)
from atlas_tools.relation.eval2.vote.event import WorkerEvent, WorkerStop

WorkerId = NewType("WorkerId", int)


class Worker:
    id: WorkerId

    tx: MemorySendChannel[WorkerEvent]
    rx: MemoryReceiveChannel[WorkerCommand]

    def __init__(self, *, worker_id: WorkerId) -> None:
        self.id = worker_id

    async def _work_loop(self):
        async for command in self.rx:
            match command:
                case StopWorkerCommand():
                    break
                case ExecuteVoteCommand():
                    ...
                case _:
                    assert_never()

    async def _work_try(self):
        has_exception = True
        close_exception: BaseException | None = None

        try:
            await self._work_loop()
            has_exception = False
        finally:
            ...

        if not has_exception:
            await self.tx.send(WorkerStop(id=self.id, exception=close_exception))

    async def work(self):
        async with self.rx, self.tx:
            await self._work_try()
