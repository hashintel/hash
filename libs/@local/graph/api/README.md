# HASH Graph API

This crate provides the REST and HaRPC APIs for the HASH Graph.

## OpenAPI Documentation

The API includes automatic OpenAPI specification generation. To generate the latest OpenAPI
specification:

```bash
yarn build:openapi
```

This will generate the OpenAPI specification in the `openapi/` directory, which can be used
to generate client SDKs or to document the API.

When the Graph is running locally, http://localhost:4000/ provides an interactive reference
for Entities v1, Types v1, Internal, and Legacy. The Graph serves Scalar's JavaScript bundle locally.
Each API has its own `openapi.json`; the legacy specification remains at
http://localhost:4000/openapi.json.

OpenAPI snapshots for Entities v1, Types v1, and Internal are stored as JSON in
[`tests/snapshots/openapi/`](tests/snapshots/openapi/). Each filename is the API's route prefix
with slashes replaced by hyphens.

Scalar display settings live in [`scalar.json`](src/rest/documentation/scalar.json) and are
embedded at build time. Rust supplies the document sources and enables authentication persistence
across browser refreshes only in debug builds.

Entities v1, Types v1, Internal, and Legacy share one set of actor and anonymous rate-limit
budgets, configured through the CLI, and one IP rate-limit budget ahead of authentication.
