# OpenAI GPT Experiments - Python Template

## Requirements

- Python 3.x > 3.8

## Setup

`<PYTHON_CMD>` here should be the command you use to run Python.
This varies on platform, to check you're running the correct version, run `<PYTHON_CMD> --version`.

Some potential candidates for `PYTHON_CMD`

- `python`
- `python3`
- `python<VERSION>` (e.g. `python3.11`)
- `py3`
- `py`

### First-Time Pre-Setup

- Acquire and set the OpenAI API key, either:
  - Create a `.env` file, and set the `OPENAI_API_KEY` environment variable in it, or
  - Set the `OPENAI_API_KEY` environment variable in your shell
- Create a virtual environment:
  - `<PYTHON_CMD> -m venv venv`
- Activate the virtual environment:
  - On **Linux/MacOS**
    - `. venv/bin/activate` (if that doesn't work try `source venv/bin/activate`)
  - On **Windows** (`cmd` or Powershell):
    - `venv\Scripts\activate.bat`
- Check that your environment has activated correctly, after this point you can just use `python` instead of `<PYTHON_CMD>`:
  - On **Linux/MacOS**
    - `which python` should point to `venv/bin/python`
  - On **Windows** (`cmd` or Powershell):
    - `where python` should point to `venv\Scripts\python.exe`
- Install dependencies:
  - `pip install --upgrade pip`
  - `pip install -r requirements.txt`

### Subsequent Runs (or after Pre-Setup)

- Ensure the OpenAI API key is available
- Activate the virtual environment:
  - On **Linux/MacOS**
    - `. venv/bin/activate` (if that doesn't work try `source venv/bin/activate`)
  - On **Windows** (`cmd` or Powershell):
    - `venv\Scripts\activate.bat`
- If the requirements has been changed:
  - `pip install --upgrade pip`
  - `pip install -r requirements.txt`

## Running

> **Warning:** This section has not been written, yet. 🙃

### Logging

You can configure the logging level with the `LOG_LEVEL` environment variable.
This can be set either in the `.env` or within the environment when you run the module.
The possible values are those accepted by [Python's `logging` library](https://docs.python.org/3/library/logging.html#levels).

The level defaults to `WARNING` if the environment variable is not set.

All logs will be output to a `logs/run-TIMESTAMP.log` file, where `TIMESTAMP` is the time the module was started.
