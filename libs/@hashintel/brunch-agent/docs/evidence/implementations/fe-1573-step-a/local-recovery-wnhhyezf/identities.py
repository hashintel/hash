"""Read-only source/installation/build provenance; never imports a conversation or environment."""
import hashlib
import json
from pathlib import Path
import subprocess

root = Path.cwd()
output = Path(__file__).resolve().parent
base = "b5f320b90c753e2b1eeded5455e0f8d02e06584b"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(["git", *args])


prior = json.loads((output.parent / "local-recovery-Mwl5xY0w/identities.json").read_text())
protected_paths = set(prior["protected"])
for prefix in ("apps/brunch-agent/src", "apps/petrinaut-website/src", "libs/@hashintel/brunch-agent/packages/binding-flue/src", "libs/@hashintel/brunch-agent/packages/transport-aisdk/src", "libs/@hashintel/petrinaut/src", "libs/@hashintel/petrinaut-core/src"):
    protected_paths.update(git("ls-files", prefix).decode().splitlines())
# The Flue patch and lockfile are the two intentionally changed dependency files.
protected_paths -= {".yarn/patches/@flue-runtime-npm-2.0.3-192c31f50c.patch", "yarn.lock"}
protected_paths = {name for name in protected_paths if not name.startswith("apps/brunch-agent/test/history-retention")}
protected = {}
for name in sorted(protected_paths):
    data = (root / name).read_bytes()
    original = git("show", f"{base}:{name}")
    assert data == original, name
    protected[name] = digest(data)

immutable_packets = {}
for name in ("a4-new-records-SdzNNS6W", "a4-integration-alpha", "combined-native-accounting-a4-alpha", "native-local-delivery", "request-accounting-20260908T164237Z", "local-recovery-Mwl5xY0w"):
    path = str(output.parent.relative_to(root) / name)
    expected_ref = "b78a30c4be" if name == "local-recovery-Mwl5xY0w" else base
    expected = git("rev-parse", f"{expected_ref}:{path}").decode().strip()
    actual = git("rev-parse", f"HEAD:{path}").decode().strip()
    assert actual == expected, name
    immutable_packets[path] = actual

installed = {}
for name, expected in prior["installed"].items():
    data = (root / name).read_bytes()
    installed[name] = {"sha256": digest(data), "bytes": len(data)}
    if not name.endswith("conversation-stream-store-CXwRWonS.mjs"):
        assert installed[name] == expected, name

runtime = "node_modules/@flue/runtime/dist/conversation-stream-store-CXwRWonS.mjs"
text = (root / runtime).read_text()
replacements = [
    ("\t\t\t\t\t// Recovery skips recorded outcomes, so their buffered state must be\n\t\t\t\t\t// durable in the same canonical append, not only at turn_end.\n\t\t\t\t\tawait this.appendCanonical([...this.drainHookStateRecords(), {", "\t\t\t\t\tawait this.appendCanonical([{",),
    ("\t\t// Reexecution uses the real tool setter. Commit its buffered writes with\n\t\t// its outcomes and result batch, including across an interrupted repair.\n\t\tawait this.appendCanonical([...this.drainHookStateRecords(), ...outcomeRecords, {", "\t\tif (outcomeRecords.length > 0) await this.appendCanonical(outcomeRecords);\n\t\tawait this.appendCanonical([{",),
    ("\t\t\t\t// Silent overflow can be inferred from usage on a successful stop.\n\t\t\t\t// That response is already canonical and complete: compact for the\n\t\t\t\t// next actual input, rather than retrying an assistant tail (or\n\t\t\t\t// replaying completed work). Error/partial responses still recover.\n\t\t\t\tif (assistant.stopReason === \"stop\" && !hasToolCallBlocks(assistant)) {\n\t\t\t\t\tthrowIfHalted();\n\t\t\t\t\treturn;\n\t\t\t\t}\n", ""),
]
for changed, original in replacements:
    assert text.count(changed) == 1
    text = text.replace(changed, original)
assert digest(text.encode()) == prior["installed"][runtime]["sha256"], "Runtime differs from the inherited native patch beyond the three authorized changes"

source_paths = git("diff", "--name-only", base, "HEAD").decode().splitlines()
source_paths = [name for name in source_paths if not name.startswith("libs/@hashintel/brunch-agent/docs/evidence/")]
sources = {name: digest((root / name).read_bytes()) for name in source_paths}
builds = {}
for prefix in ("apps/brunch-agent/dist", "apps/petrinaut-website/dist"):
    for path in sorted((root / prefix).rglob("*")):
        if path.is_file():
            builds[str(path.relative_to(root))] = digest(path.read_bytes())
jar = root / "node_modules/@openapitools/openapi-generator-cli/versions/6.6.0.jar"
assert jar.is_file() and not jar.is_symlink() and jar.stat().st_nlink == 1
assert jar.stat().st_size == 27103489 and digest(jar.read_bytes()) == "9718ff7844e89462c75dcd9b20a35136f6db257bfe1b874db1e3002e99de4609"
report = {"base": base, "implementationCommit": git("rev-parse", "HEAD").decode().strip(), "node": subprocess.check_output(["node", "--version"]).decode().strip(), "protectedSourceHashes": protected, "immutablePacketTrees": immutable_packets, "installed": installed, "runtimeDeltaExactlyThreeChanges": True, "sources": sources, "builtFiles": builds, "jarRegularCopyStillMatches": True}
(output / "identities.json").write_text(json.dumps(report, indent=2) + "\n")
print(f"Source/installation identity checks pass: {len(protected)} protected files, three runtime changes only")
