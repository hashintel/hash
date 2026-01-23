# HASH Integration Worker

This app is a Temporal worker that is able to run workflows and activities for data integration. It's able to read from and write to external data sources such as GitHub or Linear from or to HASH

## Configuration

The service uses the following environment variables:

- `HASH_GRAPH_HTTP_HOST`: The host address that the HASH Graph HTTP service is running on, e.g. `graph`, `127.0.0.1`
- `HASH_GRAPH_HTTP_PORT`: The port that the HASH Graph HTTP service is running on, e.g. `4000`
- `HASH_GRAPH_RPC_HOST`: The host address that the HASH Graph RPC service is running on, e.g. `graph`, `127.0.0.1`
- `HASH_GRAPH_RPC_PORT`: The port that the HASH Graph RPC service is running on, e.g. `4002`
- `HASH_TEMPORAL_SERVER_HOST`: The host address (including protocol) that the Temporal server is running on (defaults to `http://localhost`).
- `HASH_TEMPORAL_SERVER_PORT`: The port that the Temporal server is running on (defaults to `7233`).
- `HASH_VAULT_HOST`: The host address (including protocol) that the Vault server is running on, e.g. `http://127.0.0.1`
- `HASH_VAULT_PORT`: The port that the Vault server is running on, e.g. `8200`
- `HASH_VAULT_ROOT_TOKEN`: The token to authenticate with the Vault server. If not present, login via AWS IAM is attempted instead.
- `HASH_VAULT_MOUNT_PATH`: The mount path for the KV secrets engine, e.g. `secret`.
