# HASH Graph API

This crate provides the REST and HaRPC APIs for the HASH Graph.

## OpenAPI Documentation

The API includes automatic OpenAPI specification generation. To generate the latest OpenAPI
specification:

```bash
yarn codegen:generate-openapi-specs
```

This will generate the OpenAPI specification in the `openapi/` directory, which can be used
to generate client SDKs or to document the API.

When the Graph is running locally, the specification is served at http://localhost:4000/openapi.json
and an interactive reference for it at http://localhost:4000/openapi. The reference requires
`HASH_GRAPH_SERVE_API_REFERENCE=true`, which the committed `.env` already sets.
