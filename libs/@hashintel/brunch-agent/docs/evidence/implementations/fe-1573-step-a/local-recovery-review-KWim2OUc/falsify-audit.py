"""Mutate copied observation JSON only; no database copy, application boot, or canonical writes."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

source = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
assert not output.exists()
output.mkdir()
script = Path("apps/brunch-agent/test/history-retention-audit.py").resolve()
sha = lambda data: hashlib.sha256(data).hexdigest()
original = {str(path.relative_to(source)): sha(path.read_bytes()) for path in source.rglob("*") if path.is_file() and ".db" not in path.name}
report = []
for kind in ("silent", "cancelled"):
    directory = next(source.glob(f"overflow-{kind}-*"))
    pin = json.loads((directory / "completed-response.json").read_text())
    message_id = pin["message"]["id"]
    submission_id = pin["message"]["submissionId"]
    names = ["after-threshold.json" if kind == "silent" else "cancelled-history.json", "after.json", "reopened.json", "continued.json"]
    for name in [*names, "all-observations"]:
        for fault in ("missing", "replaced", "changed", "duplicate", "settlement"):
            retained = output / f"{kind}-{Path(name).stem}-{fault}"
            retained.mkdir()
            with tempfile.TemporaryDirectory(prefix="a4-observation-falsifier-") as temporary:
                copied = Path(temporary) / "observations-only"
                shutil.copytree(source, copied, ignore=shutil.ignore_patterns("*.db", "*.db-*", "*.sqlite*", "*.mjs", "instrument", "audit.json"))
                assert not list(copied.rglob("*.db*"))
                mutations = []
                for target_name in names if name == "all-observations" else [name]:
                    target = copied / directory.name / target_name
                    snapshot = json.loads(target.read_text())
                    matches = [message for message in snapshot["messages"] if message["id"] == message_id]
                    assert len(matches) == 1
                    message = matches[0]
                    if fault == "missing":
                        snapshot["messages"] = [item for item in snapshot["messages"] if item["id"] != message_id]
                    elif fault == "replaced":
                        message["id"] = "review-replaced-response"
                    elif fault == "changed":
                        message["parts"][-1]["text"] = "Review changed the completed response."
                    elif fault == "duplicate":
                        snapshot["messages"].append(message)
                    else:
                        settlement = next(item for item in snapshot["settlements"] if item["submissionId"] == submission_id)
                        settlement["outcome"] = "aborted"
                    target.write_text(json.dumps(snapshot, indent=2) + "\n")
                    shutil.copyfile(target, retained / target_name)
                    mutations.append({"source": str(directory / target_name), "sourceSha256": sha((directory / target_name).read_bytes()), "mutatedSha256": sha(target.read_bytes())})
                result = subprocess.run([sys.executable, str(script), str(copied), "recovery"], capture_output=True, text=True)
                (retained / "audit.log").write_text(result.stdout + result.stderr)
                audit = json.loads((copied / "audit.json").read_text())
                shutil.copyfile(copied / "audit.json", retained / "audit.json")
                row = {"kind": kind, "snapshot": name, "fault": fault, "exit": result.returncode, "failures": audit["failures"], "mutations": mutations, "unchangedCompletionPinSha256": sha((copied / directory.name / "completed-response.json").read_bytes())}
                report.append(row)
                (output / "results.json").write_text(json.dumps(report, indent=2) + "\n")
                assert result.returncode == 1 and audit["verdict"] == "Fail", row
                assert [item["name"] for item in audit["failures"]] == [f"overflow-{kind}"], row
                # Full-history equality may detect an after/reopen mutation first; either
                # is a safety failure. Empty AssertionError messages are those old gates.
                assert row["unchangedCompletionPinSha256"] == sha((directory / "completed-response.json").read_bytes())
for name, expected in original.items():
    assert sha((source / name).read_bytes()) == expected, name
(output / "source-input-manifest.json").write_text(json.dumps(original, indent=2) + "\n")
print(f"PASS: all {len(report)} copied-observation mutants fail the safety audit; source packet unchanged. No DB/WAL/SHM copied or imported.")
