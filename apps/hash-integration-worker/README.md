# HASH Integration Worker

This app is a Temporal worker that is able to run workflows and activities for data integration. It's able to read from and write to external data sources such as GitHub or Linear from or to HASH

## Configuration

The service uses the following environment variables:

- `HASH_TEMPORAL_HOST`: The hostname that the Temporal server is running on (defaults to `localhost`).
- `HASH_TEMPORAL_PORT`: The port that the Temporal server is running on (defaults to `7233`).
