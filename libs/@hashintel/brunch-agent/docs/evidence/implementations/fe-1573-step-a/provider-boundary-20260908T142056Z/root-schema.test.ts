// Evidence-only: installed conversion, no mounting, network, or payload rewriting.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { test } from "node:test";

import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { toJsonSchema, type JsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { canonicalSchemaCarrier } from "../../../../../packages/plugin-sdcpn/src/tools/canonical-schema-carrier.ts";

import type { Tool } from "@earendil-works/pi-ai";

type ProbeTool = Tool & { parameters: JsonSchema };

// Installed private converter is inspected/executed diagnostically, never a product dependency.
const { i: flueConvert } = (await import(
  new URL("./schema-DIDpvZZa.mjs", import.meta.resolve("@flue/runtime")).href
)) as { i: (schema: v.GenericSchema) => ProbeTool["parameters"] };
const provider = anthropicProvider();
const model = provider
  .getModels()
  .find((entry) => entry.id === "claude-sonnet-4-6");
assert(model);
const canonical = petrinautAiTools.addArc.inputSchema.toJSONSchema();
const { $schema: _dialect, ...arc } = canonical;
const carrier = canonicalSchemaCarrier(canonical);
assert.deepEqual(flueConvert(carrier), arc);

// Native-library recursive fixture, not Petrinaut fields or transition admission.
const recursive: v.GenericSchema = v.lazy(() =>
  v.union([v.string(), v.array(recursive)]),
);
const recursiveRoot = v.pipe(
  v.strictObject({ value: recursive }),
  v.description("Synthetic recursive root description"),
);
const { $schema: _recursiveDialect, ...standaloneRecursiveSchema } =
  toJsonSchema(recursiveRoot, { errorMode: "ignore" });
// Separate exports allocate different definition labels for this lazy fixture.
// Preserve the actual Flue output, rather than normalizing reference identities.
const recursiveSchema = flueConvert(recursiveRoot);
assert.equal(v.safeParse(recursiveRoot, { value: ["a", ["b"]] }).success, true);
assert.equal(v.safeParse(recursiveRoot, { value: ["a", [1]] }).success, false);

const refs = (value: unknown): string[] => {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) =>
    key === "$ref" && typeof child === "string" ? [child] : refs(child),
  );
};
const dangling = (schema: unknown) =>
  refs(schema).filter((ref) => {
    assert(ref.startsWith("#/"), "Only local references in this fixture");
    let node: unknown = schema;
    for (const segment of ref.slice(2).split("/")) {
      const key = segment.replaceAll("~1", "/").replaceAll("~0", "~");
      node =
        node && typeof node === "object" ? Reflect.get(node, key) : undefined;
    }
    return node === undefined;
  });
assert(refs(recursiveSchema).length > 1);
assert.deepEqual(dangling(recursiveSchema), []);
const tools: ProbeTool[] = [
  {
    name: "addArc",
    description: petrinautAiTools.addArc.description,
    parameters: flueConvert(carrier),
  },
  {
    name: "recursiveDiagnostic",
    description: "Synthetic only",
    parameters: recursiveSchema,
  },
];
type Payload = {
  model: string;
  tools: {
    name: string;
    strict?: boolean;
    input_schema: ProbeTool["parameters"];
  }[];
};
const observations: unknown[] = [];
let forbiddenFetchCalls = 0;
const forbiddenFetch: typeof fetch = async () => {
  forbiddenFetchCalls++;
  throw new Error("Network forbidden");
};
globalThis.fetch = forbiddenFetch;

for (const method of ["stream", "streamSimple"] as const) {
  for (const mode of ["omitted", "false", "prefer", "require"] as const) {
    void test(`${method}: ${mode} at installed Anthropic pre-HTTP boundary`, async () => {
      const input = tools.map(
        (tool): ProbeTool => ({
          ...tool,
          ...(mode === "omitted"
            ? {}
            : {
                constrainedSampling:
                  mode === "false"
                    ? false
                    : { type: "json_schema", strict: mode },
              }),
        }),
      );
      let payload: Payload | undefined;
      const result = await provider[method](
        model,
        {
          messages: [
            { role: "user", content: "Synthetic capture only", timestamp: 0 },
          ],
          tools: input,
        },
        {
          apiKey: "synthetic-not-a-credential",
          maxTokens: 1,
          maxRetries: 0,
          fetch: forbiddenFetch,
          onPayload(body) {
            payload = structuredClone(body) as Payload;
            throw new Error("Deliberate pre-HTTP stop");
          },
        },
      ).result();
      assert.equal(result.stopReason, "error");
      assert.match(result.errorMessage ?? "", /Deliberate pre-HTTP stop/);
      assert(payload);
      assert.equal(payload.model, model.id);
      const strict = mode === "prefer" || mode === "require";
      for (const [index, tool] of input.entries()) {
        const output: Payload["tools"][number] | undefined =
          payload.tools[index];
        assert(output);
        assert.equal(output.strict, strict ? true : undefined);
        if (strict) {
          assert.deepEqual(output.input_schema, tool.parameters);
          assert.deepEqual(dangling(output.input_schema), []);
        } else {
          assert.deepEqual(output.input_schema, {
            type: "object",
            properties: tool.parameters.properties,
            required: tool.parameters.required,
          });
          assert.equal(output.input_schema.additionalProperties, undefined);
          assert.equal(output.input_schema.description, undefined);
          assert.equal(output.input_schema.$defs, undefined);
        }
      }
      if (!strict) assert(dangling(payload.tools[1]!.input_schema).length > 0);
      assert.equal(forbiddenFetchCalls, 0);
      observations.push({ method, mode, input, payload });
    });
  }
}
const serializedObservations: unknown[] = [];
for (const strict of [false, true]) {
  void test(`SDK serialization preserves the observed ${strict ? "strict" : "legacy"} payload`, async () => {
    let prepared: Payload | undefined;
    let serialized: Payload | undefined;
    let syntheticFetchCalls = 0;
    const result = await provider
      .streamSimple(
        model,
        {
          messages: [],
          tools: tools.map((tool) => ({
            ...tool,
            constrainedSampling: strict
              ? { type: "json_schema" as const, strict: "require" as const }
              : false,
          })),
        },
        {
          apiKey: "synthetic-not-a-credential",
          maxTokens: 1,
          maxRetries: 0,
          onPayload(body) {
            prepared = structuredClone(body) as Payload;
          },
          fetch: async (_request, init) => {
            syntheticFetchCalls++;
            assert.equal(typeof init?.body, "string");
            serialized = JSON.parse(init!.body as string) as Payload;
            // A local response ends the SDK call; no socket or real fetch is invoked.
            return new Response(
              JSON.stringify({
                type: "error",
                error: {
                  type: "invalid_request_error",
                  message: "Synthetic capture stop",
                },
              }),
              { status: 400, headers: { "content-type": "application/json" } },
            );
          },
        },
      )
      .result();
    assert.equal(syntheticFetchCalls, 1);
    assert.equal(result.stopReason, "error");
    assert(prepared);
    assert(serialized);
    assert.deepEqual(serialized.tools, prepared.tools);
    assert.equal(serialized.model, model.id);
    assert.equal(forbiddenFetchCalls, 0);
    serializedObservations.push({
      strict,
      syntheticFetchCalls,
      payload: serialized,
    });
  });
}

void test("retain curated schema observations when requested", () => {
  assert.equal(observations.length, 8);
  assert.equal(serializedObservations.length, 2);
  if (process.env.PROVIDER_BOUNDARY_REPORT === "1") {
    writeFileSync(
      new URL("root-schema.json", import.meta.url),
      `${JSON.stringify(
        {
          scope:
            "Synthetic installed pre-HTTP conversion only; not provider acceptance or production mounting",
          model,
          canonicalRootDialectOmittedByFlue: _dialect,
          standaloneRecursiveSchema,
          canonicalSha256: createHash("sha256")
            .update(JSON.stringify(canonical))
            .digest("hex"),
          forbiddenFetchCalls,
          observations,
          serializedObservations,
        },
        null,
        2,
      )}\n`,
    );
  }
});
