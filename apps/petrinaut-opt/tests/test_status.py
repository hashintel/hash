import unittest

from fastapi import FastAPI

from src.utils import Phase, StatusStore, set_status


class StatusStoreTest(unittest.TestCase):
    def setUp(self) -> None:
        self.app = FastAPI()
        self.app.state.statuses = StatusStore()

    def test_concurrent_runs_keep_independent_statuses(self) -> None:
        first = self.app.state.statuses.create()
        second = self.app.state.statuses.create()

        set_status(
            self.app, first.run_id, phase=Phase.running, detail="first running"
        )
        set_status(
            self.app, second.run_id, phase=Phase.running, detail="second running"
        )
        set_status(
            self.app, first.run_id, phase=Phase.done, detail="first completed"
        )

        first_status = self.app.state.statuses.get(first.run_id)
        second_status = self.app.state.statuses.get(second.run_id)

        self.assertEqual(first_status.phase, Phase.done)
        self.assertEqual(first_status.detail, "first completed")
        self.assertEqual(second_status.phase, Phase.running)
        self.assertEqual(second_status.detail, "second running")

    def test_all_returns_each_run_with_its_identifier(self) -> None:
        first = self.app.state.statuses.create()
        second = self.app.state.statuses.create()

        statuses = self.app.state.statuses.all()

        self.assertEqual(
            [status.run_id for status in statuses],
            [first.run_id, second.run_id],
        )


if __name__ == "__main__":
    unittest.main()
