# hash-integrations-collect

Collects the tables of an integration's source with [dlt](https://dlthub.com) into Delta tables, which the ledger's `hash-integrations-follow` captures from.

Each table of the source is merged by its primary key into `tenants/{web}/integrations/{sha256("{web}:{connector}")}/dlt/{table}` in the ledger's bucket, with Delta's change data feed on. The ledger reads the changes between two versions of a table as a run's capture file, so this package keeps no state of its own: dlt keeps its pipeline state in the same bucket.

`hash-integrations-collect github` collects the issues and pull requests of a GitHub repository on an interval, and `--once` collects once. Every setting comes from dlt's configuration, in `.dlt/config.toml` and `.dlt/secrets.toml` of the folder `--config-dir` names, or of the working folder:

- `[integration]`: `web`, `connector`, `bucket_uri` (the ledger's bucket, as `s3://bucket/prefix`) and `every`, the seconds between two collections
- `[sources.github]`: `owner`, `repo`, `initial_days` and the secret `access_token`
- `[destination.filesystem.credentials]`: the bucket's `aws_access_key_id`, `aws_secret_access_key`, `region_name` and, for MinIO, `endpoint_url`. dlt counts the whole section as secret, so it goes in `secrets.toml`, never in `config.toml`.

dlt also reads each setting from an environment variable, such as `INTEGRATION__BUCKET_URI` or `SOURCES__GITHUB__ACCESS_TOKEN`, which takes precedence over the files.

`examples/github/.dlt/config.toml` configures the GitHub example for the local HASH stack:

```sh
uv run --all-packages hash-integrations-collect \
    --config-dir libs/@local/integrations/collect/examples/github github
```

Its `secrets.toml`, which git ignores, holds the local MinIO's development keys.
