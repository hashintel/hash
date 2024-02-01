# HASH AI Worker (TypeScript)

A Temporal worker for running AI-inference workflows.

## Configuration

The service uses the following environment variables:

- `HASH_TEMPORAL_SERVER_HOST`: The hostname that the Temporal server is running on (defaults to `localhost`).
- `HASH_TEMPORAL_SERVER_PORT`: The port that the Temporal server is running on (defaults to `7233`).
- `OPENAI_API_KEY`: The OpenAI API key that is made available to workflows and activities.

### Run the worker

- Ensure the environment variables above are set, either in `.env.local` or in your shell.
- Install dependencies:
  - `yarn`
- Run the worker:
  - `yarn dev`
