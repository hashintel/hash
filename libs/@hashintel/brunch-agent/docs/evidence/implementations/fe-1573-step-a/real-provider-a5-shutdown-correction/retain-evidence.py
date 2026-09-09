"""Retain bounded shutdown proof without generating a paid instrument freeze."""
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

output = Path(__file__).resolve().parent
root = Path('/tmp/m7-shutdown-correction.KHbjED').resolve()
sha = lambda data: hashlib.sha256(data).hexdigest()

def save(name, value):
    with (output / name).open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')

sessions = set()
def inspect(value):
    if isinstance(value, dict):
        for key, child in value.items():
            if key in ('directory', 'sessionDirectory') and isinstance(child, str):
                path = Path(child)
                if path.name.startswith('brunch-a5-browser-') and path.is_dir():
                    sessions.add(path.resolve())
            inspect(child)
    elif isinstance(value, list):
        for child in value:
            inspect(child)
for path in root.rglob('*.json'):
    try:
        inspect(json.loads(path.read_text()))
    except (ValueError, UnicodeError):
        pass

originals = {}
def retain(source, relative):
    assert source.is_file() and not source.is_symlink()
    raw = source.read_bytes()
    if source.suffix != '.png':
        relative = relative.with_name(relative.name + '.gz')
    destination = output / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open('xb') as stream:
        stream.write(raw if source.suffix == '.png' else gzip.compress(raw, mtime=0))
    archived = destination.read_bytes() if source.suffix == '.png' else gzip.decompress(destination.read_bytes())
    assert archived == raw
    originals[str(relative)] = dict(original=str(source), sha256=sha(raw), bytes=len(raw))

sets = [('runs', root)] + [('private-sessions/' + path.name, path) for path in sorted(sessions) if not path.is_relative_to(root)]
for label, directory in sets:
    for source in sorted(directory.rglob('*')):
        if source.is_file():
            retain(source, Path('observations') / label / source.relative_to(directory))
for source in [Path('/tmp/a5-sibling-review.J1ggxQ/review.md')] + [Path('/tmp/m7-close-rejection-owner.WgsOCX') / name for name in ['close-rejection-result.json', 'close-rejection-hook.mjs', 'close-rejection-probe.mjs']]:
    retain(source, Path('parent-red') / source.name)
save('original-observation-pins.json', originals)

baseline = '3d4a5ebab5b083385d0b8a092ad375bd7d0134bd'
commit = 'c9f8ced5eca31bc177539d185c2b4addd97f99eb'
paths = subprocess.check_output(['git', 'diff', '--name-only', baseline, commit], text=True).splitlines()
assert len(paths) == 3
save('source-review-pins.json', dict(label='Shutdown correction review only; no final freeze', baseline=baseline, commit=commit, files={name: sha(Path(name).read_bytes()) for name in paths}))

prior = output.parent / 'real-provider-a5-sibling-browser'
protected = json.loads((prior / 'protected-unchanged-pins.json').read_text())
# No live/cloned paid ledger or journal access in this correction.
protected = {path: digest for path, digest in protected.items() if 'ledger' not in path}
extra = ['apps/brunch-agent/src/evaluations/real-provider-a5.ts'] + ['apps/brunch-agent/src/evaluations/real-provider-a5/' + name for name in ['launch.ts', 'browser-session.ts', 'manifest.ts']] + ['apps/brunch-agent/test/' + name for name in ['real-provider-a5-browser.test.ts', 'real-provider-a5-browser.integration.ts']]
for path in extra:
    base = subprocess.check_output(['git', 'show', baseline + ':' + path])
    assert Path(path).read_bytes() == base
    protected[path] = sha(base)
for path, digest in protected.items():
    assert sha(Path(path).read_bytes()) == digest
save('protected-nonledger-pins.json', protected)

inherited = {}
for name in ['built-review-pins.json', 'browser-library-review-pins.json']:
    source = prior / name
    pins = json.loads(source.read_text())['files']
    for path, digest in pins.items():
        assert sha(Path(path).read_bytes()) == digest
    inherited[str(source)] = dict(sha256=sha(source.read_bytes()), filePinsVerified=len(pins), unchanged=True)
save('inherited-component-verification.json', inherited)

summary = []
for directory in sorted((root / 'fault-review').iterdir()):
    if not directory.is_dir():
        continue
    row = json.loads((directory / 'production-observation.json').read_text())
    rescue = json.loads((directory / 'test-cleanup.json').read_text())
    summary.append(dict(control=row['control'], ownerPid=row['ownerPid'], chromePid=row['chromePid'], killDelayMs=row['killDelayMs'], graceful=row['cleanup']['gracefulClose'], fallback=row['cleanup']['killFallback'], productionCleanupComplete=row['cleanup']['cleanupComplete'], endpointBeforeRescue=row['endpointBeforeRescue'], productionExit=row.get('productionExit'), testRescueUsed=rescue['rescueUsed'], testCleanup=rescue))
save('shutdown-summary.json', summary)
print(json.dumps(dict(originalFiles=len(originals), sourcePaths=len(paths), protectedNonledgerPaths=len(protected), finalFreezeGenerated=False, rebuilt=False)))
