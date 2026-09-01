# HASH Graph

Library crates for the HASH graph. The runnable service lives in `apps/hash-graph`. See `README.md` for the crate map.

## Domain types

Implement `hash_graph_types` traits for custom domain types. Prefer newtypes for identifiers and other values that carry domain semantics.

## OpenAPI

If changes affect the `hash-graph-api` crate or any representation that influences the public interface, regenerate the OpenAPI specifications:

```bash
cd libs/@local/graph/api
cargo run --bin openapi-spec-generator
```
