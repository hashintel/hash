import { defineConfig } from "orval";

/** `"Post Optimize Runs"` → `"postOptimizeRuns"`. */
const camelCase = (text: string) =>
  text
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word !== "")
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`,
    )
    .join("");

export default defineConfig({
  petrinautOptimizer: {
    input: "../../../apps/petrinaut-opt/openapi/openapi.json",
    output: {
      client: "fetch",
      mode: "single",
      target: "src/openapi.gen.ts",
      urlEncodeParameters: true,
      override: {
        fetch: {
          includeHttpResponseReturnType: true,
        },
        mutator: {
          path: "src/optimizer-fetch.ts",
          name: "petrinautOptimizerFetch",
        },
        operationName: (operation, route, verb) =>
          camelCase(operation.summary ?? `${verb} ${route}`),
      },
    },
  },
});
