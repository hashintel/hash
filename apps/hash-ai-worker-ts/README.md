# HASH AI Worker (TypeScript)

A Temporal worker for running AI-inference workflows.

## Configuration

The service uses the following environment variables:

- `HASH_TEMPORAL_SERVER_HOST`: The hostname that the Temporal server is running on (defaults to `localhost`).
- `HASH_TEMPORAL_SERVER_PORT`: The port that the Temporal server is running on (defaults to `7233`).
- `OPENAI_API_KEY`: The OpenAI API key that is made available to workflows and activities.
- `ANTHROPIC_API_KEY`: The Anthropic API key that is made available to workflows and activities.
- `HASH_GRAPH_HTTP_HOST`: The host address that the HASH Graph service is running on, e.g. `graph`, `127.0.0.1`
- `HASH_GRAPH_HTTP_PORT`: The port that the HASH Graph HTTP service is running on, e.g. `4000`
- `HASH_GRAPH_RPC_HOST`: The host address that the HASH Graph RPC service is running on, e.g. `graph`, `127.0.0.1`
- `HASH_GRAPH_RPC_PORT`: The port that the HASH Graph RPC service is running on, e.g. `4002`
- `INTERNAL_API_HOST`: The host for the internal API, required if the internal API is not running locally for workflows making use of the `getWebSearchResultsActivity` activity
- `INTERNAL_API_KEY`: The API key used to authenticate with the internal API, required for workflows making use of the `getWebSearchResultsActivity` activity
- `HASH_VAULT_HOST`: The host address (including protocol) that the Vault server is running on, e.g. `http://127.0.0.1`
- `HASH_VAULT_PORT`: The port that the Vault server is running on, e.g. `8200`
- `HASH_VAULT_ROOT_TOKEN`: The token to authenticate with the Vault server.  If not present, login via AWS IAM is attempted instead.
- `HASH_VAULT_MOUNT_PATH`: The mount path for the KV secrets engine, e.g. `secret`.
- `GOOGLE_CLOUD_HASH_PROJECT_ID`: The projectId for a Google Cloud Platform project, used in document analysis (Vertex AI and Cloud Storage). Note that this is the Project ID, _not_ the Project Number.
- `GOOGLE_CLOUD_STORAGE_BUCKET`: The name of the Google Cloud Storage bucket to use for document analysis.
- `GOOGLE_APPLICATION_CREDENTIALS`: The path to a configuration file for GCP authentication. Automatically set locally by the `gcloud` CLI, and set manually during the build process.

### Run the worker

- To use actions which require Google Cloud Platform, you must run `gcloud auth application-default login` before starting the worker.
- Ensure the environment variables above are set, either in `.env.local` or in your shell.
- Install dependencies:
  - `yarn`
- Run the worker:
  - `yarn dev`

### Logging

To help inspect the workings of the flow, logs of different levels of detail are written to different locations.

In development, `LOG_LEVEL=debug` is advised (and hardcoded into the `yarn dev` command for this app) for the most detailed logs.

Important to know:

- If `LOG_LEVEL=DEBUG`, every LLM request will be logged.
- In `development` and `test` only:
  - The console output for each Flow run is written to the file system in the `activities/shared/flow-run-logs` directory.
  - Each LLM request and response pair is written to the file system in `activities/shared/get-llm-response/logs` directory (assuming `LOG_LEVEL=debug`).
- For LLM requests, detailed fields `request` and `response` are omitted from the console, but are available in the individual request files.
- If `DATADOG_API_KEY` is set in the environment, logs will be sent to Datadog.
-

### Running AI-dependent tests / optimization

To enable loading environment variables into tests, `TEST_AI=true` must be set in the environment.

e.g. to run a specific test, from this folder (`hash-ai-worker-ts`):

```bash
TEST_AI=true npx vitest get-entity-summaries-from-text.ai.test.ts

or

TEST_AI=true LOG_LEVEL=debug npx vitest get-entity-summaries-from-text.ai.test.ts
```
