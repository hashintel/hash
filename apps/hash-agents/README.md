# HASH Agents

## Description

This is a collection of LLM agents that are being used in HASH. The agents are defined in the [`app/agents/`](app/agents) directory and are organized as modules. The top-level module is able to run the different agents.

## Requirements

- Python 3.x > 3.11 (the version used in HASH is 3.11)

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
- Generate the Python typings for the agents:
  - `yarn codegen`

### Subsequent Runs (or after Pre-Setup)

- Ensure the OpenAI API key is available
- If the requirements has been changed:
  - `poetry install`
- If the typings for the agents have been changed:
  - `yarn codegen`

## Running

To run the agent orchestrator, pass the agent name alongside the input you want to pass to the agent:

```bash
poetry run python -m app.agents <AGENT_NAME> <INPUT>
```

A server is available to run the agents. To run the server, use the following command:

```bash
yarn dev
```

The server will read the `HASH_AGENT_RUNNER_HOST` and `HASH_AGENT_RUNNER_PORT` environment variables to determine the host and port to run on. If these are not set, the server will run on `localhost:5000`.

The server will be run as external service. Please refer to the [HASH Readme](../hash/README.md) for more information on how to run the external services.

### Logging

You can configure the logging level with the `HASH_AGENT_RUNNER_LOG_LEVEL` environment variable.
This can be set either in the `.env.local` or within the environment when you run the module.
The possible values are those accepted by [Python's `logging` library](https://docs.python.org/3/library/logging.html#levels).

If the environment variable is not set, it will default to `DEBUG` in a development environment and `WARNING` in a production environment.

All logs will be output to a `$HASH_AGENT_RUNNER_LOG_FOLDER/run-TIMESTAMP.log` file, where `TIMESTAMP` is the time the module was started. If the environment variable is not set, the logs will be output to the `logs` directory.

## Developing agents

> Whenever you're making changes to the `io_types.ts` file for an agent, be sure to re-run the `yarn codegen` command to ensure the python typings are up to date.

### Adding a new agent

To add a new agent, you need to create a new module in the [`app/agents/`](app/agents) directory. For this, it's recommended to copy the `template` module and rename it to the name of your agent.

You should have an `io_types.ts` file in this newly copied directory, this folder contains your `Input` and `Output` types. These types are the shape of the data your agent expects to receive and the shape of the data your agent will return to callers in JSON format. **Be sure to keep the type names** as other parts of the system expect them to exist. You can make the types the empty object `{}` if no input or output is required.

To avoid going through the top-level module it's possible to directly invoke the agent module, e.g.:

```bash
poetry run python -m app.agents.my_agents
```

When the server is running as an external service, the `agents` directory is mounted, so it's possible to add new agents or modify agents without restarting the server.

### Calling from HASH frontend

Once you've added your new agent, you will be able to trivially call them from the frontend and backend using their directory names and defined input types.

In the frontend, you can run an agent by using the `useAgentRunner` hook from [`apps/hash-frontend/src/components/hooks/use-agent-runner.ts`](/apps/hash-frontend/src/components/hooks/use-agent-runner.ts) and calling it with the agent name and input.

In the backend, we provide a `agentRunner` DataSouce which exposes a `runAgent` function that will call the agent runner server using the agent name and input.

Both approaches are fully typed and use the provided type information to ensure each agent call is properly typed/type narrowed.

Example frontend page using the agent runner:

```tsx
const Page = () => {
  const [prompt, setPrompt] = useState("What is 23 times 2?");
  const [expression, setExpression] = useState(prompt);
  const [output, setOutput] = useState("");
  const [callAgentRunner, { loading }] = useAgentRunner("template");

  useEffect(() => {
    void callAgentRunner({ expression }).then((data) => {
      if (data) {
        setOutput(data.result.toString());
      }
    });
  }, [callAgentRunner, expression]);

  return (
    <Container sx={{ paddingTop: 5 }}>
      <Typography variant="h3">Test the math agent!</Typography>

      <input
        type="text"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
      />

      <Button
        onClick={() => {
          setExpression(prompt);
        }}
      >
        Create
      </Button>

      {loading ? <p>Loading...</p> : <p>{output}</p>}
    </Container>
  );
};
```
