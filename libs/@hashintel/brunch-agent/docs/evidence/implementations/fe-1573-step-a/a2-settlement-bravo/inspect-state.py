"""Read-only diagnostic of this probe's SQLite, never a product history adapter."""
import hashlib
import json
import pathlib
import sqlite3
import sys

root = pathlib.Path(sys.argv[1]).resolve()
connection = sqlite3.connect(f"file:{root / 'conversation.db'}?mode=ro", uri=True)
observations = json.loads((root / "observations.json").read_text())
batches = []
for path, seq, data in connection.execute(
    "SELECT path, seq, data FROM flue_conversation_stream_batches "
    "WHERE data LIKE '%brunch.workpiece.current.v1%' ORDER BY path, seq"
):
    records = json.loads(data)
    writes = [record for record in records if record["type"] == "state_write"]
    assert any(record["type"] == "tool_results_committed" for record in records)
    for record in writes:
        revision = record["value"]
        assert revision["sha256"] == hashlib.sha256(revision["markdown"].encode("utf-8")).hexdigest()
    batches.append({"path": path, "seq": seq, "records": records})
first = [record["value"] for batch in batches for record in batch["records"]
         if record["type"] == "state_write" and record["value"]["revisionId"] == "settled-revision"]
assert len(first) == 1
assert first[0]["markdown"] == observations["markdown"]
assert first[0]["ordinal"] == 1
print(json.dumps({"scope": "SQLite diagnostic, not public API or compaction/recovery proof", "batches": batches}, indent=2))
connection.close()
