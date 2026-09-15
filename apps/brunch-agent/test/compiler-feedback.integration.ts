/** Real browser diagnostics must finish for dirty, repaired, and still-clean changed nets. */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type Context,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";

import {
  layoutPetrinautNetToolName,
  batchedConstructionMode,
  mutatePetrinautNetToolName,
  parseClientToolResultMetadata,
  readPetrinautDiagnosticsToolName,
  readPetrinautNetToolName,
  type MutatePetrinetOperation,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";
import { openBrowserFixture } from "./browser-fixture.ts";
import {
  browserResultFrom,
  modelVisibleObservationFrom,
} from "./browser-result.ts";
import { nativeSchemaProvider } from "./native-schema-provider.ts";

const cleanCompilation =
  "No errors or warnings found in net function code. Scenario and metric compilation is checked when creating an experiment.";
const output = mkdtempSync(join(tmpdir(), "m7c-compiler-feedback-"));
const save = (name: string, value: unknown) =>
  writeFileSync(join(output, `${name}.json`), JSON.stringify(value, null, 2));
const website = resolve(
  process.env.M7_WEBSITE_DIST ?? "../petrinaut-website/dist",
);
process.env.NODE_ENV = "test";
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = join(output, "conversation.db");
delete process.env.HASH_OTLP_ENDPOINT;
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (input, init) => {
  assert.equal(
    new URL(input instanceof Request ? input.url : String(input)).hostname,
    "127.0.0.1",
  );
  return fetchOriginal(input, init);
};
const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: "claude-sonnet-4-6", reasoning: true }],
});
installFauxProvider(nativeSchemaProvider(faux.provider, [], []));
const app = await loadBuiltBrunchApplication();
const { server, browser, page, origin, deliveries, errors, blocked } =
  await openBrowserFixture(app, website);

const tool = (name: string, args: Record<string, unknown>, id: string) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });
const textsFrom = (context: Context) =>
  context.messages.flatMap((message) =>
    typeof message.content === "string"
      ? [message.content]
      : message.content.flatMap((part) =>
          part.type === "text" ? [part.text] : [],
        ),
  );
const markdown =
  "# TEST compiler fragment\n\nInventory items decay. The first dynamics definition is deliberately invalid.";
const dirtyCode = "return definitelyNotDefined;";
const repairedCode = "return tokens.map(({ level }) => ({ level: -level }));";
const dirtyOperations: MutatePetrinetOperation[] = [
  {
    operationId: "add-item",
    basisId: "decay-basis",
    type: "addType",
    input: {
      id: "item",
      name: "Item",
      iconSlug: "circle",
      displayColor: "#1E90FF",
      elements: [{ elementId: "level", name: "level", type: "real" }],
    },
  },
  {
    operationId: "add-broken-decay",
    basisId: "decay-basis",
    type: "addDifferentialEquation",
    input: {
      id: "broken-decay",
      name: "Broken decay",
      colorId: "item",
      code: dirtyCode,
    },
  },
  {
    operationId: "add-store",
    basisId: "decay-basis",
    type: "addPlace",
    input: {
      id: "store",
      name: "Store",
      colorId: "item",
      dynamicsEnabled: true,
      differentialEquationId: "broken-decay",
      x: 0,
      y: 0,
    },
  },
  {
    operationId: "add-consume",
    basisId: "decay-basis",
    type: "addTransition",
    input: {
      id: "consume",
      name: "Consume",
      metadata: {},
      inputArcs: [],
      outputArcs: [],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    },
  },
  {
    operationId: "add-store-consume",
    basisId: "decay-basis",
    type: "addArc",
    input: {
      transitionId: "consume",
      arcDirection: "input",
      placeId: "store",
      weight: 1,
      type: "standard",
    },
  },
];
const repairOperations: MutatePetrinetOperation[] = [
  {
    operationId: "repair-decay",
    basisId: "decay-basis",
    type: "updateDifferentialEquation",
    input: {
      equationId: "broken-decay",
      update: { code: repairedCode },
    },
  },
];

const locateBasis = (context: Context) => {
  const locate = JSON.parse(
    context.messages
      .flatMap((message) =>
        message.role === "toolResult" && message.toolName === "read_workpiece"
          ? typeof message.content === "string"
            ? [message.content]
            : message.content.flatMap((part) =>
                part.type === "text" ? [part.text] : [],
              )
          : [],
      )
      .at(-1) ?? "{}",
  ) as {
    currentWorkpiece: { revisionId: string; sha256: string };
    locatorLookup: {
      queries: { occurrences: { start: number; end: number }[] }[];
    };
  };
  const span = locate.locatorLookup.queries[0]?.occurrences[0];
  assert(span);
  return {
    kind: "declared" as const,
    revisionId: locate.currentWorkpiece.revisionId,
    sha256: locate.currentWorkpiece.sha256,
    locators: [span],
    rationale: "Synthetic compiler-feedback basis.",
    scope: "operation" as const,
  };
};

const mutateCall = (
  context: Context,
  operations: readonly MutatePetrinetOperation[],
  id: string,
) => {
  const observation = modelVisibleObservationFrom(
    browserResultFrom(
      textsFrom(context),
      readPetrinautNetToolName,
      "Missing observation",
    ),
  );
  return tool(
    mutatePetrinautNetToolName,
    {
      observation: {
        toolCallId: observation.toolCallId,
        baseHash: observation.sha256,
      },
      bases: [{ basisId: "decay-basis", basis: locateBasis(context) }],
      operations,
    },
    id,
  );
};

const mutationPostHash = (output: unknown) => {
  assert(output !== null && typeof output === "object");
  const record = output as { postHash?: unknown };
  assert(typeof record.postHash === "string");
  return record.postHash;
};

try {
  await page.goto(`${origin}/`);
  await page.getByRole("button", { name: "Skip tour" }).click();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  faux.setResponses([
    tool("mutate_workpiece", { markdown }, "revision-1"),
    (context: Context) => {
      const revision = context.messages.findLast(
        (message) =>
          message.role === "toolResult" &&
          message.toolName === "mutate_workpiece",
      );
      assert(revision?.role === "toolResult" && !revision.isError);
      return tool(
        "read_workpiece",
        { locateTexts: [markdown] },
        "revision-1-locate",
      );
    },
    (context: Context) => {
      const locate = context.messages.findLast(
        (message) =>
          message.role === "toolResult" &&
          message.toolName === "read_workpiece",
      );
      assert(locate?.role === "toolResult" && !locate.isError);
      return tool(readPetrinautNetToolName, {}, "read-before-dirty");
    },
    (context: Context) => mutateCall(context, dirtyOperations, "batch-dirty"),
    async () => {
      // Hold the actual worker request, not its result, so the progress state
      // is inspectable before the real compiler returns its diagnostics.
      await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/unbound-method -- Rebound to each actual worker through call below.
        const postMessage = Worker.prototype.postMessage;
        Worker.prototype.postMessage =
          function postMessageWithDiagnosticsBarrier(
            this: Worker,
            message: unknown,
            options?: Transferable[] | StructuredSerializeOptions,
          ) {
            const send = () =>
              postMessage.call(
                this,
                message,
                Array.isArray(options) ? { transfer: options } : options,
              );
            if (
              message !== null &&
              typeof message === "object" &&
              "method" in message &&
              message.method === "sdcpn/diagnostics"
            ) {
              Worker.prototype.postMessage = postMessage;
              window.addEventListener("release-test-diagnostics", send, {
                once: true,
              });
              return;
            }
            send();
          };
      });
      return tool(readPetrinautDiagnosticsToolName, {}, "check-dirty");
    },
    (context: Context) => {
      const dirty = browserResultFrom(
        textsFrom(context),
        readPetrinautDiagnosticsToolName,
        "Missing dirty compilation",
      );
      assert.match(String(dirty.output), /definitelyNotDefined/u);
      return tool(readPetrinautNetToolName, {}, "read-before-repair");
    },
    (context: Context) => mutateCall(context, repairOperations, "batch-repair"),
    () => tool(readPetrinautDiagnosticsToolName, {}, "check-clean"),
    (context: Context) => {
      const clean = browserResultFrom(
        textsFrom(context),
        readPetrinautDiagnosticsToolName,
        "Missing clean compilation",
      );
      assert.equal(clean.output, cleanCompilation);
      return tool(
        layoutPetrinautNetToolName,
        { askUserFirst: false },
        "layout-after-repair",
      );
    },
    (context: Context) => {
      browserResultFrom(
        textsFrom(context),
        layoutPetrinautNetToolName,
        "Missing layout result",
      );
      return tool(readPetrinautNetToolName, {}, "read-after-layout");
    },
    () =>
      tool(readPetrinautDiagnosticsToolName, {}, "check-clean-after-layout"),
    fauxAssistantMessage([
      fauxText("Compiler-feedback dirty-then-repair completed."),
    ]),
  ]);
  const composer = page.getByRole("textbox", {
    name: "Message AI assistant",
    exact: true,
  });
  await composer.fill(
    "TEST synthetic account: inventory items decay. First dynamics are invalid, then repaired. Compilation is not simulation.",
  );
  await composer.press("Enter");
  try {
    const runningDiagnostics = page.getByRole("button", {
      name: "Checking model diagnostics",
      exact: true,
    });
    await runningDiagnostics.waitFor({ timeout: 30_000 });
    assert.equal(await runningDiagnostics.getAttribute("aria-busy"), "true");
    await page.screenshot({ path: join(output, "tool-running.png") });
    await runningDiagnostics.screenshot({
      path: join(output, "diagnostics-progress.png"),
    });
    await page.evaluate(() =>
      window.dispatchEvent(new Event("release-test-diagnostics")),
    );
    await page
      .getByText("Compiler-feedback dirty-then-repair completed.", {
        exact: true,
      })
      .waitFor({ timeout: 90_000 });
    assert.equal(await runningDiagnostics.count(), 0);
    await page.screenshot({ path: join(output, "tools-completed.png") });
  } catch (error) {
    save("page-text", await page.locator("body").innerText());
    save("fixture-errors", { errors, blocked, deliveries: deliveries.length });
    throw error;
  }
  // The ordinary route binds the conversation itself; the first delivered
  // request names the document and conversation the browser actually used.
  const firstRequest = JSON.parse(deliveries[0]!.body) as {
    kind: string;
    initialData: {
      mode: string;
      construction: {
        binding: {
          conversationId: string;
          documentId: string;
          incarnationId: string;
        };
      };
    };
  };
  assert.equal(firstRequest.kind, "user");
  assert.equal(firstRequest.initialData.mode, batchedConstructionMode);
  const binding = firstRequest.initialData.construction.binding;
  const stored = await page.evaluate((documentId) => {
    const document = (
      JSON.parse(localStorage.getItem("petrinaut-sdcpn") ?? "{}") as Record<
        string,
        {
          id: string;
          incarnationId: string;
          sdcpn: {
            differentialEquations: { id: string; code: string }[];
          };
        }
      >
    )[documentId];
    const key = Object.keys(localStorage).find((entry) =>
      entry.includes("principal"),
    );
    if (!document || !key) throw new Error("Missing actual host binding");
    const raw = localStorage.getItem(key) ?? "";
    return {
      document,
      principalKey: raw.startsWith('"') ? (JSON.parse(raw) as string) : raw,
    };
  }, binding.documentId);
  assert.equal(stored.document.incarnationId, binding.incarnationId);
  const identity = {
    principalKey: stored.principalKey,
    conversationId: binding.conversationId,
  };
  const client = createFlueClient({
    url: `${origin}/agents/chat/${flueConversationIdFrom(identity)}`,
    headers: agentOwnershipHeaders(identity),
  });
  const history = await client.history();
  const results = clientToolHistoryFrom(history.messages).results;
  save("history", history);
  save("results", results);
  const dirty = results.find((result) => result.toolCallId === "check-dirty");
  const clean = results.find((result) => result.toolCallId === "check-clean");
  const cleanAfterLayout = results.find(
    (result) => result.toolCallId === "check-clean-after-layout",
  );
  const dirtyBatch = results.find(
    (result) => result.toolCallId === "batch-dirty",
  );
  const repairBatch = results.find(
    (result) => result.toolCallId === "batch-repair",
  );
  const repairedObservation = results.find(
    (result) => result.toolCallId === "read-before-repair",
  );
  assert(dirty, "Flue history must carry the dirty compilation result");
  assert(clean, "Flue history must carry the repaired compilation result");
  assert(dirtyBatch, "Dirty mutate_petrinet must land a client-tool-result");
  assert(repairBatch, "Repair mutate_petrinet must land a client-tool-result");
  assert.equal(dirty.toolName, readPetrinautDiagnosticsToolName);
  assert.equal(clean.toolName, readPetrinautDiagnosticsToolName);
  assert.match(String(dirty.output), /definitelyNotDefined/u);
  assert.equal(clean.output, cleanCompilation);
  assert.equal(cleanAfterLayout?.output, cleanCompilation);
  assert.equal(
    stored.document.sdcpn.differentialEquations[0]?.code,
    repairedCode,
  );
  const repairHash = mutationPostHash(repairBatch.output);
  const observedAfterDirty = repairedObservation?.metadata as
    | { observation?: { observed?: { sha256?: string } } }
    | undefined;
  assert.equal(
    observedAfterDirty?.observation?.observed?.sha256,
    mutationPostHash(dirtyBatch.output),
    "The repair observation must cite the dirty batch's reported hash",
  );
  assert.match(repairHash, /^[a-f0-9]{64}$/u);

  // ELK layout is a separately recorded command: its pre hash is the repaired
  // batch's reported final hash, its post hash is the next fresh observation,
  // and its effects are position updates only.
  const layout = results.find(
    (result) => result.toolCallId === "layout-after-repair",
  );
  const readAfterLayout = results.find(
    (result) => result.toolCallId === "read-after-layout",
  );
  assert(layout, "Flue history must carry the layout command result");
  assert(readAfterLayout, "Flue history must carry the post-layout read");
  assert.equal(layout.toolName, layoutPetrinautNetToolName);
  const layoutOutput = layout.output as {
    applied?: unknown;
    detail?: unknown;
  };
  assert.deepEqual(
    layoutOutput.applied,
    true,
    "Fresh construction lays out without confirmation",
  );
  assert.match(
    String(layoutOutput.detail),
    /Viewport frame: framed\./u,
    "The real browser layout awaits a completed viewport frame",
  );
  const layoutRecord = parseClientToolResultMetadata(
    layout.metadata,
  )?.layoutRecord;
  assert(layoutRecord, "The layout result must carry metadata.layoutRecord");
  assert.equal(
    layoutRecord.pre.sha256,
    repairHash,
    "Layout starts from the repaired batch's reported final hash",
  );
  const observedAfterLayout = parseClientToolResultMetadata(
    readAfterLayout.metadata,
  )?.observation?.observed.sha256;
  assert.equal(
    layoutRecord.post.sha256,
    observedAfterLayout,
    "The layout's reported final hash equals a fresh read_petrinaut_net",
  );
  assert.notEqual(layoutRecord.post.sha256, layoutRecord.pre.sha256);
  const positionEffects = layoutRecord.effects as {
    kind: string;
    path: string;
  }[];
  assert(positionEffects.length > 0, "Layout must record position effects");
  for (const effect of positionEffects) {
    assert.equal(effect.kind, "updated");
    assert.match(effect.path, /^\/(places|transitions)\/\d+\/(x|y)$/u);
  }
  const layoutPaths = new Set(positionEffects.map((effect) => effect.path));
  assert(
    layoutPaths.has("/places/0/x") ||
      layoutPaths.has("/places/0/y") ||
      layoutPaths.has("/transitions/0/x") ||
      layoutPaths.has("/transitions/0/y"),
    "Two co-located nodes cannot both stay at the origin",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  process.stdout.write(
    `${JSON.stringify({
      output,
      mode: batchedConstructionMode,
      dirtyCompilation: dirty.output,
      cleanCompilation: clean.output,
      repairHash,
      layoutHash: layoutRecord.post.sha256,
      positionEffects: positionEffects.length,
    })}\n`,
  );
} finally {
  await browser.close();
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
  await app.stop();
}
