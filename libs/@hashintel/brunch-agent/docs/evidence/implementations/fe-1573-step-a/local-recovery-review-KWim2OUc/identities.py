"""Read-only review provenance. Does not run, restore, or modify any application/store."""
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

root = Path.cwd()
output = Path(__file__).resolve().parent
base = "46aa1908f65a05d48a1f22e239debb0182a7c68e"
prior = output.parent / "local-recovery-wnhhyezf"
sha = lambda data: hashlib.sha256(data).hexdigest()
identity = json.loads((prior / "identities.json").read_text())
for name, expected in {**identity["protectedSourceHashes"], **identity["builtFiles"]}.items():
    assert sha((root / name).read_bytes()) == expected, name
for name, expected in identity["installed"].items():
    assert sha((root / name).read_bytes()) == expected["sha256"], name
for name, expected in json.loads((prior / "manifest.json").read_text())["artifacts"].items():
    assert sha((prior / name).read_bytes()) == expected["sha256"], name
changed = subprocess.check_output(["git", "diff", "--name-only", base, "HEAD"], text=True).splitlines()
changed = [name for name in changed if not name.startswith(str(output.relative_to(root)) + "/")]
assert changed and all(name.startswith("apps/brunch-agent/test/history-retention") for name in changed), changed
unchanged = {}
for name in ("yarn.lock", ".yarn/patches/@flue-runtime-npm-2.0.3-192c31f50c.patch", ".yarn/patches/@earendil-works-pi-ai-npm-0.83.0-c607801251.patch", ".yarn/patches/@earendil-works-pi-agent-core-npm-0.83.0-6cd8fe314f.patch", "libs/@hashintel/brunch-agent/MISSION.md"):
    data = (root / name).read_bytes()
    assert data == subprocess.check_output(["git", "show", f"{base}:{name}"])
    unchanged[name] = sha(data)
final = output / "a4-safety-hcORSYb8"
pin_path = final / "source-build-identities.json"
pins = json.loads(pin_path.read_bytes() if pin_path.exists() else gzip.decompress(pin_path.with_suffix(".json.gz").read_bytes()))
for name, expected in pins.items():
    assert sha((root / name).read_bytes()) == expected, name
report = {
    "reviewBase": base,
    "testCommit": subprocess.check_output(["git", "rev-parse", "6c6dcac5c9"], text=True).strip(),
    "node": subprocess.check_output(["node", "--version"], text=True).strip(),
    "priorIdentityFile": str((prior / "identities.json").relative_to(root)),
    "priorIdentitySha256": sha((prior / "identities.json").read_bytes()),
    "priorEvidenceManifestSha256": sha((prior / "manifest.json").read_bytes()),
    "verifiedUnchangedProtectedFiles": len(identity["protectedSourceHashes"]),
    "verifiedUnchangedBuiltFiles": len(identity["builtFiles"]),
    "verifiedUnchangedPriorArtifacts": len(json.loads((prior / "manifest.json").read_text())["artifacts"]),
    "installed": identity["installed"],
    "unchangedPatchLockMission": unchanged,
    "testSources": {name: sha((root / name).read_bytes()) for name in changed},
    "finalMatrixSourceBuildPinsMatch": True,
    "buildInstallOrProductEdits": False,
}
(output / "identities.json").write_text(json.dumps(report, indent=2) + "\n")
print(f"PASS: {report['verifiedUnchangedProtectedFiles']} protected files, {report['verifiedUnchangedBuiltFiles']} build files, {report['verifiedUnchangedPriorArtifacts']} prior artifacts; installed runtime/native and patch/lock/Mission unchanged; final matrix test source pins exact.")
