# HASH AI worker (Python)

## Requirements

- Python 3.x > 3.11 (the version used in HASH is 3.11)

## Configuration

The service uses the following environment variables:

- `HASH_TEMPORAL_HOST`: The hostname that the Temporal server is running on (defaults to `localhost`).
- `HASH_TEMPORAL_PORT`: The port that the Temporal server is running on (defaults to `7233`).
- `OPENAI_API_KEY`: The OpenAI API key that is made availble to workflows and activities.

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

- Install poetry:
  - Please refer to the [poetry documentation](https://python-poetry.org/docs/#installation) for installation instructions
- Acquire and set the OpenAI API key, either:
  - Set the `OPENAI_API_KEY` environment variable in `.env.local` (this folder or any parent folder), or
  - Set the `OPENAI_API_KEY` environment variable in your shell
- Install dependencies:
  - `poetry install`

### Subsequent Runs (or after Pre-Setup)

- Ensure the OpenAI API key is available
- If the requirements has been changed:
  - `poetry install`
- Run the worker:
  - `yarn dev` (or `poetry run python -m app`)
