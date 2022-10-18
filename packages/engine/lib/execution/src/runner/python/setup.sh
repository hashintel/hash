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

[ "$1" = "-h" ] || [ "$1" = "--help" ] && echo "${HELP}"  && exit

# Use $0, because `pwd` would add the directory that
# the script is *started from*.
SCRIPT_DIR=$(dirname "$0")       # Bash does not allow spaces around the = sign.

# Activation path to start Python virtual environment in shell
VENV_ACTIVATE_PATH="${SCRIPT_DIR}/runner_venv/bin/activate"

# Check if venv exists, if not, create it
if [ ! -f "${VENV_ACTIVATE_PATH}" ]; then
  # Check a Python executable command was given
  if [ -z "$1" ]
  then
    echo "${HELP}";
    exit;
  fi

  PYTHON=$1

  echo "Virtual environment didn't exist at: ${VENV_ACTIVATE_PATH}"
  echo "Using $($PYTHON --version) to create a new one"
  (cd "${SCRIPT_DIR}" && ${PYTHON} -m venv runner_venv)
fi

echo "Activating virtual environment"
# Can't use `source` command with sh on Ubuntu -- only with bash.
# shellcheck source=./runner_venv/bin/activate
. "$VENV_ACTIVATE_PATH"

echo "Running $(python --version) from $(which python)"

echo "Installing python dependencies"
python -m pip install --upgrade pip
if uname -s | grep -q Darwin && uname -p | grep -q arm ; then
  if ! brew --prefix openblas ; then
    echo "You are on an Arm64 (M1/M2 apple processor) - please install the open
    basic linear algebra subroutines (run `brew install openblas` - if you have
    not yet installed Homebrew, you can do so from https://brew.sh/)"
  fi
  # fixes an assertion that would otherwise happen (due to someone changing a
  # version API to return an integer rather than a string)
  export SYSTEM_VERSION_COMPAT=1
  export CC=clang
  export CXX=clang++
  export PKG_CONFIG_PATH="/opt/homebrew/opt/openblas/lib/pkgconfig"
  python -m pip install wheel
  python -m pip install -r "${SCRIPT_DIR}/m1-requirements.txt"
  git clone https://github.com/hashdeps/pynng
  cd pynng
  python -m pip install .
  cd ..
  rm -rf pynng
else
  python -m pip install -r "${SCRIPT_DIR}/requirements.txt"
fi

echo "Running setup.py"
# Also compile Cython. Can be done either after
# or before compiling Rust.
python "${SCRIPT_DIR}/setup.py" build_ext --inplace "${SCRIPT_DIR}"
exit
