from pathlib import Path

import trio

from atlas_tools.relation.evaluation.application.manifest import (
    build_pilot_manifest,
    build_pilot_state,
)
from atlas_tools.relation.evaluation.application.preparation import prepare_pilot_inputs
from atlas_tools.relation.evaluation.domain.api import (
    HandoffManifest,
    HistoricalRequestEvidence,
    PilotRunState,
)
from atlas_tools.relation.evaluation.storage.api import (
    JournalPaths,
    RunJournal,
    file_hash,
)

ROOT = Path(__file__).parents[3]
PAID_REQUEST_CONTRACT = "50a4b5e0678a47fead0c73415a6e5e95088a227ac05c5c07829ac0676c3e511e"
HISTORICAL_REQUEST_EVIDENCE = HistoricalRequestEvidence(
    request_policy_ids=("legacy-no-anthropic-prompt-caching-v1",),
    attempt_count=22_849,
    attempts_prefix_hash="a2eaff06541c877d530246f8e946a664ddbb8bc31c3ec36ea18a792a1978ee9d",
)


def test_manifest_builders_reproduce_the_paid_pilot_artifacts() -> None:
    async def scenario() -> None:
        prepared = prepare_pilot_inputs(ROOT / "config/eval/pilot.yaml", ROOT / "runs/cards")
        run_directory = ROOT / "runs/evaluate-v2"
        expected_state = PilotRunState.model_validate_json(
            (run_directory / "run-state.json").read_bytes(),
            strict=True,
        )
        state = build_pilot_state(
            prepared,
            request_contract_hash=PAID_REQUEST_CONTRACT,
            openrouter_sdk_version="0.10.8",
            openrouter_openapi_version="1.0.0",
            historical_request_evidence=HISTORICAL_REQUEST_EVIDENCE,
        )
        assert state == expected_state

        journal = RunJournal(paths=JournalPaths.under(run_directory))
        votes = await journal.votes()
        artifact_hashes = {
            "attempts.jsonl": await file_hash(run_directory / "attempts.jsonl"),
            "slice.jsonl": await file_hash(run_directory / "slice.jsonl"),
            "votes.jsonl": await file_hash(run_directory / "votes.jsonl"),
        }
        manifest = build_pilot_manifest(
            prepared,
            state=state,
            votes=votes,
            artifact_hashes=artifact_hashes,
        )
        expected_manifest = HandoffManifest.model_validate_json(
            (run_directory / "manifest.json").read_bytes(),
            strict=True,
        )
        assert manifest == expected_manifest

    trio.run(scenario)
