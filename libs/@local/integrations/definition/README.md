# HASH Integrations Definition

The checked model of an integration definition: the sources an integration reads, the pipelines that turn their rows into entities and links, and the unit maps that give measured values their data types.

`Definition::new` checks a definition's parts and reports every issue it finds, each with the path of the part it concerns.

`Definition::from_yaml` parses a definition from YAML 1.2, where unquoted numbers and booleans are refused as text. It reports the first place where the text is not YAML or does not fit the format, or else every issue with its line and column where known. The checks of `Definition::new` run only when the YAML builds into parts without issues.

[`examples/aviation.yaml`](examples/aviation.yaml) is a complete definition.

Sources select one of `sql`, `checkpoint`, `local`, `postgres`, `redshift`, or `rest`. Live sources declare `primaryKey`; PostgreSQL and REST credentials refer to User Secret entities by UUID. [`tests/ui/source-connectors.yaml`](tests/ui/source-connectors.yaml) shows local, Redshift, and paginated REST sources. Unknown fields and inline authentication tokens are rejected.

PostgreSQL and Redshift sources use a PostgreSQL connection URI. Credentials are resolved from the
referenced User Secret. Connections default to `sslmode=verify-full`; an explicit `sslmode=require`
or `sslmode=disable` can be supplied in the URI.

```yaml
sources:
  orders:
    postgres:
      connection: postgresql://database.example.com:5432/orders
      schema: public
      table: orders
      credentials:
        secretEntityUuid: 22222222-2222-4222-8222-222222222222
    primaryKey: [id]
```

The URI can contain `${NAME}` variables. Connection settings such as `connect_timeout` use URI query
parameters. Usernames and passwords are supplied by the User Secret.
