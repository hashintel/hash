#!/usr/bin/env bash
# Opt-in focused proof. Build the existing app/website first under deny-network.sb.
set -euo pipefail
repo=$(git rev-parse --show-toplevel)
if [ "$#" -gt 0 ]; then
  output=$1
  test ! -e "$output"
  mkdir -p "$output"
else
  output=$(mktemp -d /tmp/m7-a5-retention.XXXXXXXX)
fi
output=$(cd "$output" && pwd)
test ! -e "$output/original"
test ! -e "$output/instrument.json"
guard="$repo/libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery"
node "$guard/verify-network-guard.mjs" > "$output/network-guard.log" 2>&1
cd "$repo"
sandbox-exec -f "$guard/deny-network.sb" python3 - "$output/instrument.json" <<'PY'
import hashlib, json, subprocess, sys
from pathlib import Path
roots = [
    'apps/brunch-agent/src', 'apps/brunch-agent/dist',
    'apps/petrinaut-website/src/main/app/local-storage-demo', 'apps/petrinaut-website/dist',
    'libs/@hashintel/brunch-agent/packages/core',
    'libs/@hashintel/brunch-agent/packages/plugin-sdcpn',
    'libs/@hashintel/brunch-agent/packages/binding-flue',
    'libs/@hashintel/brunch-agent/packages/transport-aisdk',
    'node_modules/@flue/runtime/dist', 'node_modules/@flue/sdk/dist',
    'node_modules/@earendil-works/pi-ai/dist', 'node_modules/@earendil-works/pi-agent-core/dist',
    '.yarn/patches',
    'libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery',
]
paths = {path for root in roots for path in Path(root).rglob('*') if path.is_file() and 'node_modules' not in path.parts[1:-1] and '.turbo' not in path.parts}
# Explicit runtime roots above have node_modules as their FIRST path component.
paths.update(Path('apps/brunch-agent/test').glob('reopened-why-retention*'))
paths.update(map(Path, ['yarn.lock', '.yarnrc.yml', 'libs/@hashintel/brunch-agent/MISSION.md', 'apps/brunch-agent/test/native-schema-provider.ts']))
for root in ['apps/brunch-agent/dist', 'apps/petrinaut-website/dist', 'node_modules/@flue/runtime/dist']:
    assert Path(root).is_dir(), f'Missing built/local artifact: {root}'
manifest = {str(path): {'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()} for path in sorted(paths)}
Path(sys.argv[1]).write_text(json.dumps({'head': subprocess.check_output(['git','rev-parse','HEAD'], text=True).strip(), 'branch': subprocess.check_output(['git','branch','--show-current'], text=True).strip(), 'files': manifest}, indent=2) + '\n')
PY
cd "$repo/apps/brunch-agent"
for phase in create fold reopen; do
  profile=deny-network
  if [ "$phase" = create ]; then profile=loopback-only; fi
  printf '%s\n' "sandbox-exec -f $guard/$profile.sb env A5_RETENTION_OUTPUT=$output/original A5_RETENTION_PHASE=$phase node --experimental-strip-types test/reopened-why-retention.integration.ts" >> "$output/commands.log"
  sandbox-exec -f "$guard/$profile.sb" env A5_RETENTION_OUTPUT="$output/original" A5_RETENTION_PHASE="$phase" node --experimental-strip-types test/reopened-why-retention.integration.ts > "$output/$phase.log" 2>&1
  printf 'Completed %s in a separate Node process; log: %s/%s.log\n' "$phase" "$output" "$phase"
done
sandbox-exec -f "$guard/deny-network.sb" python3 test/reopened-why-retention-audit.py "$output/original" > "$output/audit.json"
cd "$repo"
sandbox-exec -f "$guard/deny-network.sb" python3 - "$output/instrument.json" <<'PY'
import hashlib, json, sys
from pathlib import Path
for name, pin in json.loads(Path(sys.argv[1]).read_text())['files'].items():
    path = Path(name)
    assert path.stat().st_size == pin['bytes'] and hashlib.sha256(path.read_bytes()).hexdigest() == pin['sha256'], f'Instrument changed during proof: {name}'
print('Source/build/runtime instrument unchanged through all three processes')
PY
printf 'A5_RETENTION_PORTFOLIO_PASS %s\n' "$output"
