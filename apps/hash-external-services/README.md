# HASH External Services

## Overview

This directory contains a number of external services used throughout HASH (Ory Kratos, OpenSearch, Postgres, and Temporal).

### LLM prototyping

This also contains an experimental Docker compose file for prototyping LLM-based services using relevant external services such as a vector database.
You'll be able to execute the following command from the repository root directory to start the prototyping external services:

```sh
yarn external-services:prototype up
```

As with other external services, the arguments passed after the script name are arguments for `docker compose`.

## Future plans

These will be migrated into semantic folders in the future. For example, within the `apps` folder:

1.  `hash-external-services/kratos` → `hash-authentication`
1.  `hash-external-services/opensearch` → `hash-search`
1.  `hash-external-services/postgres` → `hash-database`
1.  `hash-external-services/temporal` → `hash-executor`
