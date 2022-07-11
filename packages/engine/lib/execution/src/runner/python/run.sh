#!/bin/sh
# Do `chmod a+x run.sh` for `./run.sh` to work.
# Also may have to run `dos2unix ./run.sh` for 
# `/bin/sh^M: bad interpreter` or bad line endings
SCRIPT_DIR=$(dirname "$0") 
VENV_ACTIVATE_PATH="$SCRIPT_DIR/runner_venv/bin/activate"

. $VENV_ACTIVATE_PATH

# Find the latest "hash_engine_lib" compiled shared library
LATEST_LIBRARY=$(find "$SCRIPT_DIR/../../../../../target" -name "libmemory.so" -print0 | xargs -r -0 ls -1 -t | head -1)
LATEST_LIBRARY_DIR=$(dirname "$LATEST_LIBRARY")

if [ -z "${SCRIPT_DIR-}" ]
then
  export LD_LIBRARY_PATH="$LATEST_LIBRARY_DIR"
else
  export LD_LIBRARY_PATH="LD_LIBRARY_PATH:$LATEST_LIBRARY_DIR"
fi

python3 -u "$SCRIPT_DIR/main.py" "$1" "$2" "$SCRIPT_DIR"
