/**
 * HASH port unit H0c (`hash-agent-port.md` §6): does OpenAI accept the HASH
 * agent's 48 tool definitions on `openai/gpt-6.1-sol`?
 *
 * The definitions are Brunch's HASH agent's own, converted to JSON Schema as
 * Flue converts them (`toolInputToJsonSchema` in `@flue/runtime`'s schema
 * module: a Valibot schema through `@valibot/to-json-schema`, any other
 * Standard Schema through its own `jsonSchema.input`, draft 2020-12):
 *
 * - the 39 `petrinaut_*` tools from `hashPetrinautTools`;
 * - the 3 graph reads, `app_save_net`, `ledger_commit` (with HASH's
 *   `evidenced` wording), `ledger_query` and `ledger_query_basis`, loaded at
 *   run time from Brunch's sources under `apps/brunch-agent/src/agents/`;
 * - Flue's `activate_skill` and `read_skill_resource`, copied.
 *
 * They are offered by a Pi Durable Harness, so pi-ai's own builder makes the
 * body; the `beforeProviderRequest` hook captures it and the script inspects
 * it for schema features OpenAI has refused before, and names any definition
 * that differs from the successor's own HASH agent (`createHashAgent`, Save
 * bound to the probe's document). The website agent's definitions, which
 * smoke round 3 had accepted and H0c compared against, were retired with it
 * (HA-1); H0c's comparison is in `probes-hash-port.md`.
 *
 * Usage, from `apps/durable-agents` with `OPENAI_API_KEY` set:
 * - `SMOKE_DRY_RUN=1 yarn tsx test/smoke/hash-schemas.ts`: offline. The body
 *   is built and inspected; the preload (`count-provider-requests.ts`, budget
 *   0, a ledger of its own) refuses the request before it is sent.
 * - `yarn tsx test/smoke/hash-schemas.ts`: one real request, counted in
 *   `durable-agents-hash-schemas-requests.jsonl` in the temp directory, with
 *   a budget of 2 across every run and at most 1 per run. Pi's own retries
 *   and the SDK's are off.
 *
 * Writes the captured body (no headers: no key) beside the ledger, and
 * prints a JSON report.
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import {
  createRegistry,
  defineExtension,
  defineTool,
  GenerationTask,
  Harness,
  hook,
  MemoryStorage,
  type ToolRegistration,
} from "@earendil-works/pi-durable";
import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

import {
  brunchTools,
  canonicalContent,
  hashPetrinautTools,
  type HashPetrinautToolName,
  vLedgerAppendWith,
  vOriginWith,
} from "@hashintel/brunch-agent";

import { createHashAgent } from "../../src/agent/hash-agent";
import { hashBrowserToolDefinitions } from "../../src/browser-call/hash-browser-tools";

import type { Schema } from "@earendil-works/pi-schema";

const context = BACKGROUND_CONTEXT;
const dryRun = process.env.SMOKE_DRY_RUN === "1";
const modelRef = { provider: "openai", modelId: "gpt-6.1-sol" };

// ─── The request budget ──────────────────────────────────────────────────────

const ledgerPath = join(
  tmpdir(),
  dryRun
    ? `durable-agents-hash-schemas-dry-${randomUUID()}.jsonl`
    : "durable-agents-hash-schemas-requests.jsonl",
);
const totalBudget = 2;

type LedgerLine = {
  readonly event: string;
  readonly n?: number;
  readonly status?: number;
  readonly error?: string;
  readonly tools?: number;
  readonly additionalTools?: readonly number[];
};

const ledgerLines = (): LedgerLine[] =>
  existsSync(ledgerPath)
    ? readFileSync(ledgerPath, "utf8")
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line) as LedgerLine)
    : [];
const sentBefore = ledgerLines().filter(
  ({ event }) => event === "request",
).length;

process.env.SMOKE_REQUEST_LEDGER = ledgerPath;
// At most one request per run, and two across runs.
process.env.SMOKE_REQUEST_BUDGET = String(
  dryRun ? 0 : Math.min(totalBudget, sentBefore + 1),
);
await import(
  pathToFileURL(
    fileURLToPath(new URL("count-provider-requests.ts", import.meta.url)),
  ).href
);

// ─── Flue's schema conversion ────────────────────────────────────────────────

const vStandard = v.looseObject({
  "~standard": v.looseObject({ vendor: v.string() }),
});
const vNativeInput = v.looseObject({
  "~standard": v.looseObject({
    jsonSchema: v.looseObject({ input: v.function() }),
  }),
});
const vObjectSchema = v.looseObject({ type: v.literal("object") });

type JsonSchemaObject = Record<string, unknown>;

/** Flue's `toolInputToJsonSchema`: Valibot through `toJsonSchema`, anything else through its own export. */
const toolInputToJsonSchema = (input: unknown): JsonSchemaObject => {
  if (v.parse(vStandard, input)["~standard"].vendor === "valibot") {
    const { $schema: _schema, ...jsonSchema } = toJsonSchema(
      input as v.GenericSchema,
      { errorMode: "ignore" },
    );
    return jsonSchema;
  }
  const exported: unknown = v
    .parse(vNativeInput, input)
    ["~standard"].jsonSchema.input({ target: "draft-2020-12" });
  return structuredClone(v.parse(vObjectSchema, exported));
};

// ─── The 48 definitions ──────────────────────────────────────────────────────

type Definition = {
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonSchemaObject;
};

const vFlueTool = v.looseObject({
  name: v.string(),
  description: v.string(),
  input: v.unknown(),
});

const fromFlue = (tool: unknown): Definition => {
  const { name, description, input } = v.parse(vFlueTool, tool);
  return { name, description, parameters: toolInputToJsonSchema(input) };
};

const brunchAgents = new URL(
  "../../../brunch-agent/src/agents/",
  import.meta.url,
);
/** One of Brunch's modules, loaded at run time, with the exports it must have. */
const brunchModule = async <TEntries extends v.ObjectEntries>(
  path: string,
  entries: TEntries,
) => {
  const loaded: unknown = await import(new URL(path, brunchAgents).href);
  return v.parse(v.looseObject(entries), loaded);
};

/** Never called: the model is told not to call tools, and nothing runs them. */
const notExecuted = async () => {
  throw new Error("Not executed in the schema check.");
};

/** Copied from `apps/brunch-agent/src/agents/hash/guidance.ts`, which imports Flue-built markdown and cannot be loaded here. */
const hashEvidencedDescription =
  "It is in material the USER shared, such as a log or a document, or in records of the USER's own organisation that the agent read from HASH. What a tool computed, such as a run or an optimization, is not evidence for the account: record what it showed in a reflection.";

/** Flue's skill tools (`@flue/runtime` `createActivateSkillTool`, `createPackagedSkillReadTool`), their TypeBox schemas as JSON Schema. */
const skillTools: readonly Definition[] = [
  {
    name: "activate_skill",
    description:
      "Load the full instructions for one available skill before performing work that matches its description. Supporting resources remain lazy until explicitly read.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the skill to activate" },
      },
      required: ["name"],
    },
  },
  {
    name: "read_skill_resource",
    description:
      "Read a packaged skill supporting file by its advertised path.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file to read" },
        offset: {
          type: "number",
          description: "Line number to start from (1-indexed)",
        },
        limit: {
          type: "number",
          description: "Maximum number of lines to read",
        },
      },
      required: ["path"],
    },
  },
];

const hashDefinitions = async (): Promise<Definition[]> => {
  const petrinaut = (
    Object.keys(hashPetrinautTools) as HashPetrinautToolName[]
  ).map((name): Definition => {
    const { description, zInput } = hashPetrinautTools[name];
    return { name, description, parameters: toolInputToJsonSchema(zInput) };
  });
  const [graphReads, save, ledger, queryBasis] = await Promise.all([
    brunchModule("hash/tools/hash-graph-reads.ts", {
      createHashGraphReadTools: v.function(),
    }),
    brunchModule("hash/petrinaut/save-net.ts", {
      createHashPetrinautSaveTool: v.function(),
    }),
    brunchModule("shared/ledger-tools.ts", {
      createLedgerTools: v.function(),
    }),
    brunchModule("shared/query-basis.ts", {
      createQueryBasisTool: v.function(),
    }),
  ]);
  const reads = v.parse(
    v.array(v.unknown()),
    graphReads.createHashGraphReadTools(notExecuted),
  );
  const ledgerTools = v.parse(
    v.array(v.unknown()),
    ledger.createLedgerTools(
      notExecuted,
      vLedgerAppendWith(vOriginWith(hashEvidencedDescription)),
      brunchTools.ledgerQuery,
    ),
  );
  return [
    ...petrinaut,
    ...reads.map(fromFlue),
    fromFlue(save.createHashPetrinautSaveTool(notExecuted, "probe-document")),
    ...ledgerTools.map(fromFlue),
    fromFlue(
      queryBasis.createQueryBasisTool({
        browser: {},
        history: notExecuted,
        name: brunchTools.ledgerQueryBasis,
      }),
    ),
    ...skillTools,
  ];
};

// ─── Inspection ──────────────────────────────────────────────────────────────

/**
 * Keywords worth naming: those OpenAI has refused in function parameters
 * (the draft-04 tuple `items` array, an array without `items`, an
 * unresolvable `$ref`, a top-level combinator or a top level that is not an
 * object) and the newer or rarer ones whose acceptance only a request shows.
 */
const watchedKeywords = [
  "$ref",
  "$defs",
  "definitions",
  "$id",
  "$anchor",
  "$schema",
  "oneOf",
  "anyOf",
  "allOf",
  "not",
  "if",
  "then",
  "else",
  "const",
  "enum",
  "prefixItems",
  "additionalItems",
  "unevaluatedProperties",
  "unevaluatedItems",
  "patternProperties",
  "propertyNames",
  "dependentRequired",
  "dependentSchemas",
  "contains",
  "minContains",
  "maxContains",
  "format",
  "pattern",
  "default",
  "examples",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "uniqueItems",
  "additionalProperties",
  "nullable",
] as const;

type Findings = {
  /** Keyword → tools that use it anywhere in their parameters. */
  readonly keywords: Map<string, Set<string>>;
  /** Refused before: one line per occurrence. */
  readonly refused: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Keywords whose value is a map of subschemas, not a subschema. */
const schemaMaps = new Set([
  "properties",
  "$defs",
  "definitions",
  "patternProperties",
  "dependentSchemas",
]);

const walk = (
  node: unknown,
  path: string,
  tool: string,
  root: JsonSchemaObject,
  findings: Findings,
) => {
  if (Array.isArray(node)) {
    node.forEach((item, index) =>
      walk(item, `${path}/${index}`, tool, root, findings),
    );
    return;
  }
  if (!isRecord(node)) return;
  for (const keyword of watchedKeywords)
    if (keyword in node) {
      const users = findings.keywords.get(keyword) ?? new Set<string>();
      users.add(tool);
      findings.keywords.set(keyword, users);
    }
  const types = Array.isArray(node.type) ? node.type : [node.type];
  if (types.includes("array") && !("items" in node) && !("prefixItems" in node))
    findings.refused.push(`${tool}${path}: array without items`);
  if (Array.isArray(node.items))
    findings.refused.push(`${tool}${path}: items as an array (draft-04 tuple)`);
  if (typeof node.$ref === "string") {
    const ref = node.$ref;
    const target = ref.startsWith("#/")
      ? ref
          .slice(2)
          .split("/")
          .reduce<unknown>(
            (at, key) => (isRecord(at) ? at[key] : undefined),
            root,
          )
      : ref === "#"
        ? root
        : undefined;
    if (target === undefined)
      findings.refused.push(`${tool}${path}: unresolvable $ref ${ref}`);
  }
  for (const [key, value] of Object.entries(node)) {
    if (schemaMaps.has(key) && isRecord(value))
      for (const [name, schema] of Object.entries(value))
        walk(schema, `${path}/${key}/${name}`, tool, root, findings);
    else if (
      key !== "enum" &&
      key !== "const" &&
      key !== "default" &&
      key !== "examples"
    )
      walk(value, `${path}/${key}`, tool, root, findings);
  }
};

const inspect = (definitions: readonly Definition[]): Findings => {
  const findings: Findings = { keywords: new Map(), refused: [] };
  for (const { name, parameters } of definitions) {
    if (parameters.type !== "object")
      findings.refused.push(`${name}: top level is not type object`);
    for (const combinator of ["oneOf", "anyOf", "allOf", "enum", "not"])
      if (combinator in parameters)
        findings.refused.push(`${name}: top-level ${combinator}`);
    walk(parameters, "", name, parameters, findings);
  }
  return findings;
};

const keywordTable = (findings: Findings) =>
  Object.fromEntries(
    [...findings.keywords]
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([keyword, tools]) => [keyword, tools.size]),
  );

// ─── The body pi-ai builds ───────────────────────────────────────────────────

const vFunctionTool = v.looseObject({
  type: v.literal("function"),
  name: v.string(),
  description: v.string(),
  parameters: v.record(v.string(), v.unknown()),
  strict: v.optional(v.boolean()),
});
const vBody = v.looseObject({
  tools: v.optional(v.array(v.unknown())),
  input: v.optional(v.array(v.unknown())),
});
const vAdditionalTools = v.looseObject({
  type: v.literal("additional_tools"),
  tools: v.array(v.unknown()),
});

/** Every function tool a Responses body declares: top-level `tools` and `additional_tools` input items. */
const declaredTools = (body: unknown) => {
  const { tools = [], input = [] } = v.parse(vBody, body);
  const additional = input.flatMap((item) => {
    const parsed = v.safeParse(vAdditionalTools, item);
    return parsed.success ? parsed.output.tools : [];
  });
  return {
    topLevel: tools.length,
    additional: additional.length,
    tools: [...tools, ...additional].map((tool) =>
      v.parse(vFunctionTool, tool),
    ),
  };
};

// ─── The run ─────────────────────────────────────────────────────────────────

const definitions = await hashDefinitions();
/** A definition as compared with the successor's: its description and parameters, as canonical JSON (key order aside). */
const comparable = ({
  description,
  parameters,
}: {
  readonly description: string;
  readonly parameters: unknown;
}) => canonicalContent({ description, parameters });
// The successor's HASH agent, Save bound to the probe's document; a later entry replaces the placeholder Save.
const successor = new Map<string, string>(
  [
    ...createHashAgent().agent.extensions.flatMap(
      (extension) => extension.tools ?? [],
    ),
    ...hashBrowserToolDefinitions("probe-document"),
  ].map((definition) => [definition.name, comparable(definition)]),
);

const tools: ToolRegistration[] = definitions.map(
  ({ name, description, parameters }) =>
    defineTool({
      name,
      description,
      parameters: parameters as Schema<Record<string, unknown>>,
      execute: notExecuted,
    }),
);

let captured: unknown;
const extension = defineExtension({
  name: "probe.hash-schemas",
  tools,
  hooks: [
    hook(GenerationTask, {
      beforeProviderRequest: ({ payload }) => {
        captured ??= structuredClone(payload);
        return undefined;
      },
    }),
  ],
});
const registry = createRegistry();
registry.install(extension);
const harness = await Harness.open(
  new MemoryStorage(),
  {
    models: builtinModels(),
    registry,
    settings: {
      retry: { enabled: false },
      stream: { maxRetries: 0 },
    },
  },
  context,
);
let answer: unknown;
try {
  const root = await harness.root(context, {
    agent: {
      model: modelRef,
      extensions: [extension],
      instructions:
        "This request checks tool definitions. Reply with the single word OK. Do not call any tool.",
    },
  });
  await root.submit({ type: "input", content: "OK?" }, context);
  await root.waitForIdle(context);
  const entries = await root.entries(
    { order: "ascending" },
    100,
    undefined,
    context,
  );
  const reply = entries.items
    .flatMap(({ kind, model }) =>
      kind === "pi.assistant" ? (model ?? []) : [],
    )
    .at(-1);
  answer =
    reply?.role === "assistant"
      ? {
          stopReason: reply.stopReason,
          errorMessage: reply.errorMessage,
          text: reply.content.flatMap((part) =>
            part.type === "text" ? [part.text] : [],
          ),
          toolCalls: reply.content.flatMap((part) =>
            part.type === "toolCall" ? [part.name] : [],
          ),
          usage: reply.usage,
        }
      : undefined;
} finally {
  await harness.close(context);
}

if (captured === undefined) throw new Error("pi-ai built no body.");
const bodyPath = ledgerPath.replace(/\.jsonl$/u, `-body-${Date.now()}.json`);
writeFileSync(bodyPath, JSON.stringify(captured, null, 2));
const declared = declaredTools(captured);
const sent: Definition[] = declared.tools.map(
  ({ name, description, parameters }) => ({ name, description, parameters }),
);
const hashFindings = inspect(sent);
const lines = ledgerLines();

process.stdout.write(
  `${JSON.stringify(
    {
      dryRun,
      model: `${modelRef.provider}/${modelRef.modelId}`,
      bodyPath,
      body: {
        bytes: JSON.stringify(captured).length,
        toolsTopLevel: declared.topLevel,
        toolsInAdditionalTools: declared.additional,
        toolCount: declared.tools.length,
        strict: [
          ...new Set(declared.tools.map(({ strict }) => String(strict))),
        ],
        names: declared.tools.map(({ name }) => name),
        sameAsDefinitions:
          JSON.stringify(sent) ===
          JSON.stringify(
            definitions.map(({ name, description, parameters }) => ({
              name,
              description,
              parameters,
            })),
          ),
      },
      inspection: {
        refusedBefore: hashFindings.refused,
        keywords: keywordTable(hashFindings),
        successorToolCount: successor.size,
        differsFromSuccessor: definitions
          .filter(
            (definition) =>
              successor.get(definition.name) !== comparable(definition),
          )
          .map(({ name }) => name),
      },
      answer,
      ledger: {
        path: ledgerPath,
        budget: process.env.SMOKE_REQUEST_BUDGET,
        sentBefore,
        lines: lines.map(({ error, ...line }) =>
          error === undefined
            ? line
            : Object.assign(line, { error: error.slice(0, 2000) }),
        ),
      },
    },
    null,
    2,
  )}\n`,
);
