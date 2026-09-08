// Unpaid installed-adapter discriminator. No agent, route, mount or HTTP request.
// Run from repo root: node --experimental-strip-types <this-file>
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { defineTool } from "@flue/runtime";
import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

import {
  normalizePetrinautAiToolInput,
  petrinautAiTools,
} from "@hashintel/petrinaut-core/ai";

import { canonicalSchemaCarrier } from "../../../../../packages/plugin-sdcpn/src/tools/canonical-schema-carrier.ts";

// Diagnostic import of the pinned installed implementation (not a public API).
// This executes Flue's real converter without inventing a second agent/mount.
const { i: flueConvert, r: flueParse } = await import(
  new URL("./schema-DIDpvZZa.mjs", import.meta.resolve("@flue/runtime"))
);
const normalizedArcInput = v.pipe(
  v.looseObject({}),
  v.transform((input) => normalizePetrinautAiToolInput("addArc", input)),
  canonicalSchemaCarrier(petrinautAiTools.addArc.inputSchema.toJSONSchema()),
  v.rawTransform((context) => {
    const parsed = petrinautAiTools.addArc.inputSchema.safeParse(
      context.dataset.value,
    );
    if (parsed.success) return parsed.data;
    for (const issue of parsed.error.issues)
      context.addIssue({ message: issue.message });
    return context.NEVER;
  }),
);
const diagnostic = defineTool({
  name: "a1UnMountedArcDiagnostic",
  description:
    "Synthetic local schema and parser diagnostic; never mounted or executed",
  input: normalizedArcInput,
  run() {
    throw new Error("Execution forbidden");
  },
});
const arcArguments = {
  transitionId: "transition",
  arcDirection: "input",
  placeId: "place",
  weight: "1",
};
const arcParsed = flueParse(diagnostic.input, arcArguments);
assert.deepEqual(arcParsed, {
  success: true,
  output: { ...arcArguments, weight: 1 },
});
assert.equal(
  flueParse(diagnostic.input, { ...arcArguments, weight: "0" }).success,
  false,
);
assert.equal(
  flueParse(diagnostic.input, { ...arcArguments, extra: true }).success,
  false,
);
assert.equal(
  flueParse(diagnostic.input, {
    ...arcArguments,
    endpoint: { kind: "place", placeId: "place" },
  }).success,
  false,
);
const tools = ["addArc", "addPlace", "addType", "getLatestNetDefinition"].map(
  (name) => {
    const carrier =
      name === "addArc"
        ? diagnostic.input
        : canonicalSchemaCarrier(
            petrinautAiTools[name].inputSchema.toJSONSchema(),
          );
    const { $schema: _dialect, ...parameters } = toJsonSchema(carrier, {
      errorMode: "ignore",
    });
    assert.deepEqual(flueConvert(carrier), parameters);
    return {
      name,
      description: "Synthetic unmounted adapter probe",
      parameters,
    };
  },
);
const json = v.lazy(() =>
  v.union([
    v.string(),
    v.number(),
    v.boolean(),
    v.null(),
    v.array(json),
    v.record(v.string(), json),
  ]),
);
const { $schema: _dialect, ...parameters } = toJsonSchema(
  v.strictObject({ metadata: v.optional(v.record(v.string(), json)) }),
  { errorMode: "ignore" },
);
tools.push({
  name: "recursiveDiagnostic",
  description: "Synthetic native lazy reproducer, not an admitted tool",
  parameters,
});
let fetchCalls = 0;
let payload;
const sentinel = "A1 deliberate stop before HTTP";
const provider = anthropicProvider();
const model = provider
  .getModels()
  .find((candidate) => candidate.id === "claude-sonnet-4-6");
assert(model);
const response = await provider
  .streamSimple(
    model,
    {
      messages: [
        {
          role: "user",
          content: "Synthetic schema export only; do not execute.",
          timestamp: 0,
        },
      ],
      tools,
    },
    {
      apiKey: "a1-synthetic-not-a-credential",
      maxTokens: 1,
      fetch: async () => {
        fetchCalls++;
        throw new Error("HTTP forbidden");
      },
      onPayload: (body) => {
        payload = structuredClone(body);
        throw new Error(sentinel);
      },
    },
  )
  .result();
assert.equal(fetchCalls, 0);
assert.equal(response.stopReason, "error");
assert(response.errorMessage.includes(sentinel));
assert(payload);
for (const tool of tools) {
  const sent = payload.tools.find(
    (entry) => entry.name === tool.name,
  ).input_schema;
  assert.deepEqual(sent, {
    type: "object",
    properties: tool.parameters.properties,
    required: tool.parameters.required ?? [],
  });
  assert.equal(tool.parameters.additionalProperties, false);
  assert.equal(sent.additionalProperties, undefined);
}
const recursive = payload.tools.find(
  (tool) => tool.name === "recursiveDiagnostic",
).input_schema;
assert.equal(recursive.$defs, undefined);
assert(recursive.properties.metadata.additionalProperties.$ref);
// Preserve the distinction observed in the prior paid run, without modifying it.
const paid = new URL("../a1-paid-2026-09-08T08-44-14-222Z/", import.meta.url);
const priorContext = JSON.parse(
  readFileSync(new URL("generated-schema.json", paid), "utf8"),
);
const priorRequest = JSON.parse(
  readFileSync(new URL("request-3.json", paid), "utf8"),
).payload.tools.find((tool) => tool.name === "addType").input_schema;
assert.equal(priorContext.additionalProperties, false);
assert.equal(priorRequest.additionalProperties, undefined);
writeFileSync(
  new URL("provider-boundary.json", import.meta.url),
  `${JSON.stringify({ paid: false, mounted: false, fetchCalls, arcArguments, arcParsed, tools, payload, response, priorPaidRootStrictness: { flue: priorContext.additionalProperties, requestKeywordPresent: Object.hasOwn(priorRequest, "additionalProperties") }, scope: "Installed Anthropic adapter payload only; deliberately aborted before HTTP. Not provider acceptance or a built candidate mount." }, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    passed: true,
    paid: false,
    mounted: false,
    fetchCalls,
    rootStrictnessLost: true,
    recursiveDefinitionsLost: true,
  }),
);
