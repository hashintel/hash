# HASH Integration Worker

This app is a Temporal worker that is able to run workflows and activities for data integration. It's able to read from and write to external data sources such as GitHub or Linear from or to HASH

## Configuration

The service uses the following environment variables:

- `HASH_GRAPH_API_HOST`: The host address (including protocol) that the HASH Graph API is running on, e.g. `http://localhost`
- `HASH_GRAPH_API_PORT`: The port that the HASH Graph API is running on, e.g. `4000`
- `HASH_TEMPORAL_SERVER_HOST`: The host address (including protocol) that the Temporal server is running on (defaults to `http://localhost`).
- `HASH_TEMPORAL_SERVER_PORT`: The port that the Temporal server is running on (defaults to `7233`).
- `HASH_VAULT_HOST`: The host address (including protocol) that the Vault server is running on, e.g. `http://127.0.0.1`
- `HASH_VAULT_PORT`: The port that the Vault server is running on, e.g. `8200`
- `HASH_VAULT_TOKEN`: The token to authenticate with the Vault server.
