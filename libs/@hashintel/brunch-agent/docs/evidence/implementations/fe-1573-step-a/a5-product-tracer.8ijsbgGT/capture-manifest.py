"""Local read-only audit of tested source/build bytes and retained evidence. No network or state import."""
import gzip
import hashlib
import json
import plistlib
import subprocess
from pathlib import Path

ROOT = Path.cwd()
PACKET = Path(__file__).resolve().parent
BASE = "b5f320b90c753e2b1eeded5455e0f8d02e06584b"
PRODUCT = "fb90244b230d32afaa6497e03a0aea47a187a0f9"


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def entry(path):
    data = path.read_bytes()
    result = {"bytes": len(data), "sha256": sha(data)}
    if path.suffix == ".gz":
        result["uncompressedSha256"] = sha(gzip.decompress(data))
    return result


changed = git("diff", "--name-only", BASE, PRODUCT).decode().splitlines()
source_paths = [path for path in changed if "/docs/evidence/" not in path]
source_paths += [
    "libs/@hashintel/brunch-agent/packages/core/src/prompts/SYSTEM.md",
    "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/prompts/APPEND_SYSTEM.md",
]
for directory in [
    "libs/@hashintel/brunch-agent/packages/core/src/skills/elicitation",
    "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/skills/sdcpn-modelling",
]:
    source_paths += [str(path) for path in Path(directory).rglob("*.md")]
source_paths = sorted(set(source_paths))

protected = [
    "package.json", "yarn.lock", ".yarnrc.yml",
    "apps/brunch-agent/src/app.ts",
    "apps/brunch-agent/src/provider-admission.ts",
    "apps/brunch-agent/src/provider-accounting.ts",
    "apps/brunch-agent/src/provider-accounting/request-ledger.ts",
    "apps/brunch-agent/vitest.config.ts",
    "apps/brunch-agent/test/workpiece-revisions.test.ts",
    "apps/brunch-agent/test/workpiece-revisions.integration.ts",
    "apps/brunch-agent/test/native-schema-provider.ts",
    "apps/brunch-agent/test/native-schema-carriage.integration.ts",
    "apps/brunch-agent/test/provider-accounting.integration.ts",
    "libs/@hashintel/brunch-agent/packages/core/src/question-marker.ts",
    "libs/@hashintel/brunch-agent/packages/core/src/prompts/SYSTEM.md",
    "apps/petrinaut-website/src/main/app/local-storage-demo/prepared-crew-reservation-fixture.ts",
    "libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/usage-ledger.json",
    "libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/attempt-ledger.md",
]
protected += git("ls-files", "apps/brunch-agent/test/history-retention*").decode().splitlines()
protected += git("ls-files", ".yarn/patches/*").decode().splitlines()
protected += [str(path) for path in Path("libs/@hashintel/brunch-agent/packages/core/src/skills/elicitation").rglob("*.md")]
for path in protected:
    assert (ROOT / path).read_bytes() == git("show", f"{BASE}:{path}"), path
for directory in ["libs/@hashintel/petrinaut", "libs/@hashintel/petrinaut-core"]:
    assert not git("diff", "--name-only", BASE, "--", directory).strip(), directory
mission = "libs/@hashintel/brunch-agent/MISSION.md"
assert (ROOT / mission).read_bytes() == git("show", f"dad3fbd48b:{mission}")
app_package = "apps/brunch-agent/package.json"
old_package = json.loads(git("show", f"{BASE}:{app_package}"))
new_package = json.loads((ROOT / app_package).read_bytes())
for key in ["dependencies", "devDependencies", "resolutions", "packageManager"]:
    assert old_package.get(key) == new_package.get(key), key

build_roots = [
    "apps/brunch-agent/dist", "apps/petrinaut-website/dist",
    "libs/@hashintel/brunch-agent/packages/core/dist",
    "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/dist",
    "libs/@hashintel/brunch-agent/packages/binding-flue/dist",
    "libs/@hashintel/brunch-agent/packages/transport-aisdk/dist",
    "libs/@hashintel/petrinaut/dist", "libs/@hashintel/petrinaut-core/dist",
]
builds = {}
for directory in build_roots:
    paths = sorted(path for path in Path(directory).rglob("*") if path.is_file())
    assert paths, directory
    files = {str(path.relative_to(directory)): entry(path) for path in paths}
    builds[directory] = {"files": files, "treeSha256": sha(json.dumps(files, sort_keys=True).encode())}

packages = {}
for name in ["@flue/runtime", "@flue/sdk", "@earendil-works/pi-ai", "@earendil-works/pi-agent-core", "valibot", "zod", "@playwright/test"]:
    directory = Path("node_modules") / name
    package = directory / "package.json"
    packages[name] = {"version": json.loads(package.read_bytes())["version"], "package": entry(package)}
    if name in ["@flue/runtime", "@earendil-works/pi-ai", "@earendil-works/pi-agent-core"]:
        packages[name]["runtimeFiles"] = {
            str(path.relative_to(directory)): entry(path)
            for path in sorted((directory / "dist").rglob("*"))
            if path.is_file() and path.suffix in [".mjs", ".js"]
        }

browser = PACKET / "browser-final"
captures = json.loads(gzip.decompress((browser / "native-sdk-requests.json.gz").read_bytes()))
model_ids = sorted({capture["serialized"].get("model", "unknown") for capture in captures})
artifacts = {
    str(path.relative_to(PACKET)): entry(path)
    for path in sorted(PACKET.rglob("*"))
    if path.is_file() and path.name != "manifest.json"
}
with open("/Applications/Google Chrome.app/Contents/Info.plist", "rb") as chrome_info:
    chrome_version = plistlib.load(chrome_info)["CFBundleShortVersionString"]
manifest = {
    "base": BASE,
    "productCommit": PRODUCT,
    "authorityCherryPick": "dad3fbd48b",
    "ownerInventoryCommit": "78de886f8cfb040dcdf7f734f170b1e2f9b2b9d7",
    "node": subprocess.check_output(["node", "--version"]).decode().strip(),
    "chrome": chrome_version,
    "requestedModels": model_ids,
    "syntheticBrowserSdkRequests": len(captures),
    "realProviderCalls": 0,
    "sourceAndGuidance": {path: entry(ROOT / path) for path in source_paths},
    "protectedEqualToBase": {path: entry(ROOT / path) for path in sorted(set(protected))},
    "unchangedPublishedTrees": ["libs/@hashintel/petrinaut", "libs/@hashintel/petrinaut-core"],
    "packages": packages,
    "builds": builds,
    "localReusedGenerator": entry(Path("node_modules/@openapitools/openapi-generator-cli/versions/6.6.0.jar")),
    "artifacts": artifacts,
    "scope": "Synthetic product/interpretation mechanics only; no genuine or utility acceptance. Recheck after recovery integration. Runtime restart/browser reload, not second OS process.",
}
(PACKET / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"Verified {len(protected)} protected paths; pinned {len(source_paths)} source/guidance paths, {len(artifacts)} artifacts and {len(builds)} build trees.")
