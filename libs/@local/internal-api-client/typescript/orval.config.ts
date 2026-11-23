import { defineConfig } from "orval";

import type { Options } from "orval";

export const options = {
  input: {
    target: "./openapi.json",
    // The spec says OpenAPI 3.0 but writes `waitlistPosition` as a
    // `oneOf` with `{ "type": "null" }`, which only 3.1 allows. orval still
    // generates `number | null` from it.
    unsafeDisableValidation: true,
  },
  output: {
    client: "fetch",
    mode: "single",
    target: "src/api.gen.ts",
    urlEncodeParameters: true,
    override: {
      fetch: {
        httpClientInjection: "factory",
        includeHttpResponseReturnType: false,
      },
    },
  },
} satisfies Options;

export default defineConfig({ internalApi: options });
