// Recover Pi's original TypeScript from installed source maps, not the network.
// Source-review companion to the executed bundle patch; not an upstream build.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const pins = JSON.parse(
  readFileSync(new URL("installed-inputs.json", import.meta.url)),
);
const fromMap = (path) => {
  const bytes = readFileSync(path);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    pins.files[path],
  );
  const map = JSON.parse(bytes);
  assert.equal(map.sourcesContent.length, 1);
  return map.sourcesContent[0];
};
const changes = [];
const change = (path, source, edits) => {
  let next = source;
  for (const [old, replacement, count = 1] of edits) {
    assert.equal(next.split(old).length - 1, count, path);
    next = next.replaceAll(old, replacement);
  }
  changes.push({ path, source, next });
};
const anthropic = fromMap(
  "node_modules/@earendil-works/pi-ai/dist/api/anthropic-messages.js.map",
);
const start = anthropic.indexOf(
  "\t\tconst schema = tool.parameters as { properties?: unknown; required?: string[] };",
);
const end = anthropic.indexOf("\n\n\t\treturn {", start);
assert(start > 0 && end > start);
change("pi-ai/src/api/anthropic-messages.ts", anthropic, [
  [
    anthropic.slice(start, end),
    "\t\t// Preserve the supplied input schema independently of constrained generation.\n\t\tconst inputSchema = tool.parameters as Anthropic.Messages.Tool.InputSchema;",
  ],
]);
change(
  "pi-agent-core/src/agent-loop.ts",
  fromMap("node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js.map"),
  [
    [
      "const preparedToolCall = prepareToolCallArguments(tool, toolCall);",
      "const preparedToolCall = prepareToolCallArguments(tool, tool.validateArguments ? { ...toolCall, arguments: structuredClone(toolCall.arguments) } : toolCall);",
    ],
    [
      "const validatedArgs = validateToolArguments(tool, preparedToolCall);",
      'const validatedArgs = tool.validateArguments\n\t\t\t? await tool.validateArguments(structuredClone(preparedToolCall.arguments), { toolCallId: toolCall.id, signal })\n\t\t\t: validateToolArguments(tool, preparedToolCall);\n\t\tif (signal?.aborted) return { kind: "immediate", result: createErrorToolResult("Operation aborted"), isError: true };',
    ],
  ],
);
change(
  "pi-agent-core/src/types.ts",
  fromMap("node_modules/@earendil-works/pi-agent-core/dist/types.js.map"),
  [
    [
      "export interface AgentTool<TParameters extends TSchema = TSchema, TDetails = any>",
      "export interface AgentTool<TParameters extends TSchema = TSchema, TDetails = any, TArguments = Static<TParameters>>",
    ],
    [
      "\t/** Execute the tool call. Throw on failure instead of encoding errors in `content`. */",
      "\t/** Authoritative validation instead of generic JSON Schema coercion. Receives\n\t * cloned prepared input; returns parsed data for hooks/execute or throws.\n\t * Implementations must honor cancellation. Parameters remain an input projection. */\n\tvalidateArguments?: (args: unknown, context: { toolCallId: string; signal?: AbortSignal }) => TArguments | Promise<TArguments>;\n\t/** Execute the tool call. Throw on failure instead of encoding errors in `content`. */",
    ],
    ["\t\tparams: Static<TParameters>,", "\t\tparams: TArguments,"],
    [
      "Validated tool arguments for the target tool schema.",
      "Parsed arguments from the authoritative validator (custom validateArguments or generic schema validation).",
      2,
    ],
  ],
);
const scratch = mkdtempSync(join(process.cwd(), ".native-source-diff-"));
try {
  let patch = "";
  for (const { path, source, next } of changes) {
    writeFileSync(join(scratch, "before"), source);
    writeFileSync(join(scratch, "after"), next);
    try {
      execFileSync(
        "diff",
        [
          "-U0",
          "-L",
          `a/${path}`,
          "-L",
          `b/${path}`,
          join(scratch, "before"),
          join(scratch, "after"),
        ],
        { encoding: "utf8" },
      );
    } catch (error) {
      assert.equal(error.status, 1);
      patch += error.stdout;
    }
  }
  writeFileSync(new URL("pi-source-candidate.patch", import.meta.url), patch);
  console.log("Recovered Pi source diffs; no upstream source build performed");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
