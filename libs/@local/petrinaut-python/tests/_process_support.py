"""In-memory subprocess support for the session tests."""

import io
import json
from collections.abc import Iterable, Mapping


class FakeProcess:
    """An in-memory stand-in for the spawned CLI process."""

    def __init__(self, responses: Iterable[Mapping[str, object]]) -> None:
        self.stdin = io.BytesIO()
        self.stdout = io.BytesIO(
            "".join(json.dumps(response) + "\n" for response in responses).encode()
        )
        self.stderr = io.BytesIO(b"Petrinaut stdio ready for model <stdin>\n")
        self.returncode: int | None = None
        self.pid: int | None = None

    def poll(self) -> int | None:
        return self.returncode

    def wait(self, timeout: float | None = None) -> int:
        del timeout  # The fake returns immediately, regardless of the deadline.
        self.returncode = 0
        return 0

    def terminate(self) -> None:
        self.returncode = -15

    def kill(self) -> None:
        self.returncode = -9


class ProcessInvocation:
    """Record a session's subprocess invocation and return its fake process."""

    def __init__(self, process: FakeProcess) -> None:
        self.process = process
        self.command: list[str] | None = None
        self.kwargs: dict[str, object] = {}

    def __call__(self, command: list[str], **kwargs: object) -> FakeProcess:
        self.command = command
        self.kwargs = kwargs
        return self.process
