#!/usr/bin/env python3
"""Read-only A5 observation audit and falsifiers. Never opens, copies or imports a DB/profile.

The primary oracle remains the built ChatAgent test. This independently checks its retained
outputs and rejects coordinated omissions across snapshots using pre-compaction canonical pins.
Accepts original JSON or losslessly gzipped evidence, without restoring anything into an app.
"""
import copy
import gzip
import hashlib
import json
from pathlib import Path
import sys


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def text(message):
    return "".join(part["text"] for part in message["parts"] if part["type"] == "text")


def tools(snapshot):
    return [part for message in snapshot["messages"] for part in message["parts"] if part["type"] == "dynamic-tool"]


def tool(snapshot, call_id):
    found = [part for part in tools(snapshot) if part["toolCallId"] == call_id]
    require(len(found) == 1 and found[0]["state"] == "output-available", f"exact completed tool: {call_id}")
    return found[0]


snapshot_names = ["create-history", "fold-before", "fold-immediate-history", "fold-history", "reopen-before", "reopen-history"]
query_names = ["process-restarted-before-fold", "fold-after-compaction", "reopen-after-compaction"]
names = snapshot_names + query_names + ["seed", "fold-completion-pins", "fold-canonical-settlements", "reopen-canonical-settlements", "fold-contexts", "reopen-contexts", "fold-events"] + [f"{phase}-{kind}" for phase in ["create", "fold", "reopen"] for kind in ["process", "result"]]


def audit(data):
    seed = data["seed"]
    pids = [data[f"{phase}-process"]["pid"] for phase in ["create", "fold", "reopen"]]
    require(len(set(pids)) == 3, "distinct actual process IDs")
    for phase, pid in zip(["create", "fold", "reopen"], pids):
        require(data[f"{phase}-result"]["pid"] == pid, "process/result PID correlation")
        require(data[f"{phase}-process"]["dbPath"] == seed["dbPath"], "same original store path")
        require(data[f"{phase}-result"]["outcome"] == "pass", "actual phase pass")
    require(seed["pid"] == pids[0], "seed PID correlation")
    baseline = data["create-history"]
    source = [message for message in baseline["messages"] if message["id"] == seed["sourceId"]]
    require(len(source) == 1, "source exact identity/content")
    source = source[0]
    require(source["role"] == "user" and source["purpose"] == "user", "source authorized role/purpose")
    source_text = "TEST synthetic original testimony control: When final inspection starts, reserve one available crew until sign-off."
    require(text(source) == source_text, "source exact identity/content")
    protected = [part for part in tools(baseline) if part["toolName"] in ["update_workpiece", "addArc", "getLatestNetDefinition"]]
    require(len(protected) == 6, "three revisions, two reads, one mutation; no tool reissue")
    for number in [1, 2, 3]:
        revision = tool(baseline, f"retention-revision-{number}")
        pointer = revision["output"]
        require(pointer["revisionId"] == revision["toolCallId"] and pointer["ordinal"] == number, "revision identity/ordinal")
        require(hashlib.sha256(revision["input"]["markdown"].encode()).hexdigest() == pointer["sha256"], "revision content hash")
        require(pointer["evidenceValidated"] is True, "validated revision evidence")
        require(pointer["evidence"] == seed["governing"]["evidence"] and len(pointer["evidence"]) == 2, "overlapping carried evidence exact")
        if number > 1:
            require("evidence" not in revision["input"], "raw carried input not rewritten")
    original = tool(baseline, "retention-live-why")["output"]
    require(original["reconciliation"]["status"] == "live-observed", "creation actual live observation")
    for name in snapshot_names:
        snapshot = data[name]
        require([message for message in snapshot["messages"] if message["id"] == seed["sourceId"]] == [source], "source exact identity/content")
        require([part for part in tools(snapshot) if part["toolName"] in ["update_workpiece", "addArc", "getLatestNetDefinition"]] == protected, "protected tools exact; no reissue")
        for message in baseline["messages"]:
            require([entry for entry in snapshot["messages"] if entry["id"] == message["id"]] == [message], "baseline public messages exact")
    for name in query_names:
        query = data[name]
        require(query["read"]["currentWorkpiece"] == original["currentWorkpiece"], "actual current state exact")
        for label in ["why", "oldObservationWhy"]:
            answer = query[label]
            require(answer["governing"] == original["governing"], "governing revision/hash/passages/relations exact")
            require(answer["recordedChange"] == original["recordedChange"], "actual recorded effects exact")
            require(answer["reconciliation"]["status"] == "as-of", "restart is as-of, not fresh browser")
            require(answer["disposition"] == "partially-supported" and answer["untrusted"] is True, "honest partial untrusted standing")
        require(query["oldObservationWhy"]["reconciliation"]["observationScope"] == "as-of", "old ID cannot earn freshness")
        require(query["refusedObservationWhy"]["disposition"] == "refused", "unknown observation refuses")
        if name != "process-restarted-before-fold":
            require(query["read"]["earlierSourcesOmitted"] > 0 and all(item["id"] != seed["sourceId"] for item in query["read"]["sources"]), "source window limit explicit")
            phase = "fold" if name.startswith("fold") else "reopen"
            request = data[f"{phase}-contexts"][query["beforeRequestContextIndex"]]
            require(request["purpose"] == "agent", "actual query request context")
            serialized = json.dumps(request["context"]["messages"])
            require("A5 controlled lossy summary" in serialized, "real folded summary consumed")
            require(source_text not in serialized, "original true-user source entry absent from query context")
            require(not any(message.get("role") == "toolResult" and message.get("toolName") in ["brunch_workpiece", "brunch_why"] for message in request["context"]["messages"]), "prior workpiece/why results absent from query context")
            require(not any(call_id in serialized for call_id in query["priorQueryIds"]), "prior query IDs absent even with redacted source text")
            # Authoritative current revision remains injected by the product, including
            # passage and evidence pointers. This is not source-entry or answer retention.
    starts = [event for event in data["fold-events"] if event["type"] == "compaction_start"]
    compactions = [event for event in data["fold-events"] if event["type"] == "compaction"]
    require(len(starts) >= 2 and all(event["reason"] == "threshold" for event in starts), "real threshold compaction, never overflow substitute")
    require(len(compactions) >= 2 and all(not event["isError"] and event["messagesAfter"] < event["messagesBefore"] for event in compactions), "successful real context folding")
    pins = data["fold-completion-pins"]
    require(len(pins) >= 22, "nonempty independent completion pins")
    for pin in pins:
        records = pin["records"]
        start = [record for record in records if record["type"] == "assistant_message_started"]
        end = [record for record in records if record["type"] == "assistant_message_completed"]
        require(len(start) == len(end) == 1, "canonical completion exists exactly once")
        start, end = start[0], end[0]
        body = "".join(record["delta"] for record in records if record["type"] == "assistant_text_delta")
        expected = dict(id=start["messageId"], role="assistant", purpose="assistant", display="visible", submissionId=start["submissionId"], turnId=start["turnId"], parts=[dict(type="text", text=body, state="done")])
        require(pin["message"] == expected and end["messageId"] == start["messageId"] and end["stopReason"] == "stop", "pin matches independent canonical completion")
        require(pin["event"]["turnId"] == start["turnId"] and pin["event"]["submissionId"] == start["submissionId"], "completion event correlation")
        for name in ["fold-history", "reopen-before", "reopen-history"]:
            snapshot = data[name]
            require([message for message in snapshot["messages"] if message["id"] == expected["id"]] == [expected], "independently pinned completed response exact")
            require([item for item in snapshot["settlements"] if item["submissionId"] == expected["submissionId"]] == [dict(submissionId=expected["submissionId"], outcome="completed", answeredBySubmissionId=expected["submissionId"])], "independently pinned completed settlement exact")
        for phase in ["fold", "reopen"]:
            settlements = [item for item in data[f"{phase}-canonical-settlements"] if item["submissionId"] == expected["submissionId"]]
            require(len(settlements) == 1 and settlements[0]["outcome"] == "completed", "canonical settlement exact")
    return dict(pids=pids, sameOriginalStore=seed["dbPath"], completionPins=len(pins), thresholdCompactions=len(compactions), sourceId=seed["sourceId"], governingRevision=seed["governing"]["revisionId"])


def falsify(original):
    results = []
    for mode, expected in [
        ("source-omission", "source exact"), ("source-change", "source exact"),
        ("carried-relation-loss", "overlapping carried evidence"),
        ("completion-omission", "independently pinned completed response"),
        ("completion-duplicate", "independently pinned completed response"),
        ("settlement-omission", "independently pinned completed settlement"),
        ("same-pid", "distinct actual process"), ("false-live", "restart is as-of"),
        ("source-still-in-context", "original true-user source entry absent"),
        ("redacted-answer-still-in-context", "prior workpiece/why results absent"),
    ]:
        data = copy.deepcopy(original)
        source_id = data["seed"]["sourceId"]
        pin = data["fold-completion-pins"][0]["message"]
        for name in snapshot_names:
            snapshot = data[name]
            if mode == "source-omission":
                snapshot["messages"] = [message for message in snapshot["messages"] if message["id"] != source_id]
            if mode == "source-change":
                for message in snapshot["messages"]:
                    if message["id"] == source_id:
                        message["parts"] = [dict(type="text", text="Mutated source", state="done")]
            if mode == "carried-relation-loss":
                tool(snapshot, "retention-revision-2")["output"]["evidence"].pop()
            if mode == "completion-omission":
                snapshot["messages"] = [message for message in snapshot["messages"] if message["id"] != pin["id"]]
            if mode == "completion-duplicate" and any(message["id"] == pin["id"] for message in snapshot["messages"]):
                snapshot["messages"].append(copy.deepcopy(pin))
            if mode == "settlement-omission":
                snapshot["settlements"] = [item for item in snapshot["settlements"] if item["submissionId"] != pin["submissionId"]]
        if mode == "same-pid":
            data["reopen-process"]["pid"] = data["create-process"]["pid"]
        if mode == "false-live":
            data["reopen-after-compaction"]["why"]["reconciliation"]["status"] = "live-observed"
        if mode == "source-still-in-context":
            index = data["reopen-after-compaction"]["beforeRequestContextIndex"]
            data["reopen-contexts"][index]["context"]["messages"].append(dict(role="user", content=text(next(message for message in original["create-history"]["messages"] if message["id"] == source_id))))
        if mode == "redacted-answer-still-in-context":
            index = data["reopen-after-compaction"]["beforeRequestContextIndex"]
            answer = copy.deepcopy(data["reopen-after-compaction"]["why"])
            for passage in answer["governing"]["passages"]:
                for relation in passage["relations"]:
                    relation["sources"] = []
            data["reopen-contexts"][index]["context"]["messages"].append(dict(role="toolResult", toolName="brunch_why", toolCallId="retention-live-why", content=[dict(type="text", text=json.dumps(answer))]))
        try:
            audit(data)
        except AssertionError as error:
            require(expected in str(error), f"Wrong discriminator for {mode}: {error}")
            results.append(dict(mode=mode, rejected=True, reason=str(error)))
        else:
            raise AssertionError(f"Falsifier escaped: {mode}")
    return results


if __name__ == "__main__":
    directory = Path(sys.argv[1])
    def load(name):
        path = directory / f"{name}.json"
        return json.loads(path.read_bytes() if path.exists() else gzip.decompress(path.with_suffix(".json.gz").read_bytes()))
    data = {name: load(name) for name in names}
    print(json.dumps(dict(observationAudit=audit(data), falsifiers=falsify(data)), indent=2))
