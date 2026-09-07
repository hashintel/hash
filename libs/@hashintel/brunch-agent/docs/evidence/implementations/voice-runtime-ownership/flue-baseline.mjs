// Baseline probe, not a recorder implementation. Uses only built public APIs.
// Usage: node flue-baseline.mjs /absolute/path/to/pinned/flue
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const [checkout, phase, database] = process.argv.slice(2);
assert.ok(checkout, "Pass the pinned upstream Flue checkout path");
const root = resolve(checkout);
const pin = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
assert.equal(pin, "832ad2eeaf5e4b07d39749fc669e7ad556238313");

if (!phase) {
  const directory = await mkdtemp(join(tmpdir(), "flue-recording-baseline-"));
  try {
    const run = (mode) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          [
            fileURLToPath(import.meta.url),
            root,
            mode,
            join(directory, "probe.db"),
          ],
          { encoding: "utf8", timeout: 30_000 },
        ),
      );
    const write = run("write");
    const reopen = run("reopen");
    assert.deepEqual(reopen.snapshot, write.snapshot);
    assert.equal(reopen.agentEntries, 0);
    assert.equal(reopen.startHooks, 0);
    assert.equal(reopen.modelCalls, 0);
    assert.deepEqual(reopen.lifecycle, {});
    console.log(
      JSON.stringify({ pin, node: process.version, write, reopen }, null, 2),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
} else {
  assert.ok(database);
  assert.ok(phase === "write" || phase === "reopen");
  const load = (path) => import(pathToFileURL(join(root, path)).href);
  const { init, observe, useAgentStart, useDelivery, useModel } = await load(
    "packages/runtime/dist/index.mjs",
  );
  const { start, sqlite } = await load("packages/runtime/dist/node/index.mjs");
  const { createAgentRouter } = await load("packages/runtime/dist/routing.mjs");
  const { createFlueClient } = await load("packages/sdk/dist/index.mjs");
  const { fauxProvider, fauxAssistantMessage } = await load(
    "packages/runtime/node_modules/@earendil-works/pi-ai/dist/providers/faux.js",
  );
  // An accidental external provider call must fail, never become a paid run.
  globalThis.fetch = () => {
    throw new Error("Network disabled for the baseline probe");
  };
  const faux = fauxProvider({
    provider: "recording-baseline",
    models: [{ id: "probe" }],
  });
  faux.setResponses([
    fauxAssistantMessage("Typed admission received."),
    fauxAssistantMessage("Signal admission received."),
  ]);
  let agentEntries = 0;
  let startHooks = 0;
  const lifecycle = {};
  const BaselineAgent = () => {
    agentEntries++;
    useModel("recording-baseline/probe");
    const delivery = useDelivery();
    useAgentStart(() => {
      startHooks++;
      if (delivery.kind === "signal" && delivery.type === "baseline.reject") {
        throw new Error("Expected baseline rejection before any model call");
      }
    });
    return "Reply briefly. No tools or external effects.";
  };
  const unsubscribe = observe((event) => {
    if (event.type.startsWith("submission_")) {
      lifecycle[event.type] = (lifecycle[event.type] ?? 0) + 1;
    }
  });
  const runtime = await start({
    agents: [BaselineAgent],
    db: sqlite(database),
    providers: [faux.provider],
    env: {},
  });
  const router = createAgentRouter(BaselineAgent);
  const client = createFlueClient({
    url: "http://baseline.invalid/conversation",
    fetch: (input, options) =>
      router.fetch(
        input instanceof Request ? input : new Request(input, options),
      ),
  });
  const handle = init(BaselineAgent, { id: "conversation" });
  const checkpoints = [];
  const checkpoint = (label) => {
    const current = {
      label,
      agentEntries,
      startHooks,
      modelCalls: faux.state.callCount,
      lifecycle: { ...lifecycle },
    };
    checkpoints.push(current);
    return current;
  };
  try {
    if (phase === "write") {
      const typed = await client.send({
        message: { kind: "user", body: "A real typed input." },
        idempotencyKey: "baseline-typed",
      });
      await client.read(typed, { signal: AbortSignal.timeout(10_000) });
      const afterTyped = checkpoint("normal typed send");
      assert.ok(afterTyped.agentEntries > 0);
      assert.equal(afterTyped.startHooks, 1);
      assert.equal(afterTyped.modelCalls, 1);

      const handback = await client.send({
        message: {
          kind: "signal",
          type: "baseline.handback",
          body: "A proposal, not human testimony. No external dialogue was recorded.",
          attributes: { source: "external-runtime" },
        },
        idempotencyKey: "baseline-handback",
      });
      await client.read(handback, { signal: AbortSignal.timeout(10_000) });
      const afterSignal = checkpoint("normal signal send");
      assert.ok(afterSignal.agentEntries > afterTyped.agentEntries);
      assert.equal(afterSignal.startHooks, 2);
      assert.equal(afterSignal.modelCalls, 2);

      const rejected = await client.send({
        message: {
          kind: "signal",
          type: "baseline.reject",
          body: "Reject in hook.",
        },
        idempotencyKey: "baseline-rejected",
      });
      await assert.rejects(
        client.read(rejected, { signal: AbortSignal.timeout(10_000) }),
        (error) =>
          error.failure === "failed" &&
          error.targetId === rejected.submissionId,
      );
      const afterRejected = checkpoint("hook rejects before model");
      assert.ok(afterRejected.agentEntries > afterSignal.agentEntries);
      assert.equal(afterRejected.startHooks, 3);
      assert.equal(afterRejected.modelCalls, 2);
    }
    const snapshot = await client.history();
    assert.equal(snapshot.settlements.length, 3);
    assert.deepEqual(
      snapshot.settlements.map((entry) => entry.outcome),
      ["completed", "completed", "failed"],
    );
    assert.equal(
      snapshot.messages.filter((message) => message.role === "user").length,
      1,
    );
    assert.ok(
      snapshot.messages.some(
        (message) =>
          message.role === "system" &&
          message.purpose === "dispatch" &&
          message.signal?.attributes?.source === "external-runtime",
      ),
    );
    await runtime.stop();
    console.log(
      JSON.stringify({
        sdkSurface: Object.keys(client).sort(),
        handleSurface: Object.keys(handle).sort(),
        agentEntries,
        startHooks,
        modelCalls: faux.state.callCount,
        lifecycle,
        checkpoints,
        snapshot,
      }),
    );
  } finally {
    unsubscribe();
    await runtime.stop();
  }
}
