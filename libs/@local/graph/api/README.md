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
