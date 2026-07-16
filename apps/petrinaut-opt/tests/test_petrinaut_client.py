import unittest
from pathlib import Path
from unittest.mock import patch

from src.petrinaut_client import PetrinautModel, PetrinautModelSpec


class FakeStream:
    def __init__(self, lines: list[str] | None = None) -> None:
        self.lines = list(lines or [])
        self.closed = False

    def write(self, _value: str) -> None:
        pass

    def flush(self) -> None:
        pass

    def readline(self) -> str:
        return self.lines.pop(0) if self.lines else ""

    def read(self) -> str:
        return ""

    def close(self) -> None:
        self.closed = True


class FakeProcess:
    def __init__(self, response_lines: list[str]) -> None:
        self.stdin = FakeStream()
        self.stdout = FakeStream(response_lines)
        self.stderr = FakeStream(["Petrinaut stdio ready\n"])
        self.returncode: int | None = None
        self.killed = False

    def poll(self) -> int | None:
        return self.returncode

    def kill(self) -> None:
        self.killed = True
        self.returncode = -9

    def wait(self, timeout: float | None = None) -> int:
        del timeout
        if self.returncode is None:
            self.returncode = 0
        return self.returncode

    def terminate(self) -> None:
        self.returncode = -15


class FakeTimer:
    def __init__(self, callback, *, fires: bool) -> None:
        self.callback = callback
        self.fires = fires

    def start(self) -> None:
        if self.fires:
            self.callback()

    def cancel(self) -> None:
        pass

    def join(self) -> None:
        pass


class PetrinautModelTimeoutTest(unittest.TestCase):
    def test_timeout_restarts_cli_for_the_next_exchange(self) -> None:
        first_process = FakeProcess(response_lines=[])
        second_process = FakeProcess(response_lines=['{"result": "recovered"}\n'])
        timer_count = 0

        def make_timer(_interval, callback):
            nonlocal timer_count
            timer_count += 1
            return FakeTimer(callback, fires=timer_count == 1)

        fixture_path = str(Path(__file__).resolve())
        model = PetrinautModel(
            PetrinautModelSpec(
                model_path=fixture_path,
                cli_path=fixture_path,
                eval_timeout=0.1,
            )
        )

        with (
            patch(
                "src.petrinaut_client.subprocess.Popen",
                side_effect=[first_process, second_process],
            ) as popen,
            patch("src.petrinaut_client.threading.Timer", side_effect=make_timer),
        ):
            model.start()

            with self.assertRaisesRegex(RuntimeError, "timed out"):
                model.exchange({"id": 1})

            self.assertTrue(first_process.killed)
            self.assertIs(model._process, second_process)
            self.assertEqual(model.exchange({"id": 2}), {"result": "recovered"})
            self.assertEqual(popen.call_count, 2)

        model.close()


if __name__ == "__main__":
    unittest.main()
