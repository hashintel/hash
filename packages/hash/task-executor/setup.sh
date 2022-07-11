#!/bin/sh
# Do `chmod a+x setup.sh` for `./setup.sh` to work.
# Also may have to run `dos2unix ./setup.sh` for
# `/bin/sh^M: bad interpreter` or bad line endings

HELP="
 Usage: $0 <python run command>

   <python run command> should be the executable command for a version of Python 3.x >= 3.7
   e.g.:
     python3
     python3.7
     /usr/local/bin/python
"

[ "$1" = "-h" ] || [ "$1" = "--help" ] && echo "${HELP}"  && return


SCRIPT_DIR=$PWD

# Activation path to start Python virtual environment in shell
VENV_ACTIVATE_PATH="${SCRIPT_DIR}/venv/bin/activate"

# Check if venv exists, if not, create it
if [ ! -f "${VENV_ACTIVATE_PATH}" ]; then
  # Check a Python executable command was given
  if [ -z "$1" ]
  then
    echo "${HELP}";
    return;
  fi

  PYTHON=$1

  echo "Virtual environment didn't exist at: ${VENV_ACTIVATE_PATH}"
  echo "Using $($PYTHON --version) to create a new one"
  (cd "${SCRIPT_DIR}" && ${PYTHON} -m venv venv)
fi

echo "Activating virtual environment"
# Can't use `source` command with sh on Ubuntu -- only with bash.
# shellcheck source=./venv/bin/activate
. "$VENV_ACTIVATE_PATH"

echo "Running $(python --version) from $(which python)"

echo "Installing python dependencies"
python -m pip install --upgrade pip
python -m pip install -r "${SCRIPT_DIR}/requirements.lock"
return
