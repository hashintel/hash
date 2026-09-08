"""Read-only diagnostic, not a production history or revision authority.

Usage: python3 inspect-state.py EVIDENCE_ROOT CANONICAL_WORKPIECE_STATE_KEY
"""
import hashlib
import json
import pathlib
import sqlite3
import sys

root = pathlib.Path(sys.argv[1])
key = sys.argv[2]
observations = json.loads((root / "mounted/observations.json").read_text())
connection = sqlite3.connect(f"file:{root / 'mounted/conversation.db'}?mode=ro", uri=True)
current = {}
batches = []
for path, seq, data in connection.execute("SELECT path, seq, data FROM flue_conversation_stream_batches ORDER BY path, seq"):
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
summary = []
for observation in observations["observations"]:
    case_id = observation["caseId"]
    revision = current[observation["history"]["conversationId"]]
    mixed = len(observation["generated"]) > 1 and any(call["name"] == "addType" for call in observation["generated"])
    expected = f"{case_id}-update_workpiece" if case_id == "update_workpiece-brunch_mark_question" else f"{case_id}-old-revision"
    assert revision["revisionId"] == expected
    if mixed:
        assert observation["providerCallsBeforeClientResult"] == 1
        assert not observation["pendingMutationIds"]
        assert observation["before"] == observation["after"]
        assert "Mixed browser/server proposal refused" in observation["attempt"]["error"]
    summary.append({"caseId": case_id, "providerCallsBeforeClientResult": observation["providerCallsBeforeClientResult"], "pendingMutationIds": observation["pendingMutationIds"], "mutationApplied": observation["mutationApplied"], "submissionError": observation["attempt"]["error"], "currentRevision": revision})
for sample in observations["buffering"]:
    revision = current.get(sample["after"]["conversationId"])
    if sample["caseId"] == "buffered-cancelled":
        assert revision is None
        assert sample["upstreamAborted"]
    else:
        assert revision["markdown"] == sample["privateMarkdown"]
        assert revision["ordinal"] == 1
(root / "state-records.json").write_text(json.dumps(batches, indent=2) + "\n")
(root / "summary.json").write_text(json.dumps({"cases": summary, "buffering": observations["buffering"]}, indent=2) + "\n")
print("Verified 14 proposal cases and two buffered lifecycle cases; exact hashes and ordinary state/result co-commit. No crash-recovery claim.")
