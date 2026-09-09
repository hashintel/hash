import { spawn } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Provider,
} from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { afterEach, expect, test } from "vitest";

import { createStepARequestAccounting } from "../src/provider-accounting.ts";
import { RequestLedger } from "../src/provider-accounting/request-ledger.ts";
import { withBufferedToolAdmission } from "../src/provider-admission.ts";

const native: Provider = anthropicProvider();
const model = native
  .getModels()
  .find((entry) => entry.id === "claude-sonnet-4-6")!;
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true });
});
const complete: AssistantMessage = {
  role: "assistant",
  api: model.api,
  provider: model.provider,
  model: model.id,
  stopReason: "stop",
  content: [],
  timestamp: 0,
  usage: {
    input: 100,
    output: 10,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 110,
    cost: {
      input: 0.0003,
      output: 0.00015,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0.00045,
    },
  },
};
const setup = () => {
  const directory = mkdtempSync(join(tmpdir(), "TEST-accounting-unit-"));
  directories.push(directory);
  const ledgerPath = join(directory, "usage-ledger.json");
  const ledger = {
    authority: "TEST INPUT/OUTPUT only",
    limits: { calls: 200, usd: 100 },
    reservation: {
      runId: "TEST-run",
      status: "active",
      calls: 2,
      usd: 14,
      perCall: { maxOutputTokens: 16, reservedUsd: 7 },
    },
    totals: {
      spentCalls: 0,
      spentUsd: 0,
      remainingCalls: 200,
      remainingUsd: 100,
      outstandingReservedCalls: 0,
      outstandingReservedUsd: 0,
    },
    calls: [] as {
      status: string;
      invocation: string;
      transport: string;
      usage?: AssistantMessage["usage"];
      partialUsage?: AssistantMessage["usage"];
      terminal?: { usage: AssistantMessage["usage"] };
      journalPending?: boolean;
    }[],
  };
  const save = () => writeFileSync(ledgerPath, JSON.stringify(ledger));
  save();
  writeFileSync(join(directory, "attempt-ledger.md"), "# TEST INPUT/OUTPUT\n");
  const read = () =>
    JSON.parse(readFileSync(ledgerPath, "utf8")) as typeof ledger;
  const accounting = createStepARequestAccounting(
    JSON.stringify({ ledgerPath, runId: "TEST-run" }),
  )!;
  let starts = 0;
  let dispatches = 0;
  let response = complete;
  let startFailure = false;
  let retry = false;
  let hold = false;
  const upstream = createAssistantMessageEventStream();
  const invoke: Provider["streamSimple"] = (_model, _context, options) => {
    starts++;
    expect(read().calls.at(-1)?.status).toBe("unknown");
    expect(options?.maxTokens).toBe(16);
    expect(options?.maxRetries).toBe(0);
    if (startFailure)
      throw new Error("TEST local preparation failed before transport");
    void options?.fetch?.("https://TEST.invalid", {});
    if (retry) void options?.fetch?.("https://TEST.invalid", {});
    if (!hold)
      queueMicrotask(() =>
        upstream.push(
          response.stopReason === "error" || response.stopReason === "aborted"
            ? { type: "error", reason: response.stopReason, error: response }
            : { type: "done", reason: "stop", message: response },
        ),
      );
    return upstream;
  };
  const metered = accounting.wrap(
    { ...native, stream: invoke, streamSimple: invoke },
    () => true,
  );
  const run = (callback: () => Promise<void>, turnId = "TEST-turn") =>
    accounting.interceptor(
      {
        type: "agent",
        operationId: "TEST-submission",
        operationKind: "prompt",
      },
      {
        submissionId: "TEST-submission",
        instanceId: "TEST-instance",
        agentName: "ChatAgent",
      },
      () =>
        accounting.interceptor(
          { type: "model", turnId },
          {
            conversationId: "TEST-conversation",
            operationId: "TEST-operation",
            turnId,
          },
          callback,
        ),
    );
  const options = {
    fetch: async () => {
      dispatches++;
      expect(read().calls.at(-1)?.transport).toBe("started");
      return new Response(null);
    },
  };
  return {
    accounting,
    directory,
    ledgerPath,
    ledger,
    read,
    save,
    run,
    metered,
    options,
    upstream,
    starts: () => starts,
    dispatches: () => dispatches,
    failPreparation: () => {
      startFailure = true;
    },
    retry: () => {
      retry = true;
    },
    hold: () => {
      hold = true;
    },
    respond: (message: AssistantMessage) => {
      response = message;
    },
  };
};

for (const method of ["stream", "streamSimple"] as const) {
  test(`${method}: persists before invocation and dispatch, reconciles once despite repeated result/terminal reads`, async () => {
    const fixture = setup();
    await fixture.run(async () => {
      const stream = fixture.metered[method](
        model,
        { messages: [] },
        fixture.options,
      );
      await stream.result();
      await stream.result();
      fixture.upstream.push({
        type: "done",
        reason: "stop",
        message: complete,
      });
      for await (const _event of stream) {
        /* Drain the same terminal view. */
      }
      expect(fixture.read().totals).toMatchObject({
        spentCalls: 1,
        spentUsd: 0.00045,
        outstandingReservedUsd: 0,
      });
      expect(fixture.read().calls).toHaveLength(1);
    });
    expect(fixture.starts()).toBe(1);
    expect(fixture.dispatches()).toBe(1);
  });
}

test("completed native usage survives cancellation after approval without publishing output", async () => {
  const fixture = setup();
  const controller = new AbortController();
  const admitted = withBufferedToolAdmission(
    fixture.metered,
    () => true,
    new Set(),
  );
  await fixture.run(async () => {
    const stream = admitted.streamSimple(
      model,
      { messages: [] },
      { ...fixture.options, signal: controller.signal },
    );
    await stream.result();
    controller.abort();
    await expect(stream.result()).rejects.toThrow(/cancelled/);
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toThrow(
      /cancelled/,
    );
    expect(fixture.read().calls.at(0)?.status).toBe("complete");
    expect(fixture.read().totals.spentUsd).toBe(0.00045);
    expect(fixture.read().totals.spentCalls).toBe(1);
  });
});

test("no opt-in means no instrument, invalid configuration fails without printing input", () => {
  expect(createStepARequestAccounting(undefined)).toBeUndefined();
  expect(() => createStepARequestAccounting("SECRET-invalid")).toThrow(
    "Invalid Step A accounting configuration.",
  );
  expect(() =>
    createStepARequestAccounting(
      JSON.stringify({ ledgerPath: "relative", runId: "TEST" }),
    ),
  ).toThrow(/accounting configuration/);
});

test("missing runtime identity and missing ledger refuse before native invocation", async () => {
  const fixture = setup();
  expect(() =>
    fixture.metered.streamSimple(model, { messages: [] }, fixture.options),
  ).toThrow(/accounting refused/);
  rmSync(fixture.ledgerPath);
  await expect(
    fixture.run(async () => {
      fixture.metered.streamSimple(model, { messages: [] }, fixture.options);
    }),
  ).rejects.toThrow(/accounting refused/);
  expect(fixture.starts()).toBe(0);
});

test("pre-aborted admission is not invoked; local provider preparation failure is not a transport-started charge", async () => {
  const fixture = setup();
  const abort = new AbortController();
  abort.abort();
  const admitted = withBufferedToolAdmission(
    fixture.metered,
    () => true,
    new Set(),
  );
  await fixture.run(async () => {
    await expect(
      admitted
        .streamSimple(
          model,
          { messages: [] },
          { ...fixture.options, signal: abort.signal },
        )
        .result(),
    ).rejects.toThrow(/cancelled/);
  });
  expect(fixture.read().calls).toHaveLength(0);
  fixture.failPreparation();
  await expect(
    fixture.run(async () => {
      fixture.metered.streamSimple(model, { messages: [] }, fixture.options);
    }),
  ).rejects.toThrow(/no automatic retry/);
  expect(fixture.read().calls.at(0)).toMatchObject({
    status: "not-started",
    invocation: "started",
    transport: "not-started",
  });
  expect(fixture.read().totals.spentCalls).toBe(0);
  expect(fixture.dispatches()).toBe(0);
});

test("a provider retry cannot cross the SDK dispatch boundary a second time", async () => {
  const fixture = setup();
  fixture.retry();
  await expect(
    fixture.run(async () => {
      fixture.metered.streamSimple(model, { messages: [] }, fixture.options);
    }),
  ).rejects.toThrow(/accounting/);
  expect(fixture.dispatches()).toBe(1);
  expect(fixture.read().calls.at(0)?.status).toBe("unknown");
  await expect(
    fixture.run(async () => {
      fixture.metered.streamSimple(model, { messages: [] }, fixture.options);
    }, "TEST-next"),
  ).rejects.toThrow(/accounting/);
  expect(fixture.starts()).toBe(1);
});

for (const breach of [
  "tokens",
  "cost",
  "underpriced",
  "zero",
  "error",
] as const) {
  test(`${breach}: terminal observation does not release an uncertain reservation`, async () => {
    const fixture = setup();
    const message = structuredClone(complete);
    if (breach === "tokens") {
      message.usage.output = 17;
      message.usage.totalTokens = 117;
    }
    if (breach === "cost") {
      message.usage.cost.input = 8;
      message.usage.cost.total = 8.00015;
    }
    if (breach === "underpriced") {
      message.usage.cost.input = 0.000003;
      message.usage.cost.total = 0.000153;
    }
    if (breach === "zero") {
      message.usage = {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      };
    }
    if (breach === "error") message.stopReason = "error";
    fixture.respond(message);
    await fixture.run(async () => {
      await fixture.metered
        .streamSimple(model, { messages: [] }, fixture.options)
        .result();
    });
    expect(fixture.read().calls.at(0)?.status).toBe("unknown");
    expect(fixture.read().totals.outstandingReservedUsd).toBe(
      breach === "cost" ? 8.00015 : 7,
    );
    await expect(
      fixture.run(async () => {
        fixture.metered.streamSimple(model, { messages: [] }, fixture.options);
      }, "TEST-next"),
    ).rejects.toThrow(/accounting/);
    expect(fixture.starts()).toBe(1);
  });
}

test("a failed journal append remains a durable stop after the journal becomes writable and the instrument restarts", async () => {
  const fixture = setup();
  fixture.hold();
  const journalPath = join(fixture.directory, "attempt-ledger.md");
  await fixture.run(async () => {
    const stream = fixture.metered.streamSimple(
      model,
      { messages: [] },
      fixture.options,
    );
    const priorJournal = readFileSync(journalPath, "utf8");
    rmSync(journalPath);
    mkdirSync(journalPath);
    fixture.upstream.push({ type: "done", reason: "stop", message: complete });
    await stream.result();
    rmSync(journalPath, { recursive: true });
    writeFileSync(journalPath, priorJournal);
  });
  const restarted = createStepARequestAccounting(
    JSON.stringify({ ledgerPath: fixture.ledgerPath, runId: "TEST-run" }),
  )!;
  let restartedStarts = 0;
  const provider = restarted.wrap(
    {
      ...native,
      streamSimple: () => {
        restartedStarts++;
        return createAssistantMessageEventStream();
      },
    },
    () => true,
  );
  await expect(
    restarted.interceptor(
      { type: "model", turnId: "TEST-next" },
      {
        instanceId: "TEST-instance",
        conversationId: "TEST-conversation",
        submissionId: "TEST-submission",
        operationId: "TEST-operation",
        turnId: "TEST-next",
      },
      async () => {
        provider.streamSimple(model, { messages: [] }, fixture.options);
      },
    ),
  ).rejects.toThrow(/accounting refused/);
  expect(restartedStarts).toBe(0);
  expect(fixture.read().calls.at(0)?.journalPending).toBe(true);
});

test("partial usage survives a zero terminal error without summing snapshots", async () => {
  const fixture = setup();
  fixture.hold();
  await fixture.run(async () => {
    const stream = fixture.metered.streamSimple(
      model,
      { messages: [] },
      fixture.options,
    );
    const iterator = stream[Symbol.asyncIterator]();
    fixture.upstream.push({ type: "start", partial: complete });
    await iterator.next();
    const error: AssistantMessage = {
      ...complete,
      stopReason: "error",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    };
    fixture.upstream.push({ type: "error", reason: "error", error });
    await stream.result();
    expect(fixture.read().calls.at(0)?.partialUsage?.totalTokens).toBe(110);
    expect(fixture.read().calls.at(0)?.terminal?.usage.totalTokens).toBe(0);
    expect(fixture.read().calls.at(0)?.status).toBe("unknown");
    expect(fixture.read().totals.spentCalls).toBe(1);
    await iterator.return?.();
  });
});

test("accounting persists only identity and usage, not content or diagnostic fields", async () => {
  const fixture = setup();
  const message = structuredClone(complete);
  message.content = [{ type: "text", text: "TEST-hidden-content" }];
  message.errorMessage = "TEST-hidden-content";
  Object.assign(message.usage, { unexpectedContent: "TEST-hidden-content" });
  fixture.respond(message);
  await fixture.run(async () => {
    await fixture.metered
      .streamSimple(model, { messages: [] }, fixture.options)
      .result();
  });
  expect(readFileSync(fixture.ledgerPath, "utf8")).not.toContain(
    "TEST-hidden-content",
  );
  expect(fixture.read().totals.spentCalls).toBe(1);
});

test("inactive scope returns the original provider stream without touching an absent ledger", () => {
  const fixture = setup();
  rmSync(fixture.ledgerPath);
  const upstream = createAssistantMessageEventStream();
  const provider: Provider = {
    ...native,
    stream: () => upstream,
    streamSimple: () => upstream,
  };
  const wrapped = fixture.accounting.wrap(provider, () => false);
  expect(wrapped.stream(model, { messages: [] })).toBe(upstream);
  expect(wrapped.streamSimple(model, { messages: [] })).toBe(upstream);
});

for (const ceiling of ["calls", "usd"] as const) {
  test(`the shared ${ceiling} ceiling refuses even when the run allocation remains`, async () => {
    const fixture = setup();
    await fixture.run(async () => {
      await fixture.metered
        .streamSimple(model, { messages: [] }, fixture.options)
        .result();
    });
    const ledger = fixture.read();
    if (ceiling === "calls") {
      ledger.limits.calls = 1;
      ledger.totals.remainingCalls = 0;
    } else {
      ledger.limits.usd = 1;
      ledger.totals.remainingUsd = 0.99955;
    }
    writeFileSync(fixture.ledgerPath, JSON.stringify(ledger));
    await expect(
      fixture.run(async () => {
        fixture.metered.streamSimple(model, { messages: [] }, fixture.options);
      }, "TEST-next"),
    ).rejects.toThrow(/accounting refused/);
    expect(fixture.starts()).toBe(1);
  });
}

test("historical five-call authority is compatible only in a disposable copy; prior rows are preserved", async () => {
  const fixture = setup();
  // Freeze the historical premise; the live authority now contains an unknown r2 call.
  // Exact source: f2b9bfd040:.../fe-1573-step-a/usage-ledger.json.
  const path = new URL(
    "./fixtures/provider-accounting/historical-five-call-ledger.json",
    import.meta.url,
  );
  const original = readFileSync(path, "utf8");
  const historical = JSON.parse(original) as typeof fixture.ledger;
  expect(historical.calls).toHaveLength(5);
  expect(historical.calls.every((call) => call.status === "complete")).toBe(
    true,
  );
  const historicalCalls = structuredClone(historical.calls);
  historical.reservation = fixture.ledger.reservation;
  writeFileSync(fixture.ledgerPath, JSON.stringify(historical));
  await fixture.run(async () => {
    await fixture.metered
      .streamSimple(model, { messages: [] }, fixture.options)
      .result();
  });
  expect(fixture.read().calls.slice(0, 5)).toEqual(historicalCalls);
  expect(fixture.read().totals.spentCalls).toBe(6);
  expect(fixture.read().totals.spentUsd).toBeCloseTo(0.09158535, 12);
  expect(readFileSync(path, "utf8")).toBe(original);
});

const piIdentity = {
  kind: "pi" as const,
  sessionId: "TEST-pi-session",
  requestId: "TEST-pi-request",
};

for (const sameRun of [false, true]) {
  for (const ceiling of ["global", "run"] as const) {
    test(`accepted unknown preserves its hold against ${ceiling}, same run=${sameRun}`, async () => {
      const fixture = setup();
      fixture.respond({ ...complete, stopReason: "error" });
      await fixture.run(async () => {
        await fixture.metered
          .streamSimple(model, { messages: [] }, fixture.options)
          .result();
      });
      const prior = fixture.read();
      const original = structuredClone(prior.calls[0]);
      const runId = sameRun ? "TEST-run" : "TEST-new-run";
      const allocated = {
        ...prior,
        reservation: {
          ...prior.reservation,
          runId,
          calls: 4,
          usd: 13,
          acceptedUnknownSequences: [1],
        },
      };
      if (ceiling === "global") {
        allocated.reservation.usd = 30;
        allocated.limits.usd = 13;
        allocated.totals.remainingUsd = 13;
      }
      writeFileSync(fixture.ledgerPath, JSON.stringify(allocated));
      const ledger = () =>
        new RequestLedger(
          fixture.ledgerPath,
          join(fixture.directory, "attempt-ledger.md"),
          runId,
        );
      expect(() => ledger().prepare(piIdentity, model)).toThrow(
        /accounting refused/,
      );
      expect(fixture.read().calls[0]).toEqual(original);
      allocated.reservation.usd = 14;
      allocated.limits.usd = 100;
      allocated.totals.remainingUsd = 100;
      writeFileSync(fixture.ledgerPath, JSON.stringify(allocated));
      const request = ledger().prepare(piIdentity, model);
      expect(fixture.read().calls.at(-1)).toMatchObject({
        identity: piIdentity,
        status: "unknown",
      });
      expect(fixture.read().totals.outstandingReservedUsd).toBe(14);
      // The new unknown is not admitted by acceptance of the prior sequence.
      expect(() =>
        ledger().prepare({ ...piIdentity, requestId: "TEST-next" }, model),
      ).toThrow(/accounting refused/);
      request.notStarted();
      expect(fixture.read().calls[0]).toEqual(original);
      expect(fixture.read().totals.outstandingReservedUsd).toBe(7);
    });
  }
}

test("acceptance cannot name future rows or duplicates", () => {
  for (const sequences of [[1], [1, 1]]) {
    const fixture = setup();
    writeFileSync(
      fixture.ledgerPath,
      JSON.stringify({
        ...fixture.ledger,
        reservation: {
          ...fixture.ledger.reservation,
          acceptedUnknownSequences: sequences,
        },
      }),
    );
    const ledger = new RequestLedger(
      fixture.ledgerPath,
      join(fixture.directory, "attempt-ledger.md"),
      "TEST-run",
    );
    expect(() => ledger.prepare(piIdentity, model)).toThrow(
      /accounting refused/,
    );
    expect(fixture.read().calls).toHaveLength(0);
  }
});

test("accepted unknown uses the larger observed hold and never waives journalPending", () => {
  const fixture = setup();
  const makeLedger = () =>
    new RequestLedger(
      fixture.ledgerPath,
      join(fixture.directory, "attempt-ledger.md"),
      "TEST-run",
    );
  const request = makeLedger().prepare(piIdentity, model);
  request.started();
  request.dispatched();
  const partial = structuredClone(complete);
  partial.usage.cost.input = 9;
  partial.usage.cost.total = 9.00015;
  request.partial(partial);
  const prior = fixture.read();
  const allocated = {
    ...prior,
    reservation: {
      ...prior.reservation,
      acceptedUnknownSequences: [1],
      usd: 16,
    },
  };
  writeFileSync(fixture.ledgerPath, JSON.stringify(allocated));
  expect(() =>
    makeLedger().prepare({ ...piIdentity, requestId: "TEST-next" }, model),
  ).toThrow(/accounting refused/);
  expect(fixture.read().totals.outstandingReservedUsd).toBe(9.00015);
  allocated.reservation.usd = 17;
  const first = allocated.calls[0];
  if (!first) throw new Error("TEST missing prior request");
  first.journalPending = true;
  writeFileSync(fixture.ledgerPath, JSON.stringify(allocated));
  expect(() =>
    makeLedger().prepare({ ...piIdentity, requestId: "TEST-next" }, model),
  ).toThrow(/accounting refused/);
  expect(fixture.read().calls).toEqual(allocated.calls);
});

test("two real processes cannot interleave ledger transactions; a stale guard is never stolen", async () => {
  const fixture = setup();
  const source = new URL(
    "../src/provider-accounting/request-ledger.ts",
    import.meta.url,
  ).href;
  // Child pauses inside the real transaction's read. This is test-only scheduling,
  // not an alternate ledger implementation or a provider invocation.
  const child = spawn(
    process.execPath,
    [
      "--experimental-transform-types",
      "--input-type=module",
      "-e",
      `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    import { RequestLedger } from ${JSON.stringify(source)};
    const read = fs.readFileSync;
    let paused = false;
    fs.readFileSync = (...args) => {
      if (args[0] === process.argv[1] && !paused) {
        paused = true;
        process.stdout.write('LOCKED\\n');
        read(0, 'utf8'); // Parent releases this real transaction through stdin EOF.
      }
      return read(...args);
    };
    syncBuiltinESMExports();
    const ledger = new RequestLedger(process.argv[1], process.argv[2], 'TEST-run');
    ledger.prepare(${JSON.stringify(piIdentity)}, ${JSON.stringify(model)}).notStarted();
  `,
      fixture.ledgerPath,
      join(fixture.directory, "attempt-ledger.md"),
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  await new Promise<void>((resolve, reject) => {
    child.stdout.once("data", () => resolve());
    child.once("exit", () =>
      reject(new Error(`Child exited before transaction: ${stderr}`)),
    );
  });
  const ledger = () =>
    new RequestLedger(
      fixture.ledgerPath,
      join(fixture.directory, "attempt-ledger.md"),
      "TEST-run",
    );
  try {
    expect(() =>
      ledger().prepare({ ...piIdentity, requestId: "TEST-parent" }, model),
    ).toThrow(/accounting refused/);
  } finally {
    child.stdin.end();
  }
  expect(await exited, stderr).toBe(0);
  expect(fixture.read().calls).toHaveLength(1);
  ledger()
    .prepare({ ...piIdentity, requestId: "TEST-parent" }, model)
    .notStarted();
  expect(fixture.read().calls).toHaveLength(2);
  writeFileSync(`${fixture.ledgerPath}.lock`, "TEST stale owner");
  expect(() =>
    ledger().prepare({ ...piIdentity, requestId: "TEST-stale" }, model),
  ).toThrow(/accounting refused/);
  expect(readFileSync(`${fixture.ledgerPath}.lock`, "utf8")).toBe(
    "TEST stale owner",
  );
});
