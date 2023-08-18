#!/usr/bin/env bash
set -euo pipefail

# Thanks to: https://stackoverflow.com/a/246128/9077988
SOURCE=${BASH_SOURCE[0]}
while [ -L "$SOURCE" ]; do # resolve $SOURCE until the file is no longer a symlink
  DIR=$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )
  SOURCE=$(readlink "$SOURCE")
  [[ $SOURCE != /* ]] && SOURCE=$DIR/$SOURCE # if $SOURCE was a relative symlink, we need to resolve it relative to the path where the symlink file was located
done
DIR=$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )

poetry run python "$DIR/generate_blocking.py"

poetry run ruff --fix "$DIR/../graph_sdk/client/blocking.py" || true
poetry run black "$DIR/../graph_sdk/client/blocking.py"
