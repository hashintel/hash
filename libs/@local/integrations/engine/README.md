# HASH Integrations Engine

Runs an integration's pipelines in DuckDB.

Each run gets a `Workspace`, a DuckDB database file in which the run's queries execute. A query is a single `SELECT`, and cannot open files, load extensions or change settings.
