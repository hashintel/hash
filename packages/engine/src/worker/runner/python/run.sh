#!/bin/sh
# Do `chmod a+x run.sh` for `./run.sh` to work.
# Also may have to run `dos2unix ./run.sh` for 
# `/bin/sh^M: bad interpreter` or bad line endings
SCRIPT_DIR=$(dirname "$0") 
VENV_ACTIVATE_PATH="$SCRIPT_DIR/runner_venv/bin/activate"

. $VENV_ACTIVATE_PATH

if [ -z "${SCRIPT_DIR-}" ]
then
  export LD_LIBRARY_PATH="$SCRIPT_DIR/../../../../target/release:$SCRIPT_DIR/../../../../:$SCRIPT_DIR/../../../../target/debug:$SCRIPT_DIR"
else
  export LD_LIBRARY_PATH="LD_LIBRARY_PATH:$SCRIPT_DIR/../../../../target/release:$SCRIPT_DIR/../../../../:$SCRIPT_DIR/../../../../target/debug:$SCRIPT_DIR"
fi

python3 -u "$SCRIPT_DIR/main.py" "$1" "$2" "$SCRIPT_DIR"
