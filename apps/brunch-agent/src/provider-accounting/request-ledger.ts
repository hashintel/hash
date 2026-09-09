/* eslint-disable no-param-reassign -- Transactions deliberately mutate one freshly decoded ledger row before an atomic replacement. */
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import { calculateCost } from "@earendil-works/pi-ai";
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
const flueIdentitySchema = v.object({
  instanceId: id,
  conversationId: id,
  submissionId: id,
  operationId: id,
  turnId: id,
});
const identitySchema = v.union([
  flueIdentitySchema,
  v.strictObject({ kind: v.literal("pi"), sessionId: id, requestId: id }),
]);
export type RequestIdentity = v.InferOutput<typeof identitySchema>;
const identityKey = (identity: RequestIdentity) =>
  "kind" in identity
    ? `pi:${identity.sessionId}:${identity.requestId}`
    : `flue:${identity.turnId}`;

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
  journalPending: v.optional(v.boolean()),
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
    acceptedUnknownSequences: v.optional(v.array(positiveCount)),
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
const holdUsd = (call: Call) =>
  Math.max(
    call.reservedUsd,
    call.usage?.cost.total ?? 0,
    call.partialUsage?.cost.total ?? 0,
  );
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
      (sum, call) => sum + holdUsd(call),
      0,
    ),
  };
};

/** One evidence authority shared by the app and persona processes. Each synchronous
 * transaction owns an exclusive file guard; contention/stale guards stop, never retry or steal.
 * JSON is authority; Markdown is its attempt journal, not a second production store.
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

  #transaction<T>(operation: () => T): T {
    if (this.#poisoned) fail();
    const lockPath = `${this.path}.lock`;
    let descriptor: number;
    try {
      descriptor = openSync(lockPath, "wx", 0o600);
    } catch {
      this.poison();
      return fail();
    }
    try {
      return operation();
    } catch (error) {
      this.poison();
      throw error;
    } finally {
      closeSync(descriptor);
      unlinkSync(lockPath);
    }
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
      ledger.calls.some((call) => call.journalPending === true) ||
      Object.entries(totals).some(
        ([key, value]) =>
          !near(value, ledger.totals[key as keyof typeof totals]),
      ) ||
      ledger.calls.some(
        (call, index) =>
          call.sequence !== index + 1 ||
          (call.accountingVersion === undefined
            ? call.status !== "complete"
            : call.journalPending === undefined ||
              !call.identity ||
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
    const accepted = ledger.reservation.acceptedUnknownSequences ?? [];
    if (
      new Set(accepted).size !== accepted.length ||
      accepted.some(
        (sequence) =>
          !ledger.calls.some(
            (call) => call.sequence === sequence && call.status === "unknown",
          ),
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
    const replace = () => {
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
    };
    // Two files are not an atomic transaction. Persist that uncertainty in the
    // SAME authority before touching the journal; any reread refuses until both
    // writes were flushed. A crash after append but before clearing also stops.
    call.journalPending = true;
    replace();
    const journal = openSync(this.attemptPath, "a");
    try {
      writeFileSync(
        journal,
        `\n- Request accounting v1: run ${call.runId}, sequence ${call.sequence}, request ${call.identity ? identityKey(call.identity) : "missing"}, ${call.status}, invocation ${call.invocation}, reserved USD ${call.reservedUsd}, catalogue estimate USD ${call.actualUsd ?? "unknown"}. JSON usage-ledger.json is authoritative.\n`,
      );
      fsyncSync(journal);
    } finally {
      closeSync(journal);
    }
    call.journalPending = false;
    replace();
  }

  prepare(
    context: FlueExecutionContext | RequestIdentity | undefined,
    model: Model<Api>,
  ) {
    return this.#transaction(() => this.#prepare(context, model));
  }

  #prepare(
    context: FlueExecutionContext | RequestIdentity | undefined,
    model: Model<Api>,
  ) {
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
      ledger.calls.some(
        (call) =>
          call.status === "unknown" &&
          !(reservation.acceptedUnknownSequences ?? []).includes(call.sequence),
      ) ||
      ledger.calls.some(
        (call) =>
          call.identity && identityKey(call.identity) === identityKey(identity),
      )
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
    const acceptedPriorHold = ledger.calls
      .filter(
        (call) =>
          call.status === "unknown" &&
          call.runId !== this.runId &&
          (reservation.acceptedUnknownSequences ?? []).includes(call.sequence),
      )
      .reduce((sum, call) => sum + holdUsd(call), 0);
    if (
      !Number.isFinite(worstUsd) ||
      worstUsd <= 0 ||
      bounds.reservedUsd < worstUsd ||
      runCalls.length >= reservation.calls ||
      runCalls.reduce(
        (sum, call) =>
          sum +
          (call.status === "unknown"
            ? holdUsd(call)
            : (call.actualUsd ?? call.reservedUsd)),
        0,
      ) +
        acceptedPriorHold +
        bounds.reservedUsd >
        reservation.usd ||
      ledger.totals.spentCalls >= ledger.limits.calls ||
      ledger.totals.spentUsd +
        ledger.totals.outstandingReservedUsd +
        bounds.reservedUsd >
        ledger.limits.usd
    )
      fail();
    // Verify the existing attempt journal exists before introducing a row.
    readFileSync(this.attemptPath, "utf8");
    const call: Call = {
      sequence: ledger.calls.length + 1,
      accountingVersion: 1,
      journalPending: false,
      runId: this.runId,
      identity,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      // Reserve atomically before releasing the transaction, even before started().
      status: "unknown",
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
        this.#transaction(() => {
          const currentLedger = this.#read();
          const current = currentLedger.calls.find(
            (entry) => entry.sequence === call.sequence,
          );
          if (
            !current?.identity ||
            identityKey(current.identity) !== identityKey(identity)
          )
            return fail();
          const before = JSON.stringify(current);
          change(current);
          if (JSON.stringify(current) !== before)
            this.#save(currentLedger, current);
        });
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
          // The native cost is a catalogue estimate, not an invoice. Compare
          // against the installed estimator without replacing the observation.
          const estimate = calculateCost(model, structuredClone(usage));
          const catalogueCostMatches = Object.entries(estimate).every(
            ([component, value]) =>
              near(value, usage.cost[component as keyof typeof estimate]),
          );
          const withinBounds =
            catalogueCostMatches &&
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
