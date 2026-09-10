"""Read-only safety adjudication of freshly executed original stores; never an importer."""
import hashlib
import json
from pathlib import Path
import sys

root = Path(sys.argv[1])
mode = sys.argv[2] if len(sys.argv) > 2 else "all"
assert mode in ("all", "recovery")


def load(path):
    return json.loads(path.read_text())


def one(pattern):
    paths = list(root.glob(pattern))
    assert len(paths) == 1, (pattern, paths)
    return paths[0]


def last_revision(snapshot):
    messages = [message for message in snapshot["messages"] if message.get("signal", {}).get("tagName") == "brunch.construction-context"]
    return json.loads("".join(part["text"] for part in messages[-1]["parts"] if part["type"] == "text"))["currentWorkpiece"]


def preserved(before, after):
    by_id = {message["id"]: message for message in after["messages"]}
    assert all(by_id.get(message["id"]) == message for message in before["messages"]), "Public sources lost or changed"


def crash(kind):
    directory = one(f"crash-{kind}-*")
    label = "recover-plain"
    result = load(directory / f"{label}-result.json")
    receipt = load(directory / "receipt.json")
    markdown = receipt["markdown"]
    pointer = {"revisionId": "a4-crash-revision", "sha256": hashlib.sha256(markdown.encode()).hexdigest(), "ordinal": 1}
    expected = {**pointer, "markdown": markdown}
    recovered = load(directory / f"{label}-history.json")
    assert result["recoveredTools"][0]["input"] == {"markdown": markdown}
    assert result["recoveredTools"][0]["output"] == pointer
    assert last_revision(recovered) == expected, "Successful recovered result without exact current state"
    assert result["nextTools"][-1]["toolCallId"] == "a4-next-revision"
    assert result["nextTools"][-1]["output"]["ordinal"] == 2, "Distinct next revision must advance to ordinal 2"
    assert [tool["toolCallId"] for tool in result["nextTools"]] == ["a4-crash-revision", "a4-next-revision"]
    batches = load(directory / f"{label}-store-after-recovery.json")["batches"]
    outcomes = [batch for batch in batches if any(record["type"] == "tool_outcome" and record["toolCallId"] == "a4-crash-revision" for record in batch["data"])]
    assert len(outcomes) == 1, "Exactly one durable outcome, no completed call replay"
    state_writes = [record for batch in batches for record in batch["data"] if record["type"] == "state_write" and record.get("value", {}).get("revisionId") == "a4-crash-revision"]
    assert len(state_writes) == 1 and state_writes[0]["value"] == expected
    assert state_writes[0] in outcomes[0]["data"], "State must be atomic with the outcome, not a later flush"
    if kind.startswith("repair-") or kind == "before-outcome":
        assert any(record["type"] == "tool_results_committed" for record in outcomes[0]["data"]), "Reexecuted state/outcome/result must share the repaired canonical batch"
    faults = [json.loads(line) for path in directory.glob("*-runtime-trace.jsonl") for line in path.read_text().splitlines() if '"fault"' in line]
    expected_faults = {
        "plain": [], "observe": [], "after-outcome": ["after-outcome"],
        "before-outcome": ["before-outcome"], "direct-after-outcome": ["direct-after-outcome"],
        "repair-after-repair": ["before-outcome", "after-repair"],
        "repair-after-outcome": ["before-outcome", "after-outcome"],
    }[kind]
    assert sorted(event["boundary"] for event in faults) == sorted(expected_faults), "Exact kill boundaries, not just nonzero exits"
    pre = load(directory / f"{label}-store-before-boot.json")["batches"]
    for batch in pre:
        if any(record["type"] == "tool_outcome" and record["toolCallId"] == "a4-crash-revision" for record in batch["data"]):
            assert any(record["type"] == "state_write" and record.get("value") == expected for record in batch["data"]), "Atomic invariant must hold before replacement application boot too"
    assert load(directory / f"{label}-safety.json")["verdict"] == "Pass"
    return {"case": kind, "verdict": "Pass", "pointer": pointer, "nextOrdinal": 2, "atomicBatchSequence": outcomes[0]["seq"], "faults": faults, "recoveryInstrumentation": False}


def completed_response(directory, snapshots, before_compaction=True):
    pin = load(directory / "completed-response.json")
    event = pin["event"]
    assert event["type"] == "turn" and event["purpose"] == "agent"
    assert event["response"]["finishReason"] == "stop" and event["isError"] is False
    assert event["response"]["output"]["content"] == [{"type": "text", "text": "A4 filler acknowledged."}]
    records = pin["records"]
    starts = [record for record in records if record["type"] == "assistant_message_started"]
    ends = [record for record in records if record["type"] == "assistant_message_completed"]
    assert len(starts) == len(ends) == 1
    start, end = starts[0], ends[0]
    assert end["stopReason"] == "stop" and end["messageId"] == start["messageId"]
    assert start["turnId"] == end["turnId"] == event["turnId"]
    assert start["submissionId"] == end["submissionId"] == event["submissionId"]
    assert start["conversationId"] == event["conversationId"]
    text_starts = [record for record in records if record["type"] == "assistant_text_started"]
    text_ends = [record for record in records if record["type"] == "assistant_text_completed"]
    deltas = [record for record in records if record["type"] == "assistant_text_delta"]
    assert len(text_starts) == len(text_ends) == 1
    assert text_ends[0]["deltaCount"] == len(deltas)
    assert all(record["messageId"] == start["messageId"] and record["blockId"] == text_starts[0]["blockId"] and record["sequence"] == index for index, record in enumerate(deltas))
    text = "".join(record["delta"] for record in deltas)
    assert text == "A4 filler acknowledged."
    # Derive from the independently captured canonical completion, NOT any post-loss history.
    public_start = start
    parts = []
    errors = pin["priorErrorRecords"]
    if before_compaction:
        assert errors == []
    else:
        error_starts = [record for record in errors if record["type"] == "assistant_message_started"]
        error_ends = [record for record in errors if record["type"] == "assistant_message_completed"]
        assert len(error_starts) == len(error_ends) == 1
        public_start = error_starts[0]
        assert public_start["submissionId"] == start["submissionId"]
        assert error_ends[0]["messageId"] == public_start["messageId"] and error_ends[0]["stopReason"] == "error"
        assert error_ends[0]["error"] == "Synthetic explicit overflow (request_too_large)"
        assert "".join(record["delta"] for record in errors if record["type"] == "assistant_text_delta") == ""
        parts.append({"type": "text", "text": "", "state": "done"})
    parts.append({"type": "text", "text": text, "state": "done"})
    message = {"id": public_start["messageId"], "role": "assistant", "purpose": "assistant", "display": "visible", "submissionId": start["submissionId"], "turnId": public_start["turnId"], "parts": parts}
    assert pin["message"] == message
    settlement_pin = load(directory / "completed-response-settlement.json")
    assert settlement_pin["receipt"]["submissionId"] == start["submissionId"]
    settlements = settlement_pin["records"]
    assert len(settlements) == 1 and settlements[0]["type"] == "submission_settled"
    assert settlements[0]["submissionId"] == start["submissionId"] and settlements[0]["conversationId"] == start["conversationId"] and settlements[0]["outcome"] == "completed"
    expected_settlement = {"submissionId": start["submissionId"], "outcome": "completed", "answeredBySubmissionId": start["submissionId"]}
    for name in snapshots:
        snapshot = load(directory / name)
        assert snapshot["conversationId"] == start["conversationId"]
        assert [item for item in snapshot["messages"] if item["id"] == message["id"]] == [message], f"{name}: pinned completed response missing, duplicated, replaced or changed"
        assert sum(any(part.get("type") == "text" and part.get("text") == text for part in item["parts"]) for item in snapshot["messages"]) == 1, f"{name}: response identity replaced or duplicated"
        assert [item for item in snapshot["settlements"] if item["submissionId"] == start["submissionId"]] == [expected_settlement], f"{name}: completed settlement missing or changed"
    if before_compaction:
        first_fold = next(item for item in load(directory / "create-events.json") if item["type"] == "compaction_start")
        assert event["eventIndex"] < first_fold["eventIndex"], "Pin must precede compaction, not rebaseline its output"
    return {"canonicalSuccessfulMessageId": start["messageId"], "canonicalSuccessfulTurnId": event["turnId"], "message": message, "settlement": expected_settlement, "checkedSnapshots": snapshots, "source": "Canonical completion records read at the real post-append turn event"}


def overflow(kind):
    directory = one(f"overflow-{kind}-*")
    before = load(directory / "before.json")
    after = load(directory / "after.json")
    preserved(before, after)
    assert load(directory / "reopened.json") == after
    events = load(directory / "create-events.json")
    assert any(event["type"] == "compaction_start" and event["reason"] == "overflow" for event in events)
    folds = [event for event in events if event["type"] == "compaction" and not event["isError"]]
    if kind == "silent":
        assert any(event["messagesBefore"] == 20 and event["messagesAfter"] == 3 for event in folds)
    else:
        assert any(event["messagesBefore"] > event["messagesAfter"] for event in folds)
    trace = [json.loads(line) for line in (directory / "create-observe-runtime-trace.jsonl").read_text().splitlines()]
    continuations = [event for event in trace if event["boundary"] == "continueRebuilt"]
    if kind == "silent":
        assert not continuations, "Completed successful stop must not be retried from an assistant tail"
    else:
        assert len(continuations) == 1 and continuations[0]["messages"][-1]["role"] in ("user", "toolResult"), "Explicit error must retry from a valid retained canonical tail"
    assert "Cannot continue from message role: assistant" not in (directory / "create.log").read_text()
    assert load(directory / "reopen-result.json")["historyEqual"] is True
    completion = completed_response(directory, ["after-threshold.json", "after.json", "reopened.json", "continued.json"], before_compaction=kind == "silent")
    return {"verdict": "Pass", "completedResponse": completion, "scope": f"{kind} overflow; not universal provider-error recovery.", "continuations": continuations, "compactions": folds, "publicRecordsPreserved": len(before["messages"]), "inventedUserMessages": 0, "completedToolReissues": 0}


def cancelled_overflow():
    directory = one("overflow-cancelled-*")
    result = load(directory / "cancellation.json")
    assert result["verdict"] == "Pass" and result["compactionAborted"]
    preserved(load(directory / "before.json"), load(directory / "cancelled-history.json"))
    events = result["eventsAtStop"]
    assert any(event["type"] == "compaction_start" and event["reason"] == "overflow" for event in events)
    assert not any(event["type"] == "compaction" and not event["isError"] for event in events)
    result["completedResponse"] = completed_response(directory, ["cancelled-history.json", "after.json", "reopened.json", "continued.json"])
    assert load(directory / "reopened.json") == load(directory / "after.json")
    preserved(load(directory / "before.json"), load(directory / "continued.json"))
    return result


def browser():
    directory = root / "browser"
    before = load(directory / "conflicting-history.json")
    after = load(directory / "retention-after.json")
    reopened = load(directory / "retention-reopen-before.json")
    assert reopened == after
    preserved(before, after)
    assert last_revision(before) == last_revision(after) == last_revision(reopened)
    revision = last_revision(after)
    assert hashlib.sha256(revision["markdown"].encode()).hexdigest() == revision["sha256"]
    contexts = load(directory / "retention-fold-contexts.json")
    last_context = [entry["context"] for entry in contexts if entry["purpose"] == "agent"][-1]
    serialized = json.dumps(last_context)
    assert "A4 new-record controlled summary" in serialized
    for folded in ("m7-browser-arc", "m7-browser-unknown-revision", '"id": "m7-browser-revision"', "Settle the labelled prepared workpiece for this unpaid mechanical tracer"):
        assert folded not in serialized
    assert "mutationRecord" not in json.dumps(last_context["messages"])
    compactions = [event for event in load(directory / "retention-fold-events.json") if event["type"] in ("compaction_start", "compaction")]
    assert any(event.get("reason") == "threshold" for event in compactions)
    assert not any(event.get("reason") == "overflow" for event in compactions)
    for phase in ("fold", "reopen"):
        result = load(directory / f"retention-{phase}-result.json")
        assert result["authorization"] == {"missing": 401, "foreignPrincipal": 403, "foreignConversation": 403, "wrongUid": 404}
        assert result["historyProviderCalls"] == result["reissuedTools"] == 0
    return {"verdict": "Pass", "compactions": compactions, "publicRecordsPreserved": len(before["messages"]), "currentRevision": revision, "scope": "Actual local Chrome with synthetic native SDK responses; original-store reopen, not second live browser after process restart or product why"}


report = {"scope": "Local forward recovery safety in new original SQLite stores; synthetic provider; not legacy-store repair, power loss, genuine testimony or Mission acceptance", "checks": [], "failures": []}
checks = [(kind, lambda kind=kind: crash(kind)) for kind in ("plain", "observe", "after-outcome", "before-outcome", "direct-after-outcome", "repair-after-repair", "repair-after-outcome")]
checks.extend([(f"overflow-{kind}", lambda kind=kind: overflow(kind)) for kind in ("silent", "explicit")])
checks.append(("overflow-cancelled", cancelled_overflow))
if mode == "all":
    checks.append(("browser-threshold-reopen", browser))
for name, check in checks:
    try:
        report["checks"].append({"name": name, "result": check()})
    except (AssertionError, KeyError, IndexError, FileNotFoundError) as error:
        report["failures"].append({"name": name, "error": str(error)})
report["verdict"] = "Fail" if report["failures"] else "Pass"
output = root / "audit.json"
assert not output.exists(), "Never overwrite a completed audit"
output.write_text(json.dumps(report, indent=2) + "\n")
print(f"A4 recovery safety {report['verdict']}: {len(report['checks'])} passed, {len(report['failures'])} failed; {output}")
sys.exit(1 if report["failures"] else 0)
