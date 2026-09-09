/** Unpaid GENERIC TEST through production ChatAgent, native schemas and actual Chrome. */
/* eslint-disable no-await-in-loop -- Construction and browser observations are causally serial. */
import assert from "node:assert/strict";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type Context,
} from "@earendil-works/pi-ai";
import {
  createFlueClient,
  FlueExecutionError,
  type DeliveredMessage,
} from "@flue/sdk";
import { chromium } from "@playwright/test";

import {
  canonicalContent,
  observedStateInputSchema,
  observedStateMutationNames,
  verifyArcTransitionAttempt,
  verifyDefinitionObservation,
  type ConstructionTransitionRecord,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  clientToolHistoryFrom,
  CLIENT_TOOL_RESULT_SIGNAL,
} from "@hashintel/brunch-agent-transport-aisdk";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";
import { browserResultFrom, type BrowserResult } from "./browser-result.ts";
import {
  nativeSchemaProvider,
  type NativeRequestCapture,
} from "./native-schema-provider.ts";

import type { SDCPN } from "@hashintel/petrinaut-core";

const output =
  process.env.M7_TYPED_STATE_OUTPUT ??
  mkdtempSync(join(tmpdir(), "m7-typed-state-"));
if (process.env.M7_TYPED_STATE_OUTPUT) {
  assert(!existsSync(output));
  mkdirSync(output, { recursive: true });
}
const save = (name: string, value: unknown) =>
  writeFileSync(join(output, `${name}.json`), JSON.stringify(value, null, 2));
const website = resolve(
  process.env.M7_WEBSITE_DIST ?? "../petrinaut-website/dist",
);
process.env.NODE_ENV = "test";
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = join(output, "conversation.db");
delete process.env.HASH_OTLP_ENDPOINT;
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  assert.equal(
    new URL(input instanceof Request ? input.url : String(input)).hostname,
    "127.0.0.1",
  );
  return originalFetch(input, init);
};
const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: "claude-sonnet-4-6", reasoning: true }],
});
const captures: NativeRequestCapture[] = [];
const contexts: Context[] = [];
installFauxProvider(nativeSchemaProvider(faux.provider, captures, contexts));
const app = await loadBuiltBrunchApplication();
const deliveries: { path: string; body: string }[] = [];
const errors: string[] = [];
const callbackErrors: string[] = [];
const server = createServer((incoming, outgoing) => {
  const abort = new AbortController();
  outgoing.on("close", () => abort.abort());
  void (async () => {
    const url = new URL(incoming.url ?? "/", `http://${incoming.headers.host}`);
    let response: Response;
    if (url.pathname.startsWith("/agents/")) {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) {
        assert(chunk instanceof Uint8Array);
        chunks.push(Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks).toString("utf8");
      if (body) deliveries.push({ path: url.pathname, body });
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers))
        if (value !== undefined)
          headers.set(name, Array.isArray(value) ? value.join(",") : value);
      response = await app.fetch(
        new Request(url, {
          method: incoming.method,
          headers,
          signal: abort.signal,
          ...(body ? { body } : {}),
        }),
      );
    } else if (url.pathname.includes("voice"))
      response = Response.json({ available: false });
    else {
      const file = resolve(
        website,
        `.${url.pathname === "/" ? "/index.html" : url.pathname}`,
      );
      assert(file.startsWith(`${website}/`));
      const mime: Record<string, string> = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".wasm": "application/wasm",
        ".json": "application/json",
      };
      response = new Response(readFileSync(file), {
        headers: {
          "content-type": mime[extname(file)] ?? "application/octet-stream",
        },
      });
    }
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) {
      const reader = response.body.getReader();
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          if (!outgoing.write(next.value)) await once(outgoing, "drain");
        }
      } finally {
        await reader.cancel();
      }
    }
    outgoing.end();
  })().catch((error: unknown) => {
    if (!abort.signal.aborted) {
      errors.push(String(error));
      outgoing.writeHead(500).end(String(error));
    }
  });
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("pageerror", (error) => errors.push(String(error)));
const blocked: string[] = [];
await page.route("**/*", (route) => {
  if (new URL(route.request().url()).origin === origin) return route.continue();
  blocked.push(route.request().url());
  return route.abort();
});
const tool = (name: string, args: Record<string, unknown>, id: string) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });
const text = (value: string) => fauxAssistantMessage([fauxText(value)]);
let completed = 0;
const checked =
  (callback: (context: Context) => ReturnType<typeof tool>) =>
  (context: Context) => {
    try {
      const response = callback(context);
      completed++;
      return response;
    } catch (error) {
      callbackErrors.push(String(error));
      save("callback-errors", callbackErrors);
      throw error;
    }
  };
const toolOutput = (
  context: Context,
  name: string,
): Record<string, unknown> => {
  const result = context.messages.findLast(
    (message) => message.role === "toolResult" && message.toolName === name,
  );
  assert(result?.role === "toolResult" && !result.isError);
  return JSON.parse(
    result.content
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join(""),
  ) as Record<string, unknown>;
};
const browserResult = (context: Context, name: string): BrowserResult =>
  browserResultFrom(
    context.messages.flatMap((message) =>
      typeof message.content === "string"
        ? [message.content]
        : message.content.flatMap((part) =>
            part.type === "text" ? [part.text] : [],
          ),
    ),
    name,
    "Missing causal browser result",
  );
let basis: Record<string, unknown> | undefined;
const settle = (markdown: string, id: string) => [
  tool("update_workpiece", { markdown }, id),
  checked((context) => {
    assert.equal(toolOutput(context, "update_workpiece").revisionId, id);
    return tool(
      "brunch_workpiece",
      { locateTexts: [markdown] },
      `${id}-locate`,
    );
  }),
  checked((context) => {
    const result = toolOutput(context, "brunch_workpiece");
    const current = result.currentWorkpiece as {
      revisionId: string;
      sha256: string;
    };
    const lookup = result.locatorLookup as {
      subject: { kind: string };
      queries: { occurrences: { start: number; end: number }[] }[];
    };
    assert.equal(lookup.subject.kind, "current-revision");
    const span = lookup.queries[0]?.occurrences[0];
    assert(span);
    basis = {
      kind: "declared",
      revisionId: current.revisionId,
      sha256: current.sha256,
      locators: [span],
      rationale:
        "GENERIC TEST operation-level modelling basis. Not an operational inventory, source relevance or utility verdict.",
      scope: "operation",
    };
    return tool("getLatestNetDefinition", {}, `${id}-read`);
  }),
];
const mutate = (
  name: string,
  id: string,
  input: (definition: SDCPN) => Record<string, unknown>,
) =>
  checked((context) => {
    const observation = browserResult(context, "getLatestNetDefinition")
      .metadata?.observation;
    assert(observation && basis);
    return tool(
      name,
      {
        ...input(observation.observed.definition),
        brunch: {
          basis,
          observationToolCallId: observation.toolCallId,
          requestedBaseHash: observation.observed.sha256,
        },
      },
      id,
    );
  });
const after = (
  name: string,
  id: string,
  inspect?: (record: ConstructionTransitionRecord) => void,
) =>
  checked((context) => {
    const result = browserResult(context, name);
    assert.equal((result.output as { applied?: boolean }).applied, true);
    const record = result.metadata?.transitionRecord;
    assert(record);
    assert.equal(record.outcome, "applied");
    inspect?.(record);
    return tool("getLatestNetDefinition", {}, id);
  });
const unique = <Entity extends { id: string; name: string }>(
  entries: readonly Entity[],
  name: string,
) => {
  const matches = entries.filter((entry) => entry.name === name);
  assert.equal(matches.length, 1);
  const entry = matches[0];
  assert(entry);
  return entry;
};
const testType = {
  id: "test-attributes",
  name: "TestAttributes",
  iconSlug: "circle",
  displayColor: "#0088ff",
  elements: [{ elementId: "test-value", name: "value", type: "string" }],
};
const place = (id: string, name: string, colorId: string, x: number) => ({
  id,
  name,
  colorId,
  dynamicsEnabled: false,
  differentialEquationId: null,
  capacity: null,
  x,
  y: 0,
});
const initial =
  "# GENERIC TEST workpiece\n\nTestQueue holds typed tokens with a text value. TestResult initially retains the same attributes. The labelled TestInitial scenario starts TestQueue with exactly two synthetic rows, text values 2 and bad. These are test conditions, not observed inventory. No actual timing, rate or plant claim is supplied.";
const correction =
  "# GENERIC TEST corrected workpiece\n\nTestQueue holds typed tokens. Add an active boolean attribute, whose migration default false is a canonical default, not testimony. Correct value from text to integer: canonical migration may coerce 2 to 2 and invalid text to zero; this is not evidence of intended initial values. Explicitly correct TestInitial to rows [2,true] and [3,false] as synthetic initial conditions. Test transfer is predicate-enabled for this test only and moves one token to TestResult. Then correct TestResult to an uncoloured count: attributes are intentionally discarded there. Timing, actual inventory and operational rates remain unknown. Compilation is not simulation or behavioral validation.";
const answers: Record<string, unknown>[] = [];
const compilations: BrowserResult[] = [];
const query = (context: Context, args: Record<string, unknown>, id: string) => {
  const observation = browserResult(context, "getLatestNetDefinition").metadata
    ?.observation;
  assert(observation);
  const { initialCell, ...fields } = args;
  if (initialCell !== undefined) {
    assert(
      Array.isArray(initialCell) &&
        (initialCell.length === 1 || initialCell.length === 2) &&
        initialCell.every(
          (index: unknown) =>
            typeof index === "number" && Number.isInteger(index),
        ),
    );
    const queueId = unique(
      observation.observed.definition.places,
      "TestQueue",
    ).id;
    fields.field = `/initialState/content/${queueId.replaceAll("~", "~0").replaceAll("/", "~1")}/${initialCell.join("/")}`;
  }
  return tool(
    "brunch_why",
    { ...fields, observationToolCallId: observation.toolCallId },
    id,
  );
};
try {
  await page.goto(`${origin}/?brunchTracer=root-creation`);
  await page.getByRole("button", { name: "Skip tour" }).click();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  const send = async (body: string, done: string) => {
    const composer = page.getByRole("textbox", {
      name: "Message AI assistant",
      exact: true,
    });
    await composer.fill(body);
    await composer.press("Enter");
    try {
      await page.getByText(done, { exact: true }).waitFor({ timeout: 45000 });
    } finally {
      assert.deepEqual(
        callbackErrors,
        [],
        "Callback assertions must escape faux-provider handling",
      );
    }
  };
  assert.equal(
    deliveries.length,
    0,
    "No prepared bootstrap or workpiece import",
  );
  faux.setResponses([
    ...settle(initial, "typed-revision-one"),
    mutate("addType", "typed-type", (definition) => {
      assert.equal(
        definition.types.length,
        process.env.M7_FALSIFY_TYPED_ASSERTION === "1" ? 1 : 0,
        "First actual typed read is empty",
      );
      return testType;
    }),
    after("addType", "typed-read-type"),
    mutate("addPlace", "typed-queue", (definition) =>
      place(
        "test-queue",
        "TestQueue",
        unique(definition.types, "TestAttributes").id,
        0,
      ),
    ),
    after("addPlace", "typed-read-queue"),
    mutate("addPlace", "typed-result", (definition) =>
      place(
        "test-result",
        "TestResult",
        unique(definition.types, "TestAttributes").id,
        320,
      ),
    ),
    after("addPlace", "typed-read-places"),
    mutate("addScenario", "typed-scenario", (definition) => ({
      id: "test-initial",
      name: "TestInitial",
      description: "GENERIC TEST initial conditions, not observed inventory",
      scenarioParameters: [],
      initialState: {
        type: "per_place",
        content: {
          [unique(definition.places, "TestQueue").id]: [["2"], ["bad"]],
        },
      },
    })),
    after("addScenario", "typed-read-scenario"),
    checked((context) => {
      assert.equal(
        browserResult(context, "getLatestNetDefinition").metadata!.observation!
          .observed.definition.scenarios?.length,
        1,
      );
      return text("GENERIC TEST typed initial state created.");
    }),
  ]);
  await send(
    "GENERIC TEST account: two test items wait with text values 2 and bad. Initially preserve their attributes at the result. This is a synthetic setup, not plant inventory; timing is unknown.",
    "GENERIC TEST typed initial state created.",
  );
  assert.equal(completed, 11);
  faux.setResponses([
    ...settle(correction, "typed-revision-two"),
    mutate("addTypeElement", "typed-active", (definition) => ({
      typeId: unique(definition.types, "TestAttributes").id,
      element: { elementId: "test-active", name: "active", type: "boolean" },
    })),
    after("addTypeElement", "typed-read-active", (record) =>
      assert(
        record.attempts[0]!.effects.derived.some((effect) =>
          effect.path.includes("initialState"),
        ),
      ),
    ),
    mutate("updateTypeElement", "typed-integer", (definition) => {
      const type = unique(definition.types, "TestAttributes");
      const element = type.elements.find((entry) => entry.name === "value");
      assert(element);
      return {
        typeId: type.id,
        elementId: element.elementId,
        update: { type: "integer" },
      };
    }),
    after("updateTypeElement", "typed-read-integer", (record) =>
      assert(
        record.attempts[0]!.effects.derived.some((effect) =>
          effect.path.includes("initialState"),
        ),
      ),
    ),
    checked((context) =>
      query(
        context,
        {
          kind: "scenario",
          name: "TestInitial",
          initialCell: [1, 0],
        },
        "typed-why-migration",
      ),
    ),
    checked((context) => {
      const answer = toolOutput(context, "brunch_why");
      answers.push(answer);
      assert.equal(answer.disposition, "refused");
      assert.match(String(answer.reason), /derived/);
      assert.equal(answer.governing, undefined);
      return tool("getLatestNetDefinition", {}, "typed-read-before-explicit");
    }),
    mutate("updateScenario", "typed-explicit-initial", (definition) => ({
      scenarioId: unique(definition.scenarios ?? [], "TestInitial").id,
      update: {
        initialState: {
          type: "per_place",
          content: {
            [unique(definition.places, "TestQueue").id]: [
              [2, true],
              [3, false],
            ],
          },
        },
      },
    })),
    after("updateScenario", "typed-read-explicit"),
    mutate("updateType", "typed-type-description", (definition) => ({
      typeId: unique(definition.types, "TestAttributes").id,
      update: { name: "TestCorrectedAttributes" },
    })),
    after("updateType", "typed-read-renamed"),
    mutate("addTransition", "typed-transfer", (definition) => ({
      id: "test-transfer",
      name: "Test transfer",
      inputArcs: [
        {
          placeId: unique(definition.places, "TestQueue").id,
          weight: 1,
          type: "standard",
        },
      ],
      outputArcs: [
        { placeId: unique(definition.places, "TestResult").id, weight: 1 },
      ],
      lambdaType: "predicate",
      lambdaCode: "export default Lambda(() => true);",
      transitionKernelCode: "",
      x: 160,
      y: 0,
    })),
    after("addTransition", "typed-read-generated", (record) =>
      assert(
        record.attempts[0]!.effects.derived.some((effect) =>
          effect.path.endsWith("transitionKernelCode"),
        ),
      ),
    ),
    checked((context) =>
      query(
        context,
        {
          kind: "transition",
          name: "Test transfer",
          field: "transitionKernelCode",
        },
        "typed-why-kernel",
      ),
    ),
    checked((context) => {
      const answer = toolOutput(context, "brunch_why");
      answers.push(answer);
      assert.equal(answer.disposition, "refused");
      assert.match(String(answer.reason), /derived/);
      return tool("getLatestNetDefinition", {}, "typed-read-before-sanitize");
    }),
    mutate("updatePlace", "typed-discard-attributes", (definition) => ({
      placeId: unique(definition.places, "TestResult").id,
      update: { colorId: null },
    })),
    after("updatePlace", "typed-read-sanitized", (record) =>
      assert(
        record.attempts[0]!.effects.derived.some((effect) =>
          effect.path.endsWith("transitionKernelCode"),
        ),
      ),
    ),
    checked(() => tool("getNetCompilationErrors", {}, "typed-check-corrected")),
    checked((context) => {
      const result = browserResult(context, "getNetCompilationErrors");
      compilations.push(result);
      assert.equal(
        result.output,
        "No errors detected in your model – everything compiles!",
        "Final corrected net must report clean canonical diagnostics; no scenario execution follows",
      );
      return text(
        "GENERIC TEST correction checked; compilation is not simulation.",
      );
    }),
  ]);
  await send(
    "GENERIC TEST correction: add an active flag; value is an integer, not text. Explicit initial values are 2/true and 3/false, not whatever migration defaults produce. Transfer is test-enabled and ultimately discards attributes at the result. Check the correction without claiming behavior or actual inventory.",
    "GENERIC TEST correction checked; compilation is not simulation.",
  );
  assert.equal(completed, 31);
  const stored = await page.evaluate(() => {
    const document = (
      JSON.parse(localStorage.getItem("petrinaut-sdcpn") ?? "{}") as Record<
        string,
        { id: string; incarnationId: string }
      >
    )["synthetic-root-creation-v1"];
    const key = Object.keys(localStorage).find((entry) =>
      entry.includes("principal"),
    );
    if (!document || !key) throw new Error("Missing bound host state");
    const raw = localStorage.getItem(key) ?? "";
    return {
      document,
      principalKey: raw.startsWith('"') ? (JSON.parse(raw) as string) : raw,
    };
  });
  const identity = {
    principalKey: stored.principalKey,
    conversationId: `root-creation-candidate-v1:${stored.document.incarnationId}`,
  };
  const client = createFlueClient({
    url: `${origin}/agents/chat/${flueConversationIdFrom(identity)}`,
    headers: agentOwnershipHeaders(identity),
  });
  await page.screenshot({
    path: join(output, "corrected.png"),
    fullPage: true,
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  const queries = [
    {
      kind: "type-element",
      type: "TestCorrectedAttributes",
      name: "value",
      field: "type",
      expected: "partially-supported",
      change: "typed-integer",
      origin: "typed-type",
    },
    {
      kind: "scenario",
      name: "TestInitial",
      initialCell: [1, 0],
      expected: "partially-supported",
      change: "typed-explicit-initial",
      origin: "typed-scenario",
    },
    {
      kind: "scenario",
      name: "TestInitial",
      field: "parameterOverrides",
      expected: "refused",
      change: "typed-scenario",
      origin: "typed-scenario",
    },
    {
      kind: "transition",
      name: "Test transfer",
      field: "transitionKernelCode",
      expected: "refused",
      change: "typed-discard-attributes",
      origin: "typed-transfer",
    },
    {
      kind: "type",
      name: "TestCorrectedAttributes",
      field: "name",
      expected: "partially-supported",
      change: "typed-type-description",
      origin: "typed-type",
    },
    {
      kind: "scenario",
      name: "TestInitial",
      field: "/initialState/content/absent/0",
      expected: "refused",
    },
    {
      kind: "scenario",
      name: "TestInitial",
      field: "initialState",
      expected: "refused",
      origin: "typed-scenario",
      aggregate: true,
    },
    {
      kind: "scenario",
      name: "TestInitial",
      field: "/initialState/content",
      expected: "refused",
      origin: "typed-scenario",
      aggregate: true,
    },
    {
      kind: "scenario",
      name: "TestInitial",
      initialCell: [1],
      expected: "refused",
      origin: "typed-scenario",
      aggregate: true,
    },
    {
      kind: "type",
      name: "TestCorrectedAttributes",
      field: "elements",
      expected: "refused",
      origin: "typed-type",
      aggregate: true,
    },
    {
      kind: "type",
      name: "TestCorrectedAttributes",
      field: "entity",
      expected: "refused",
      origin: "typed-type",
      aggregate: true,
    },
    {
      kind: "scenario",
      name: "TestInitial",
      initialCell: [1, 1],
      expected: "refused",
      origin: "typed-scenario",
      change: "typed-active",
    },
  ];
  const responses: Parameters<typeof faux.setResponses>[0] = [
    tool("getLatestNetDefinition", {}, "typed-reopened-read"),
  ];
  queries.forEach(
    ({ expected, change, origin: original, aggregate, ...args }, index) => {
      responses.push(
        checked((context) =>
          query(context, args, `typed-reopened-why-${index}`),
        ),
      );
      responses.push(
        checked((context) => {
          const answer = toolOutput(context, "brunch_why");
          answers.push(answer);
          assert.equal(answer.disposition, expected);
          if (change)
            assert.equal(
              (answer.recordedChange as { toolCallId: string }).toolCallId,
              change,
            );
          if (original) assert.equal(answer.originToolCallId, original);
          if (aggregate) {
            assert.match(String(answer.reason), /aggregate.*descendant/iu);
            assert.equal(answer.governing, undefined);
            assert.equal(answer.recordedChange, undefined);
            assert((answer.appliedChanges as unknown[]).length > 1);
            assert.equal(
              (answer.reconciliation as { observationScope: string })
                .observationScope,
              "live-observed",
            );
          }
          return index === queries.length - 1
            ? text(
                "Reopened typed and initial-state explanations remain scoped.",
              )
            : tool(
                "getLatestNetDefinition",
                {},
                `typed-reopened-read-${index}`,
              );
        }),
      );
    },
  );
  faux.setResponses(responses);
  await send(
    "GENERIC TEST ask why by ordinary type, element and scenario names after reopening. Distinguish explicit corrections from migrated/default/generated cells.",
    "Reopened typed and initial-state explanations remain scoped.",
  );
  await page.screenshot({
    path: join(output, "reopened-positive-why.png"),
    fullPage: true,
  });
  const history = await client.history();
  save("history", history);
  const scenarioCall = history.messages
    .flatMap((message) => message.parts)
    .find(
      (part) =>
        part.type === "dynamic-tool" && part.toolCallId === "typed-scenario",
    );
  assert(scenarioCall?.type === "dynamic-tool");
  assert(
    !Object.hasOwn(scenarioCall.input as object, "parameterOverrides"),
    "Raw admitted input must retain omitted parameterOverrides",
  );
  const results = clientToolHistoryFrom(history.messages).results;
  const records = results.filter(
    (result) =>
      (result.metadata as { transitionRecord?: unknown } | undefined)
        ?.transitionRecord,
  );
  save("records", records);
  assert.equal(records.length, 10);
  for (const result of records) {
    const record = (
      result.metadata as { transitionRecord: ConstructionTransitionRecord }
    ).transitionRecord;
    for (const attempt of record.attempts)
      await verifyArcTransitionAttempt(attempt);
  }
  const final = (
    records.at(-1)!.metadata as {
      transitionRecord: ConstructionTransitionRecord;
    }
  ).transitionRecord.attempts[0]!.post!;
  const reopened = (
    results.find((result) => result.toolCallId === "typed-reopened-read")!
      .metadata as { observation: { observed: typeof final } }
  ).observation.observed;
  await verifyDefinitionObservation(reopened);
  assert.equal(
    canonicalContent(reopened.definition),
    canonicalContent(final.definition),
    "Complete raw reopened content, not XML/model projection",
  );
  save("raw-reopen", reopened);
  const scenarioRecord = records.find(
    (entry) => entry.toolCallId === "typed-scenario",
  );
  assert(scenarioRecord);
  const scenarioAttempt = (
    scenarioRecord.metadata as {
      transitionRecord: ConstructionTransitionRecord;
    }
  ).transitionRecord.attempts[0]!;
  assert(!Object.hasOwn(scenarioAttempt.request.input, "parameterOverrides"));
  assert.deepEqual(
    scenarioAttempt.post?.definition.scenarios?.[0]?.parameterOverrides,
    {},
  );
  assert(
    scenarioAttempt.effects.derived.some(
      (effect) => effect.path === "/scenarios/0/parameterOverrides",
    ),
  );
  for (const name of observedStateMutationNames) {
    const tools = captures.flatMap((capture) =>
      capture.serialized.tools.filter((entry) => entry.name === name),
    );
    assert(tools.length > 0);
    for (const entry of tools)
      assert.deepEqual(
        entry.input_schema,
        observedStateInputSchema(name).toJSONSchema({ io: "input" }),
      );
  }
  assert.equal(completed, 55);
  // Controls use the actual retained raw definition, not known factory IDs as evidence.
  const selectedType = unique(
    reopened.definition.types,
    "TestCorrectedAttributes",
  );
  const active = selectedType.elements.find(
    (element) => element.name === "active",
  );
  assert(active);
  const originalDelivery = deliveries
    .map(
      (entry) =>
        JSON.parse(entry.body) as DeliveredMessage & { idempotencyKey: string },
    )
    .find(
      (entry) =>
        entry.kind === "signal" &&
        entry.body.includes('"toolCallId":"typed-integer"'),
    );
  assert(originalDelivery);
  const beforeDuplicate = contexts.length;
  const { idempotencyKey, ...duplicateMessage } = originalDelivery;
  await client.wait(
    await client.send({ idempotencyKey, message: duplicateMessage }),
  );
  assert.equal(
    contexts.length,
    beforeDuplicate,
    "Duplicate result does not continue or execute",
  );
  assert.equal(
    clientToolHistoryFrom((await client.history()).messages).results.filter(
      (entry) => entry.toolCallId === "typed-integer",
    ).length,
    1,
  );
  save("duplicate-result", {
    beforeRequests: beforeDuplicate,
    afterRequests: contexts.length,
    canonicalResults: 1,
  });
  for (const name of observedStateMutationNames) {
    const before = contexts.length;
    faux.setResponses([
      fauxAssistantMessage(
        [
          fauxToolCall(name, {}, { id: `typed-mixed-${name}` }),
          fauxToolCall(
            "update_workpiece",
            { markdown: "TEST forbidden sibling" },
            { id: `typed-mixed-revision-${name}` },
          ),
        ],
        { stopReason: "toolUse" },
      ),
    ]);
    await assert.rejects(async () =>
      client.wait(
        await client.send({
          message: { kind: "user", body: `TEST reject mixed ${name} proposal` },
        }),
      ),
    );
    assert.equal(contexts.length, before + 1);
    assert(
      !(await client.history()).messages
        .flatMap((message) => message.parts)
        .some(
          (part) =>
            part.type === "dynamic-tool" &&
            part.toolCallId.startsWith(`typed-mixed-${name}`),
        ),
    );
  }
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxToolCall(
          "getLatestNetDefinition",
          {},
          { id: "typed-multiple-read" },
        ),
        fauxToolCall("addScenario", {}, { id: "typed-multiple-scenario" }),
      ],
      { stopReason: "toolUse" },
    ),
  ]);
  await assert.rejects(
    async () =>
      client.wait(
        await client.send({
          message: { kind: "user", body: "TEST reject two browser calls" },
        }),
      ),
    /browser/iu,
  );
  assert(
    !(await client.history()).messages
      .flatMap((message) => message.parts)
      .some(
        (part) =>
          part.type === "dynamic-tool" &&
          part.toolCallId.startsWith("typed-multiple-"),
      ),
  );
  const selection = new URL(page.url());
  selection.searchParams.set("itemType", "type");
  selection.searchParams.set("itemId", selectedType.id);
  await page.goto(selection.href);
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  let envelope: Record<string, unknown> | undefined;
  const readEnvelope = (id: string) => [
    tool("getLatestNetDefinition", {}, id),
    checked((context) => {
      const observation = browserResult(context, "getLatestNetDefinition")
        .metadata?.observation;
      assert(observation && basis);
      envelope = {
        basis,
        observationToolCallId: observation.toolCallId,
        requestedBaseHash: observation.observed.sha256,
      };
      save(id, observation);
      return text(`${id} complete.`);
    }),
  ];
  const rejected = (
    name: string,
    id: string,
    input: Record<string, unknown>,
    pattern: RegExp,
  ) => {
    assert(envelope);
    return [
      tool(name, { ...input, brunch: envelope }, id),
      checked((context) => {
        const result = context.messages.findLast(
          (message) =>
            message.role === "toolResult" && message.toolName === name,
        );
        assert(result?.role === "toolResult" && result.isError);
        assert.match(JSON.stringify(result.content), pattern);
        return text(`${id} refused.`);
      }),
    ];
  };
  faux.setResponses(readEnvelope("typed-controls-read"));
  await send("TEST read before controls", "typed-controls-read complete.");
  for (const [name, id, input, pattern] of [
    ["addType", "typed-duplicate-type", selectedType, /Duplicate/],
    [
      "addTypeElement",
      "typed-duplicate-element",
      { typeId: selectedType.id, element: active },
      /Duplicate/,
    ],
    [
      "updateTypeElement",
      "typed-unknown-element",
      {
        typeId: selectedType.id,
        elementId: "TEST unknown element",
        update: { name: "unknown" },
      },
      /Unknown/,
    ],
  ] as const) {
    faux.setResponses(rejected(name, id, input, pattern));
    await send(`TEST ${id}`, `${id} refused.`);
  }
  faux.setResponses([
    tool(
      "updateType",
      {
        typeId: selectedType.id,
        update: { name: selectedType.name },
        brunch: envelope,
      },
      "typed-no-op",
    ),
    checked((context) => {
      const result = browserResult(context, "updateType");
      assert.equal((result.output as { applied: boolean }).applied, false);
      assert.equal(result.metadata?.transitionRecord?.outcome, "no-op");
      return text("Unchanged type is not a change.");
    }),
  ]);
  await send("TEST no-op type correction", "Unchanged type is not a change.");
  await page
    .getByRole("button", { name: "Delete dimension active", exact: true })
    .click();
  faux.setResponses([
    tool(
      "updateType",
      {
        typeId: selectedType.id,
        update: { name: "UnappliedName" },
        brunch: envelope,
      },
      "typed-stale",
    ),
    checked((context) => {
      const result = browserResult(context, "updateType");
      assert.equal((result.output as { applied: boolean }).applied, false);
      assert.equal(result.metadata?.transitionRecord?.outcome, "stale");
      return text("Stale type correction was not applied.");
    }),
  ]);
  await send(
    "TEST refuse stale type correction after external element deletion",
    "Stale type correction was not applied.",
  );
  await page
    .getByRole("button", { name: /Not applied.*requested base/ })
    .waitFor();
  await page.screenshot({ path: join(output, "stale.png"), fullPage: true });
  faux.setResponses(readEnvelope("typed-retired-read"));
  await send(
    "TEST observe actual external element deletion",
    "typed-retired-read complete.",
  );
  faux.setResponses(
    rejected(
      "addTypeElement",
      "typed-retired-element",
      { typeId: selectedType.id, element: active },
      /retired/,
    ),
  );
  await send(
    "TEST refuse actual known-retired nested element",
    "typed-retired-element refused.",
  );
  faux.setResponses([
    tool(
      "brunch_why",
      {
        kind: "type",
        name: selectedType.name,
        field: "elements",
        observationToolCallId: envelope?.observationToolCallId,
      },
      "typed-external-why",
    ),
    checked((context) => {
      const answer = toolOutput(context, "brunch_why");
      answers.push(answer);
      assert.equal(answer.disposition, "refused");
      assert.match(String(answer.reason), /Unrecorded/);
      return text("External typed-state changes are not conversation causes.");
    }),
  ]);
  await send(
    "TEST explain external change honestly",
    "External typed-state changes are not conversation causes.",
  );
  const controlHistory = await client.history();
  save("control-history", controlHistory);
  const controlResults = clientToolHistoryFrom(controlHistory.messages).results;
  for (const id of [
    "typed-duplicate-type",
    "typed-duplicate-element",
    "typed-unknown-element",
    "typed-retired-element",
  ])
    assert(
      !controlResults.some((result) => result.toolCallId === id),
      `${id} must refuse before browser execution`,
    );
  const controlRecords = controlResults.filter(
    (entry) =>
      (entry.metadata as { transitionRecord?: unknown } | undefined)
        ?.transitionRecord,
  );
  assert.equal(
    controlRecords.length,
    12,
    "Ten applied, one no-op, one stale; pre-execution refusals have no browser record",
  );
  for (const entry of controlRecords)
    for (const attempt of (
      entry.metadata as { transitionRecord: ConstructionTransitionRecord }
    ).transitionRecord.attempts)
      await verifyArcTransitionAttempt(attempt);
  save("records", controlRecords);
  const original = records.find(
    (entry) => entry.toolCallId === "typed-integer",
  );
  assert(original);
  for (const variant of ["foreign", "conflicting"] as const) {
    const record = structuredClone(
      (original.metadata as { transitionRecord: ConstructionTransitionRecord })
        .transitionRecord,
    );
    if (variant === "foreign")
      for (const attempt of record.attempts) {
        attempt.binding.incarnationId = "foreign";
        attempt.request.binding.incarnationId = "foreign";
      }
    else {
      record.outcome = "unknown";
      record.attempts[0]!.outcome = "unknown";
    }
    const before = contexts.length;
    await assert.rejects(
      async () =>
        client.wait(
          await client.send({
            message: {
              kind: "signal",
              type: CLIENT_TOOL_RESULT_SIGNAL,
              tagName: CLIENT_TOOL_RESULT_SIGNAL,
              body: JSON.stringify([
                { ...original, metadata: { transitionRecord: record } },
              ]),
            },
          }),
        ),
      (error: unknown) =>
        error instanceof FlueExecutionError && error.failure === "failed",
    );
    assert.equal(contexts.length, before);
    save(`${variant}-history`, await client.history());
  }
  assert.equal(
    completed,
    64,
    "Every planned callback assertion completes outside the faux boundary",
  );
  assert.deepEqual(callbackErrors, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  save("summary", {
    completed,
    requests: contexts.length,
    records: controlRecords.length,
    paid: false,
    limits:
      "GENERIC TEST mechanical linkage only. No simulation, genuine inventory, real provider or utility acceptance. Remaining root classes unavailable.",
  });
  await page.screenshot({
    path: join(output, "reopened-why.png"),
    fullPage: true,
  });
  process.stdout.write(`PASS typed-state ${output}\n`);
} finally {
  save("native-requests", captures);
  save("contexts", contexts);
  save("deliveries", deliveries);
  save("why", answers);
  save("compilation", compilations);
  save("errors", { errors, callbackErrors, blocked, completed });
  await browser.close();
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  await app.stop();
  globalThis.fetch = originalFetch;
}
