# Task Executor

The HASH Task Executor is a temporary solution to allow the workspace to trigger the execution of scripts.

Designed to be built into a self-contained docker image ([see the relevant Dockerfile](/packages/hash/docker/task-executor/Dockerfile)), the Executor is a lightweight Node HTTP server with a set of hardcoded routes to run the bundled tasks.

Tasks are executed on child processes: \* Python scripts are executed within a virtual environment managed by the [./setup.sh](./setup.sh) script, with dependencies defined in [./requirements.lock](./requirements.lock)

## Updating Dependencies

- Create a clean virtual environment with `python3 -m venv venv`
- Activate it with `./venv/bin/activate`
- Update [./requirements.txt](./requirements.txt) with the necessary top-level dependency
- Run `python -m pip install -r ./requirements.txt`
- Run `python -m pip freeze > requirements.lock`

## Setup

- Airbyte connector based tasks require a `secrets` folder in the respective task folder.
  For now this means that before using the GitHub integration you should make a `task-executor/src/tasks/source-github/secrets` folder and for the Asana integration you should make a `task-executor/src/tasks/source-asana/secrets` directory.
  This will be used to store the artifacts like `catalog.json`.
