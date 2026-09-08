/* eslint-disable no-param-reassign -- Transactions deliberately mutate one freshly decoded ledger row before an atomic replacement. */
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import * as v from "valibot";

import type { Api, AssistantMessage, Model } from "@earendil-works/pi-ai";
import type { FlueExecutionContext } from "@flue/runtime";

const amount = v.pipe(v.number(), v.finite(), v.minValue(0));
const count = v.pipe(amount, v.integer());
const positiveCount = v.pipe(count, v.minValue(1));
const id = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(512),
  v.regex(/^[\w.:-]+$/),
);
const identitySchema = v.object({
  instanceId: id,
  conversationId: id,
  submissionId: id,
  operationId: id,
  turnId: id,
});
const usageSchema = v.object({
  input: count,
  output: count,
  cacheRead: count,
  cacheWrite: count,
  totalTokens: count,
  cacheWrite1h: v.optional(count),
  reasoning: v.optional(count),
  cost: v.object({
    input: amount,
    output: amount,
    cacheRead: amount,
    cacheWrite: amount,
    total: amount,
  }),
});
const observationSchema = v.object({
  provider: id,
  model: id,
  stopReason: v.picklist([
    "pending",
    "stop",
    "length",
    "toolUse",
    "error",
    "aborted",
  ]),
  responseId: v.optional(id),
  usage: usageSchema,
});
const callSchema = v.looseObject({
  sequence: positiveCount,
  status: v.picklist(["complete", "not-started", "unknown"]),
  reservedUsd: amount,
  actualUsd: v.optional(amount), // Historical name means catalogue estimate, NOT invoice amount.
  usage: v.optional(usageSchema),
  partialUsage: v.optional(usageSchema),
  accountingVersion: v.optional(v.literal(1)),
  runId: v.optional(id),
  identity: v.optional(identitySchema),
  provider: v.optional(v.literal("anthropic")),
  model: v.optional(v.literal("claude-sonnet-4-6")),
  maxOutputTokens: v.optional(positiveCount),
  inputTokenCeiling: v.optional(positiveCount),
  invocation: v.optional(v.picklist(["not-started", "started"])),
  transport: v.optional(v.picklist(["not-started", "started"])),
  cancelledOrFailed: v.optional(v.boolean()),
  terminal: v.optional(observationSchema),
});
const ledgerSchema = v.looseObject({
  limits: v.object({ calls: positiveCount, usd: amount }),
  reservation: v.looseObject({
    runId: id,
    status: v.string(),
    calls: positiveCount,
    usd: amount,
    perCall: v.optional(
      v.object({ maxOutputTokens: positiveCount, reservedUsd: amount }),
    ),
  }),
  totals: v.object({
    spentCalls: count,
    spentUsd: amount,
    remainingCalls: count,
    remainingUsd: amount,
    outstandingReservedCalls: count,
    outstandingReservedUsd: amount,
  }),
  calls: v.array(callSchema),
});
type Ledger = v.InferOutput<typeof ledgerSchema>;
type Call = Ledger["calls"][number];
const fail = (): never => {
  throw new Error(
    "Step A accounting refused: invalid, missing, exhausted or unresolved reservation.",
  );
};
const near = (left: number, right: number) => Math.abs(left - right) < 1e-9;
const validateUsage = (usage: AssistantMessage["usage"]) => {
  const parsed = v.parse(usageSchema, usage);
  if (
    parsed.totalTokens !==
      parsed.input + parsed.output + parsed.cacheRead + parsed.cacheWrite ||
    (parsed.cacheWrite1h ?? 0) > parsed.cacheWrite ||
    (parsed.reasoning ?? 0) > parsed.output ||
    !near(
      parsed.cost.total,
      parsed.cost.input +
        parsed.cost.output +
        parsed.cost.cacheRead +
        parsed.cost.cacheWrite,
    )
  )
    fail();
  return parsed;
};
const totalsFrom = (ledger: Ledger) => {
  const spentCalls = ledger.calls.filter(
    (call) => call.status !== "not-started",
  ).length;
  const spentUsd = ledger.calls.reduce(
    (sum, call) =>
      sum + (call.status === "complete" ? (call.actualUsd ?? fail()) : 0),
    0,
  );
  const unresolved = ledger.calls.filter((call) => call.status === "unknown");
  return {
    spentCalls,
    spentUsd,
    remainingCalls: ledger.limits.calls - spentCalls,
    remainingUsd: ledger.limits.usd - spentUsd,
    outstandingReservedCalls: unresolved.length,
    outstandingReservedUsd: unresolved.reduce(
      (sum, call) =>
        sum +
        Math.max(
          call.reservedUsd,
          call.usage?.cost.total ?? 0,
          call.partialUsage?.cost.total ?? 0,
        ),
      0,
    ),
  };
};

/** Single-process, single-writer evidence ledger. JSON is authority; Markdown is its attempt journal.
 * No lock/concurrency service, invoice claim, content telemetry or second production store.
 */
export class RequestLedger {
  #poisoned = false;
  constructor(
    readonly path: string,
    readonly attemptPath: string,
    readonly runId: string,
  ) {}

  poison() {
    this.#poisoned = true;
  }

  #read() {
    if (this.#poisoned) fail();
    let ledger: Ledger;
    try {
      ledger = v.parse(
        ledgerSchema,
        JSON.parse(readFileSync(this.path, "utf8")),
      );
    } catch {
      return fail();
    }
    const totals = totalsFrom(ledger);
    if (
      ledger.limits.calls > 200 ||
      ledger.limits.usd > 100 ||
      Object.entries(totals).some(
        ([key, value]) =>
          !near(value, ledger.totals[key as keyof typeof totals]),
      ) ||
      ledger.calls.some(
        (call, index) =>
          call.sequence !== index + 1 ||
          (call.accountingVersion === undefined
            ? call.status !== "complete"
            : !call.identity ||
              !call.runId ||
              !call.invocation ||
              !call.transport ||
              !call.provider ||
              !call.model ||
              !call.maxOutputTokens ||
              !call.inputTokenCeiling ||
              (call.status === "complete" && !call.terminal) ||
              (call.status === "not-started" && call.transport === "started")),
      )
    )
      fail();
    for (const call of ledger.calls) {
      if (call.usage) validateUsage(call.usage);
      if (call.partialUsage) validateUsage(call.partialUsage);
      if (
        call.status === "complete" &&
        (!call.usage || !near(call.actualUsd ?? -1, call.usage.cost.total))
      )
        fail();
    }
    return ledger;
  }

  #save(ledger: Ledger, call: Call) {
    ledger.totals = totalsFrom(ledger);
    // Flush + rename: interrupted writes cannot leave a truncated authority that
    // looks free. A leftover temporary file is not consulted as another ledger.
    const temporary = `${this.path}.${process.pid}.tmp`;
    const descriptor = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(descriptor, `${JSON.stringify(ledger, null, 2)}\n`);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, this.path);
    const directory = openSync(dirname(this.path), "r");
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
    // If this append fails, JSON already retains the attempt. Poison this process
    // too; neither a journal error nor an observer error authorizes a new launch.
    const journal = openSync(this.attemptPath, "a");
    try {
      writeFileSync(
        journal,
        `\n- Request accounting v1: run ${call.runId}, sequence ${call.sequence}, turn ${call.identity?.turnId}, ${call.status}, invocation ${call.invocation}, reserved USD ${call.reservedUsd}, catalogue estimate USD ${call.actualUsd ?? "unknown"}. JSON usage-ledger.json is authoritative.\n`,
      );
      fsyncSync(journal);
    } finally {
      closeSync(journal);
    }
  }

  prepare(context: FlueExecutionContext | undefined, model: Model<Api>) {
    let identity: v.InferOutput<typeof identitySchema>;
    try {
      identity = v.parse(identitySchema, context);
    } catch {
      return fail();
    }
    const ledger = this.#read();
    const reservation = ledger.reservation;
    const bounds = reservation.perCall;
    if (!bounds) return fail();
    if (
      reservation.status !== "active" ||
      reservation.runId !== this.runId ||
      model.provider !== "anthropic" ||
      model.id !== "claude-sonnet-4-6" ||
      model.api !== "anthropic-messages" ||
      !Number.isSafeInteger(model.contextWindow) ||
      model.contextWindow <= 0 ||
      bounds.maxOutputTokens > model.maxTokens ||
      ledger.calls.some((call) => call.status === "unknown") ||
      ledger.calls.some((call) => call.identity?.turnId === identity.turnId)
    )
      fail();
    // Before tokenization there is no exact input count. Reserve the model's
    // ENTIRE context window at the highest input/cache rate, including 1h writes.
    const inputRate = Math.max(
      model.cost.input * 2,
      model.cost.cacheWrite,
      model.cost.cacheRead,
    );
    const worstUsd =
      (model.contextWindow * inputRate +
        bounds.maxOutputTokens * model.cost.output) /
      1_000_000;
    const runCalls = ledger.calls.filter(
      (call) => call.runId === this.runId && call.status !== "not-started",
    );
    if (
      !Number.isFinite(worstUsd) ||
      worstUsd <= 0 ||
      bounds.reservedUsd < worstUsd ||
      runCalls.length >= reservation.calls ||
      runCalls.reduce(
        (sum, call) => sum + (call.actualUsd ?? call.reservedUsd),
        0,
      ) +
        bounds.reservedUsd >
        reservation.usd ||
      ledger.totals.spentCalls >= ledger.limits.calls ||
      ledger.totals.spentUsd + bounds.reservedUsd > ledger.limits.usd
    )
      fail();
    // Verify the existing attempt journal exists before introducing a row.
    readFileSync(this.attemptPath, "utf8");
    const call: Call = {
      sequence: ledger.calls.length + 1,
      accountingVersion: 1,
      runId: this.runId,
      identity,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      status: "not-started",
      invocation: "not-started",
      transport: "not-started",
      reservedUsd: bounds.reservedUsd,
      maxOutputTokens: bounds.maxOutputTokens,
      inputTokenCeiling: model.contextWindow,
    };
    ledger.calls.push(call);
    this.#save(ledger, call);
    const update = (change: (current: Call) => void) => {
      try {
        const currentLedger = this.#read();
        const current = currentLedger.calls.find(
          (entry) => entry.sequence === call.sequence,
        );
        if (!current || current.identity?.turnId !== identity.turnId)
          return fail();
        const before = JSON.stringify(current);
        change(current);
        if (JSON.stringify(current) !== before)
          this.#save(currentLedger, current);
      } catch {
        this.poison();
        throw new Error(
          "Step A accounting persistence failed; paid work stopped.",
        );
      }
    };
    return {
      maxOutputTokens: bounds.maxOutputTokens,
      notStarted: () =>
        update((current) => {
          if (current.transport !== "started") current.status = "not-started";
        }),
      started: () =>
        update((current) => {
          current.status = "unknown";
          current.invocation = "started";
        }),
      dispatched: () =>
        update((current) => {
          if (current.transport === "started") fail();
          current.transport = "started";
        }),
      unknown: () =>
        update((current) => {
          if (current.status !== "complete") current.cancelledOrFailed = true;
        }),
      partial: (message: AssistantMessage) =>
        update((current) => {
          if (current.terminal) return;
          // Cumulative snapshots replace, never add. reasoning and cacheWrite1h are subsets.
          current.partialUsage = validateUsage(message.usage);
          current.usage = current.partialUsage;
        }),
      terminal: (message: AssistantMessage) =>
        update((current) => {
          const observation = v.parse(observationSchema, {
            provider: message.provider,
            model: message.model,
            stopReason: message.stopReason,
            ...(message.responseId ? { responseId: message.responseId } : {}),
            usage: validateUsage(message.usage),
          });
          if (current.terminal) {
            if (
              JSON.stringify(current.terminal) !== JSON.stringify(observation)
            )
              fail();
            return;
          }
          current.terminal = observation;
          current.usage = observation.usage;
          const usage = observation.usage;
          const complete =
            ["stop", "length", "toolUse"].includes(message.stopReason) &&
            usage.totalTokens > 0 &&
            usage.cost.total > 0;
          if (!complete && current.transport === "not-started")
            current.status = "not-started";
          const withinBounds =
            usage.input + usage.cacheRead + usage.cacheWrite <=
              model.contextWindow &&
            usage.output <= bounds.maxOutputTokens &&
            usage.cost.total <= bounds.reservedUsd;
          if (
            complete &&
            current.transport === "started" &&
            withinBounds &&
            !current.cancelledOrFailed &&
            message.provider === model.provider &&
            message.model === model.id
          ) {
            current.status = "complete";
            current.actualUsd = usage.cost.total;
          }
          // Aborted/error/late completion after uncertainty remain reserved. No
          // fallback settlement of uncertain spend is delegated to this instrument.
        }),
    };
  }
}
