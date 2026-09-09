"""Retain this lane's exact local observations; not a paid instrument freeze."""
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

root = Path('/tmp/m7-sibling-adapter.WgFRSb').resolve()
output = Path(__file__).resolve().parent
repo = Path.cwd()
sha = lambda data: hashlib.sha256(data).hexdigest()

def save(name, value):
    with (output / name).open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')

sessions = set()
for path in root.rglob('*.json'):
    try:
        value = json.loads(path.read_text())
    except (ValueError, UnicodeError):
        continue
    def inspect(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key in ('directory', 'sessionDirectory') and isinstance(child, str):
                    candidate = Path(child)
                    if candidate.name.startswith('brunch-a5-browser-') and candidate.is_dir():
                        sessions.add(candidate.resolve())
                inspect(child)
        elif isinstance(value, list):
            for child in value:
                inspect(child)
    inspect(value)

originals = {}
sets = [('runs', root)] + [('private-sessions/' + path.name, path) for path in sorted(sessions) if not path.is_relative_to(root)]
for label, directory in sets:
    for source in sorted(directory.rglob('*')):
        if not source.is_file():
            continue
        assert not source.is_symlink()
        raw = source.read_bytes()
        relative = Path('observations') / label / source.relative_to(directory)
        if source.suffix != '.png':
            relative = relative.with_name(relative.name + '.gz')
        destination = output / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open('xb') as stream:
            stream.write(raw if source.suffix == '.png' else gzip.compress(raw, mtime=0))
        archived = destination.read_bytes() if source.suffix == '.png' else gzip.decompress(destination.read_bytes())
        assert archived == raw
        originals[str(relative)] = {'original': str(source), 'sha256': sha(raw), 'bytes': len(raw)}
save('original-observation-pins.json', originals)

changed = subprocess.check_output(['git', 'diff', '--name-only', '34a90935e4ee646a049d8aad6dcf49c866fa9150', '070cb6fb42df2568de04d7c79499ad4d29a0b011'], text=True).splitlines()
assert len(changed) == 8
save('source-review-pins.json', {'label': 'Bounded code review only; not an activation manifest', 'commit': '070cb6fb42df2568de04d7c79499ad4d29a0b011', 'files': {name: sha(Path(name).read_bytes()) if Path(name).exists() else None for name in changed}})

protected = ['apps/brunch-agent/src/evaluations/real-provider-a5/' + name for name in ['preflight.ts', 'native-response.ts', 'transport.ts', 'scenario.json', 'synthetic-transport.ts', 'network-guard.ts', 'paid-provider.sb']]
protected += ['apps/brunch-agent/src/provider-accounting.ts', 'apps/brunch-agent/src/provider-admission.ts', 'apps/brunch-agent/src/app.ts', 'apps/brunch-agent/src/agents/chat-agent/agent.ts', 'yarn.lock', 'package.json', '.yarnrc.yml', 'apps/brunch-agent/package.json', 'libs/@hashintel/brunch-agent/MISSION.md']
step = 'libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/'
protected += [step + name for name in ['usage-ledger.json', 'attempt-ledger.md', 'native-local-delivery/loopback-only.sb', 'native-local-delivery/deny-network.sb']]
pins = {}
for name in protected:
    raw = Path(name).read_bytes()
    base = subprocess.check_output(['git', 'show', '34a90935e4:' + name])
    assert raw == base
    pins[name] = sha(raw)
save('protected-unchanged-pins.json', pins)

build_roots = ['apps/brunch-agent/dist', 'apps/petrinaut-website/dist']
save('built-review-pins.json', {'label': 'Built regression artifacts only; no final instrument freeze', 'files': {str(path): sha(path.read_bytes()) for name in build_roots for path in sorted(Path(name).rglob('*')) if path.is_file()}})
libraries = ['node_modules/playwright-core', 'node_modules/playwright', 'node_modules/@playwright/test']
save('browser-library-review-pins.json', {'label': 'Installed library component pins only; no paid activation', 'files': {str(path): sha(path.read_bytes()) for name in libraries for path in sorted(Path(name).rglob('*')) if path.is_file()}})
print(json.dumps({'originalAndArchivedFiles': len(originals), 'privateSessions': len(sessions), 'sourcePaths': len(changed), 'protectedPaths': len(pins), 'finalFreezeGenerated': False}))
