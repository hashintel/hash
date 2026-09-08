"""Read-only adjudication of one freshly executed A4 diagnostic packet, never a store importer."""
import hashlib
import json
from pathlib import Path
import sys

root = Path(sys.argv[1])

def load(path):
    return json.loads(path.read_text())

def records(path):
    return [record for batch in load(path)["batches"] for record in batch["data"]]

def one(pattern):
    paths = list(root.glob(pattern))
    assert len(paths) == 1, (pattern, paths)
    return paths[0]

def last_revision(snapshot):
    messages = [message for message in snapshot["messages"] if message.get("signal", {}).get("tagName") == "brunch.construction-context"]
    return json.loads("".join(part["text"] for part in messages[-1]["parts"] if part["type"] == "text"))["currentWorkpiece"]

browser = root / "browser"
before = load(browser / "conflicting-history.json")
after = load(browser / "retention-after.json")
reopened = load(browser / "retention-reopen-before.json")
assert reopened == after
by_id = {message["id"]: message for message in after["messages"]}
assert all(by_id[message["id"]] == message for message in before["messages"])
assert last_revision(before) == last_revision(after) == last_revision(reopened)
contexts = load(browser / "retention-fold-contexts.json")
last_context = [entry["context"] for entry in contexts if entry["purpose"] == "agent"][-1]
serialized = json.dumps(last_context)
assert "A4 new-record controlled summary" in serialized
assert "m7-browser-arc" not in serialized
assert "m7-browser-unknown-revision" not in serialized
assert "transitionRecord" not in json.dumps(last_context["messages"])
assert '"id": "m7-browser-revision"' not in serialized
assert "Settle the labelled prepared workpiece for this unpaid mechanical tracer" not in serialized
revision = last_revision(after)
assert hashlib.sha256(revision["markdown"].encode()).hexdigest() == revision["sha256"]
compactions = [event for event in load(browser / "retention-fold-events.json") if event["type"] in ("compaction_start", "compaction")]
assert any(event.get("reason") == "threshold" for event in compactions)
assert not any(event.get("reason") == "overflow" for event in compactions)
for phase in ("fold", "reopen"):
    result = load(browser / f"retention-{phase}-result.json")
    assert result["authorization"] == {"missing": 401, "foreignPrincipal": 403, "foreignConversation": 403, "wrongUid": 404}
    assert result["historyProviderCalls"] == result["reissuedTools"] == 0

crashes = []
for kind, expected_ordinal in (("observe", 2), ("after-outcome", 1), ("before-outcome", 2), ("repair", 1)):
    directory = one(f"crash-{kind}-*")
    label = "recover-plain" if kind == "repair" else "recover-observe"
    result = load(directory / f"{label}-result.json")
    next_tool = result["nextTools"][-1]
    assert next_tool["output"]["ordinal"] == expected_ordinal
    state = records(directory / f"{label}-store-after-recovery.json")
    state_writes = [record for record in state if record["type"] == "state_write"]
    revision_writes = [record for record in state_writes if record.get("value", {}).get("revisionId") == "a4-crash-revision"]
    assert len(revision_writes) == (1 if expected_ordinal == 2 else 0)
    assert result["recoveredTools"][0]["output"]["ordinal"] == 1
    if expected_ordinal == 1:
        assert last_revision(load(directory / f"{label}-history.json")) is None
    fault_markers = []
    for path in directory.glob("*-runtime-trace.jsonl"):
        fault_markers.extend(json.loads(line) for line in path.read_text().splitlines() if '"fault"' in line)
    if kind != "observe":
        assert fault_markers, "A nonzero exit alone is not fault-boundary evidence"
    # No state write may be silently assumed from a buffered setter.
    pre = records(directory / f"{label}-store-before-boot.json")
    crashes.append({"case": kind, "directory": directory.name, "faultMarkers": fault_markers, "durableBeforeRecovery": [{"type": record["type"], "id": record["id"]} for record in pre if record["type"] in ("tool_outcome", "state_write", "tool_results_committed", "submission_settled")], "successfulRecoveredPointer": result["recoveredTools"][0]["output"], "revisionStateWritesAfterRecovery": revision_writes, "nextOrdinal": expected_ordinal, "consistency": "Fail" if expected_ordinal == 1 else "Pass for this control only"})

overflow = one("overflow-*")
trace = [json.loads(line) for line in (overflow / "create-observe-runtime-trace.jsonl").read_text().splitlines()]
continuation = [event for event in trace if event["boundary"] == "continueRebuilt"]
assert len(continuation) == 1
assert continuation[0]["restartPresent"] is False
assert [message["role"] for message in continuation[0]["messages"]] == ["user", "user", "assistant"]
assert "Cannot continue from message role: assistant" in (overflow / "create.log").read_text()
overflow_before = load(overflow / "before.json")
overflow_after = load(overflow / "create-final-history.json")
overflow_by_id = {message["id"]: message for message in overflow_after["messages"]}
assert all(overflow_by_id[message["id"]] == message for message in overflow_before["messages"])
report = {
    "scope": "Prepared synthetic-model records, pre-native integration; not genuine testimony, product why, general crash safety or Step A acceptance",
    "threshold": {"verdict": "Pass preliminary", "compactions": compactions, "sourceInventory": [{"id": message["id"], "role": message["role"], "purpose": message.get("purpose"), "signal": message.get("signal"), "toolCallIds": [part["toolCallId"] for part in message["parts"] if part["type"] == "dynamic-tool"], "recordSha256": hashlib.sha256(json.dumps(message, sort_keys=True).encode()).hexdigest()} for message in before["messages"]], "lostPublicIds": [], "changedPublicRecords": [], "foldedFromModelContext": ["original revision tool call/input", "original synthetic user prompt", "m7-browser-unknown-revision", "m7-browser-arc", "client-result transitionRecord sidecars"], "currentRevision": revision},
    "materialization": {"verdict": "Pass retained-live-store and authorization, Partial full materialization/product why", "historyExact": True, "browserAfterProcessRestart": "not exercised; public hydration has no executable mutation and no tool reissue; actual browser reload/dedup precedes process stop", "why": "not implemented; no success claim"},
    "crashDiagnostics": crashes,
    "overflow": {"verdict": "Fail continuation, Pass source retention in this probe", "continuation": continuation, "lostPublicIds": []},
}
output = root / "audit.json"
assert not output.exists(), "Never overwrite a completed audit"
output.write_text(json.dumps(report, indent=2) + "\n")
print(f"A4 evidence discriminators confirmed, including two consistency failures: {output}")
