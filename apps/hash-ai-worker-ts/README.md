# HASH AI workers (ts)

This app is a Temporal.io worker that is able to run workflows and activities.

## Configuration

The service uses the following environment variables:

- `HASH_TEMPORAL_HOST`: The hostname that the Temporal server is running on (defaults to `localhost`).
- `HASH_TEMPORAL_PORT`: The port that the Temporal server is running on (defaults to `7233`).
- `OPENAI_API_KEY`: The OpenAI API key that is made availble to workflows and activities.
