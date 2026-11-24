# @local/internal-api-client

TypeScript client for the HASH internal API. `yarn codegen` generates `src/api.gen.ts` from `openapi.json` with [orval](https://orval.dev). The generated file is not committed; `build` and `lint:tsc` run `codegen` first.

`openapi.json` is a copy of `apps/internal-api/openapi.json` in `hashintel/internal`. When that spec changes, copy it here.
