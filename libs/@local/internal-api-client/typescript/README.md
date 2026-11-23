# @local/internal-api-client

TypeScript client for the HASH internal API. `yarn codegen` generates `src/api.gen.ts` from `openapi.json` with [orval](https://orval.dev).

`openapi.json` is a copy of `apps/internal-api/openapi.json` in `hashintel/internal`. When that spec changes, copy it here and run `yarn codegen`. `yarn test:unit` fails while `src/api.gen.ts` differs from what `openapi.json` generates.
