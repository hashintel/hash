"""One-time evidence command: copy only the specifically authorized local JAR."""
import hashlib
import json
import os
from pathlib import Path
import stat

source = Path('/Users/lunelson/.herdr/worktrees/hash/alpha/node_modules/@openapitools/openapi-generator-cli/versions/6.6.0.jar')
target = Path('node_modules/@openapitools/openapi-generator-cli/versions/6.6.0.jar')
expected = '9718ff7844e89462c75dcd9b20a35136f6db257bfe1b874db1e3002e99de4609'

def inspect(path):
    info = path.lstat()
    assert stat.S_ISREG(info.st_mode) and info.st_nlink == 1
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    assert info.st_size == 27103489 and digest == expected
    return dict(path=str(path.resolve()), size=info.st_size, sha256=digest, inode=info.st_ino, device=info.st_dev, links=info.st_nlink)

before = inspect(source)
assert not os.path.lexists(target), 'Unexpected target exists; refuse overwrite'
target.parent.mkdir(exist_ok=True)
with source.open('rb') as original, target.open('xb') as copied:
    while data := original.read(1024 * 1024):
        copied.write(data)
after = inspect(source)
destination = inspect(target)
assert before == after
assert (before['device'], before['inode']) != (destination['device'], destination['inode'])
print(json.dumps(dict(source=before, destination=destination, sourceUnchanged=True, regularCopy=True), indent=2))
