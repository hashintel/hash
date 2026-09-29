# HASH Integrations Engine

Runs an integration's pipelines in DuckDB.

Each run has a `Workspace`: a DuckDB database file whose only connection is owned by a dedicated thread. Statements run in the order they are sent. They can open files only in the directories the workspace allows and in DuckDB's temporary directory, and they cannot install extensions or change settings. `Workspace::snapshot` writes a copy of the database that DuckDB can open on its own. `WorkspaceConfig` limits the memory and threads DuckDB uses, the data it spills to disk, and the disk space of the workspace files.

`Identifier` and `StringLiteral` quote names and strings for DuckDB statements.
