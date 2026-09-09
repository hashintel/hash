"""Archive exact locally observed bytes; never import these copies as state."""
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

output = Path(__file__).resolve().parent
original = Path('/tmp/m7-final-merged.zsW7IK')
terminal = original / 'TEST-a5-terminal-sJwsgN'
dry = original / 'dry5-chrome'

def save(name, value):
    with (output / name).open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')

pins = {}
for source in sorted(original.rglob('*')):
    if not source.is_file():
        continue
    assert not source.is_symlink()
    raw = source.read_bytes()
    relative = source.relative_to(original)
    target = output / 'observations' / relative
    if source.suffix != '.png':
        target = target.with_name(target.name + '.gz')
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('xb') as stream:
        stream.write(raw if source.suffix == '.png' else gzip.compress(raw, mtime=0))
    assert (target.read_bytes() if source.suffix == '.png' else gzip.decompress(target.read_bytes())) == raw
    pins[str(relative)] = dict(original=str(source), retained=str(target.relative_to(output)), bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
save('original-observation-pins.json', pins)

result = json.loads((terminal / 'result.json').read_text())
assert result['passed'] and len(result['outcomes']) == 25
assert sum(row['dispatches'] for row in result['outcomes']) == 34
summary = []
for row in result['outcomes']:
    state = row['firstState']
    call = state['calls'][0]
    summary.append(dict(control=row['control'], firstFailed=row['firstFailed'], dispatches=row['dispatches'], firstStatus=call['status'], firstActualUsd=call.get('actualUsd'), firstHeldUsd=state['totals']['outstandingReservedUsd']))
save('terminal-summary.json', summary)

requests = []
for source in sorted(dry.glob('native-*-request.json')):
    body = json.loads(source.read_text())
    assert body['model'] == 'claude-sonnet-4-6'
    assert 0 < body['max_tokens'] <= 4096
    requests.append(dict(file=source.name, model=body['model'], maxTokens=body['max_tokens'], toolNames=[tool['name'] for tool in body['tools']], system=body.get('system'), tools=body['tools']))
assert len(requests) == 5
save('actual-dry-tool-guidance-projections.json', requests)

step = output.parent
ledgers = {}
for name in ['usage-ledger.json', 'attempt-ledger.md']:
    source = step / name
    relative = str(source.relative_to(Path.cwd()))
    raw = source.read_bytes()
    base = subprocess.check_output(['git', 'show', '3f86c1461c2654b80b5eca0e7b5e65580146a9e0:' + relative])
    assert raw == base
    ledgers[relative] = dict(sha256=hashlib.sha256(raw).hexdigest(), unchangedFromBase=True)
save('cloned-ledger-unchanged.json', ledgers)
print(json.dumps(dict(retainedFiles=len(pins), controls=len(summary), syntheticTerminalDispatches=34, syntheticBrowserRequests=len(requests), clonedLedgersUnchanged=True)))
