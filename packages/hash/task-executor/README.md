# Task Executor

The HASH Task Executor is a temporary solution to allow the workspace to trigger the execution of scripts.

Designed to be built into a self-contained docker image ([see the relevant Dockerfile](/packages/hash/docker/task-executor/Dockerfile)), the Executor is a lightweight Node HTTP server with a set of hardcoded routes to run the bundled tasks.

Tasks are executed on child processes: \* Python scripts are executed within a virtual environment managed by the [./setup.sh](./setup.sh) script, with dependencies defined in [./requirements.txt](./requirements.txt)
