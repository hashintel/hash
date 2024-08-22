# HASH AI Worker (TypeScript)

A Temporal worker for running AI-inference workflows.

## Configuration

The service uses the following environment variables:

- `HASH_TEMPORAL_SERVER_HOST`: The hostname that the Temporal server is running on (defaults to `localhost`).
- `HASH_TEMPORAL_SERVER_PORT`: The port that the Temporal server is running on (defaults to `7233`).
- `OPENAI_API_KEY`: The OpenAI API key that is made available to workflows and activities.
- `ANTHROPIC_API_KEY`: The Anthropic API key that is made available to workflows and activities.
- `HASH_GRAPH_API_HOST`: The host address that the HASH Graph API is running on, e.g. `graph`, `127.0.0.1`
- `HASH_GRAPH_API_PORT`: The port that the HASH Graph API is running on, e.g. `4000`
- `INTERNAL_API_HOST`: The host for the internal API, required if the internal API is not running locally for workflows making use of the `getWebSearchResultsActivity` activity
- `INTERNAL_API_KEY`: The API key used to authenticate with the internal API, required for workflows making use of the `getWebSearchResultsActivity` activity
- `HASH_VAULT_HOST`: The host address (including protocol) that the Vault server is running on, e.g. `http://127.0.0.1`
- `HASH_VAULT_PORT`: The port that the Vault server is running on, e.g. `8200`
- `HASH_VAULT_ROOT_TOKEN`: The token to authenticate with the Vault server.

### Run the worker

- Ensure the environment variables above are set, either in `.env.local` or in your shell.
- Install dependencies:
  - `yarn`
- Run the worker:
  - `yarn dev`

### Running AI-dependent tests / optimization

To enable loading environment variables into tests, `TEST_AI=true` must be set in the environment.

e.g. to run a specific test, from this folder (`hash-ai-worker-ts`):

```bash
TEST_AI=true npx vitest get-entity-summaries-from-text.ai.test.ts

or

TEST_AI=true LOG_LEVEL=debug npx vitest get-entity-summaries-from-text.ai.test.ts
```
