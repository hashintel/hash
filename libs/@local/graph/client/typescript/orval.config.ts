import { defineConfig } from "orval";

export default defineConfig({
  graph: {
    input: {
      target: "../../api/openapi/openapi.json",
      parserOptions: { externalRefs: { allow: ["*"] } },
    },
    output: {
      client: "fetch",
      mode: "single",
      target: "src/api.gen.ts",
      headers: true,
      urlEncodeParameters: true,
      override: {
        fetch: {
          httpClientInjection: "factory",
          includeHttpResponseReturnType: false,
        },
      },
    },
  },
});
