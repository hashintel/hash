"""Read-only synthetic SQLite/trace inspection; not a production history API.

Usage: python3 summarize.py EVIDENCE_ROOT CANONICAL_WORKPIECE_STATE_KEY
Obtain the key from @hashintel/brunch-agent/workpiece, not a copied contract.
"""
import gzip
import hashlib
import json
import pathlib
import sqlite3
import sys

root = pathlib.Path(sys.argv[1])
key = sys.argv[2]
summary = []
for mode in ("baseline", "observer-throw", "tool-veto", "provider-reject"):
    directory = root / f"controls-{mode}"
    observations = json.loads((directory / "observations.json").read_text())
    timeline_path = directory / "timeline.json"
    timeline = json.loads(timeline_path.read_text() if timeline_path.exists() else gzip.decompress((directory / "timeline.json.gz").read_bytes()))
    connection = sqlite3.connect(f"file:{directory / 'conversation.db'}?mode=ro", uri=True)
    batches = []
    current = {}
    for path, seq, data in connection.execute(
        "SELECT path, seq, data FROM flue_conversation_stream_batches ORDER BY path, seq"
    ):
        records = json.loads(data)
        writes = [record for record in records if record["type"] == "state_write" and record["name"] == key]
        if writes:
            assert any(record["type"] == "tool_results_committed" for record in records)
            batches.append({"path": path, "seq": seq, "records": records})
        for record in writes:
            revision = record["value"]
            assert revision["sha256"] == hashlib.sha256(revision["markdown"].encode("utf-8")).hexdigest()
            current[record["conversationId"]] = revision
    connection.close()
    (directory / "state-records.json").write_text(json.dumps(batches, indent=2) + "\n")
    for observation in observations["observations"]:
        case_id = observation["caseId"]
        revision = current[observation["history"]["conversationId"]]
        mixed = len(observation["generated"]) > 1 and any(call["name"] == "addType" for call in observation["generated"])
        expected_revision = f"{case_id}-old-revision" if mode == "provider-reject" and mixed else f"{case_id}-update_workpiece" if any(call["name"] == "update_workpiece" for call in observation["generated"]) else f"{case_id}-old-revision"
        assert revision["revisionId"] == expected_revision
        attempted_call_ids = {call["id"] for call in observation["generated"]}
        wire = [event for event in timeline if event["caseId"] == case_id and event["type"] == "wire" and event["detail"].get("toolCallId") in attempted_call_ids]
        if mode == "provider-reject" and mixed:
            assert not wire
        summary.append({
            "control": mode,
            "caseId": case_id,
            "providerCallsBeforeClientResult": observation["providerCallsBeforeClientResult"],
            "pendingMutationIds": observation["pendingMutationIds"],
            "mutationApplied": observation["mutationApplied"],
            "submissionError": observation["attempt"]["error"],
            "currentRevision": revision,
            "attemptedWireEvents": [{"sequence": event["sequence"], "chunk": event["detail"]} for event in wire],
            "actualBrowserApplied": None,
        })
(root / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
print(f"Inspected {len(summary)} cases, exact Markdown hashes, state/result batch co-commit and refused-proposal wire absence.")
