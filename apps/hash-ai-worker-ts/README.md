# HASH AI Worker (TypeScript)

A Temporal worker for running AI-inference workflows.

## Configuration

The service uses the following environment variables:

- `HASH_TEMPORAL_SERVER_HOST`: The hostname that the Temporal server is running on (defaults to `localhost`).
- `HASH_TEMPORAL_SERVER_PORT`: The port that the Temporal server is running on (defaults to `7233`).
- `OPENAI_API_KEY`: The OpenAI API key that is made available to workflows and activities.
- `HASH_GRAPH_API_HOST`: The host address that the HASH Graph API is running on, e.g. `graph`, `127.0.0.1`
- `HASH_GRAPH_API_PORT`: The port that the HASH Graph API is running on, e.g. `4000`
- `INTERNAL_API_KEY`: The API key used to authenticate with the internal API, required for workflows making use of the `getWebSearchResultsActivity` activity

### Run the worker

- Ensure the environment variables above are set, either in `.env.local` or in your shell.
- Install dependencies:
  - `yarn`
- Run the worker:
  - `yarn dev`
