# HASH-agents

## Description

This is a collection of agents that are being used in HASH. The agents are defined in the [`agents/`](app/agents) directory and are organized as modules. The top-level module is able to run the different agents.

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

To run the agent orchestrator, pass the agent name alongside the input you want to pass to the agent:

```bash
python -m agents <AGENT_NAME> <INPUT>
```

## Development

### Adding a new agent

To add a new agent, you need to create a new module in the [`agents/`](app/agents) directory. For this, it's recommended to copy the `template` module and rename it to the name of your agent.

To avoid going through the top-level module it's possible to directly invoke the agent module, e.g.:

```bash
python -m agents.my_agents
```

### Logging

You can configure the logging level with the `LOG_LEVEL` environment variable.
This can be set either in the `.env` or within the environment when you run the module.
The possible values are those accepted by [Python's `logging` library](https://docs.python.org/3/library/logging.html#levels).

The level defaults to `WARNING` if the environment variable is not set.

All logs will be output to a `logs/run-TIMESTAMP.log` file, where `TIMESTAMP` is the time the module was started.
