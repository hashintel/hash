/** Opt-in, free provider acceptance check over freshly captured native Brunch tool catalogues. */
/* eslint-disable no-await-in-loop -- Stop at the first unexplained provider failure; never retry. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { ordinaryBrunchToolCatalogue } from "../src/agents/chat-agent/tool-catalogue.ts";
import { STEP_A_MODEL_ID } from "../src/chat-model.ts";
import { checkDevConfiguration } from "../src/dev-configuration-preflight.ts";

import type { NativeRequestCapture } from "./native-schema-provider.ts";

type CapturedNativeTool = NativeRequestCapture["serialized"]["tools"][number];

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const output = mkdtempSync(join(tmpdir(), "brunch-anthropic-tools-"));
const results: {
  catalogue: string;
  tools: string[];
  status: number;
  requestId: string | null;
}[] = [];
let passed = false;
let stage = "configuration";

try {
  // The persona launcher pins both participants to this model, overriding dev defaults.
  process.env.BRUNCH_CHAT_MODEL = STEP_A_MODEL_ID;
  const configuration = await checkDevConfiguration();
  writeFileSync(
    join(output, "configuration.json"),
    `${JSON.stringify(configuration, null, 2)}\n`,
  );
  assert.equal(configuration.status, "PASS", configuration.failures.join("; "));
  // Same development loader and shell precedence as the app; DEBUG was refused above.
  const { loadEnv } = await import("vite");
  const environment = {
    ...loadEnv("development", appRoot, ""),
    ...process.env,
  };
  const apiKey = environment.ANTHROPIC_API_KEY;
  assert(apiKey);

  stage = "native capture";
  // Keep the no-sockets native oracle in its own process. Never relax its transport guard.
  const capture = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "test/integration/native-schema-carriage.integration.ts",
    ],
    {
      cwd: appRoot,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: "synthetic-not-a-credential",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_OAUTH_TOKEN: "",
        BRUNCH_STEP_A_ACCOUNTING: undefined,
        HASH_OTLP_ENDPOINT: undefined,
        M7_NATIVE_OUTPUT: join(output, "native"),
      },
      encoding: "utf8",
      timeout: 120_000,
    },
  );
  writeFileSync(
    join(output, "native.log"),
    `${capture.stdout}${capture.stderr}`,
  );
  assert.equal(
    capture.status,
    0,
    "Native schema oracle failed; inspect native.log",
  );
  // This child just produced the artifact; reuse its canonical capture type.
  const captures = JSON.parse(
    readFileSync(join(output, "native/native-sdk-requests.json"), "utf8"),
  ) as NativeRequestCapture[];
  const canonicalNames = Object.keys(
    petrinautAiTools,
  ) as (keyof typeof petrinautAiTools)[];
  const withoutRuntimeTools = (names: readonly string[]) =>
    names.filter((name) => name !== "task");
  const canonicalCaptures = captures.filter(({ serialized }) => {
    const names = withoutRuntimeTools(
      serialized.tools.map((tool) => tool.name),
    );
    return (
      names.length === canonicalNames.length &&
      names.every((name, index) => name === canonicalNames[index])
    );
  });
  assert(
    canonicalCaptures.length > 0,
    "Canonical Petrinaut catalogue was absent from native capture",
  );
  const canonicalTools = canonicalCaptures[0]?.serialized.tools;
  assert(canonicalTools);
  assert.deepEqual(
    withoutRuntimeTools(canonicalTools.map((tool) => tool.name)),
    canonicalNames,
  );
  const canonicalNameSet = new Set<string>(canonicalNames);
  assert.deepEqual(
    canonicalTools
      .map((tool) => tool.name)
      .filter((name) => !canonicalNameSet.has(name)),
    ["task"],
    "Canonical mode may add only Flue's runtime-owned task tool",
  );
  for (const toolName of canonicalNames) {
    const captured: CapturedNativeTool | undefined = canonicalTools.find(
      (tool) => tool.name === toolName,
    );
    assert(captured, `Canonical capture omitted ${toolName}`);
    assert.equal(captured.description, petrinautAiTools[toolName].description);
  }
  for (const toolName of [
    "addType",
    "addScenario",
    "addSubnet",
    "addComponentInstance",
    "createExperiment",
  ] as const) {
    const captured: CapturedNativeTool | undefined = canonicalTools.find(
      (tool) => tool.name === toolName,
    );
    assert(captured);
    assert.deepEqual(
      captured.input_schema,
      petrinautAiTools[toolName].inputSchema.toJSONSchema({ io: "input" }),
      `Canonical capture flattened nested schema for ${toolName}`,
    );
  }
  const brunchOnlyNames = new Set(
    ordinaryBrunchToolCatalogue
      .map(({ name }) => name)
      .filter((name) => name !== "task" && !canonicalNameSet.has(name)),
  );
  assert(
    canonicalTools.every((tool) => !brunchOnlyNames.has(tool.name)),
    "Canonical capture contains Brunch or Ledger tools",
  );

  stage = "provider acceptance";
  const probes = [
    {
      name: "rejected-top-level-union-control",
      tools: [
        {
          name: "invalid_union_control",
          description: "Synthetic schema rejection control.",
          input_schema: {
            type: "object",
            anyOf: [{ properties: { value: { type: "string" } } }],
          },
        },
      ],
      expected: 400,
    },
    {
      name: "canonical-petrinaut-tools",
      tools: canonicalTools,
      expected: 200,
    },
  ];
  for (const probe of probes) {
    stage = `${probe.name}: request`;
    const response: Response = await fetch(
      "https://api.anthropic.com/v1/messages/count_tokens",
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        headers: {
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          model: STEP_A_MODEL_ID,
          messages: [
            {
              role: "user",
              content: "Synthetic tool-schema acceptance check.",
            },
          ],
          tools: probe.tools,
        }),
      },
    );
    const result = {
      catalogue: probe.name,
      tools: probe.tools.map((tool) => tool.name),
      status: response.status,
      requestId: response.headers.get("request-id"),
    };
    results.push(result);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    const body = await response.text();
    stage = `${probe.name}: validate response`;
    assert.equal(
      response.status,
      probe.expected,
      `${probe.name}: unexpected HTTP status; no retry`,
    );
    if (probe.expected === 400) {
      assert(
        /input_schema does not support.*(?:oneOf|allOf|anyOf).*top level/s.test(
          body,
        ),
        "Negative control did not reach schema validation",
      );
    } else {
      const count: unknown = JSON.parse(body);
      assert(
        count &&
          typeof count === "object" &&
          "input_tokens" in count &&
          typeof count.input_tokens === "number",
        "Expected token-count response",
      );
    }
  }
  passed = true;
} catch {
  // Loader and network exceptions can contain credentials. Only report the stage and safe HTTP metadata.
  process.stderr.write(
    `FAIL: ${stage}; inspect safe results under ${output} (configuration.json, preflight.json, native.log when captured). No retry or paid generation was attempted.\n`,
  );
  process.exitCode = 1;
} finally {
  const report = { passed, model: STEP_A_MODEL_ID, stage, results, output };
  writeFileSync(
    join(output, "preflight.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  process.stdout.write(`ANTHROPIC_TOOL_PREFLIGHT ${JSON.stringify(report)}\n`);
}
