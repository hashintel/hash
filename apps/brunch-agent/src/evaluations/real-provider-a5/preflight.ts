import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  closeSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, dirname } from "node:path";

import { createModels } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

export const modelId = "claude-sonnet-4-6";
export const endpoint = "https://api.anthropic.com/v1/messages";
export const maxOutputTokens = 4096;
export const reservedUsd = 7;
export const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export const selectedModel = () => {
  const model = anthropicProvider()
    .getModels()
    .find((entry) => entry.id === modelId);
  assert(model);
  assert.equal(model.provider, "anthropic");
  assert.equal(model.api, "anthropic-messages");
  assert.equal(model.baseUrl, "https://api.anthropic.com");
  const inputRate = Math.max(
    model.cost.input * 2,
    model.cost.cacheWrite,
    model.cost.cacheRead,
  );
  const worstUsd =
    (model.contextWindow * inputRate + maxOutputTokens * model.cost.output) /
    1_000_000;
  assert(Number.isFinite(worstUsd) && worstUsd > 0 && worstUsd <= reservedUsd);
  assert(maxOutputTokens <= model.maxTokens);
  return { model, inputRate, worstUsd, maxOutputTokens, reservedUsd };
};

/** Same default environment-backed provider resolution as the built registration.
 * No refresh, request, credential value or auth source is returned/logged. */
export const credentialsAvailable = async () => {
  const models = createModels();
  models.setProvider(anthropicProvider());
  return (await models.checkAuth("anthropic")) !== undefined;
};

export const acquireWriter = (ledgerPath: string, runId: string) => {
  const path = `${realpathSync(ledgerPath)}.a5-writer.lock`;
  const descriptor = openSync(path, "wx", 0o600);
  writeFileSync(descriptor, JSON.stringify({ runId, pid: process.pid }));
  closeSync(descriptor);
  return () => unlinkSync(path);
};

export type LedgerView = {
  limits: { calls: number; usd: number };
  reservation: {
    runId: string;
    status: string;
    calls: number;
    usd: number;
    perCall?: { maxOutputTokens: number; reservedUsd: number };
  };
  calls: {
    sequence: number;
    status: string;
    journalPending?: boolean;
    actualUsd?: number;
    runId?: string;
    identity?: { turnId: string };
    transport?: string;
  }[];
  totals: {
    spentCalls: number;
    spentUsd: number;
    remainingCalls: number;
    remainingUsd: number;
    outstandingReservedCalls: number;
    outstandingReservedUsd: number;
  };
};
export const readLedger = (path: string): LedgerView =>
  JSON.parse(readFileSync(path, "utf8")) as LedgerView;

/** Read-only early gate. RequestLedger remains authoritative and validates every
 * row/usage again before native invocation; this is not another allocation. */
export const reservationReady = (path: string, runId: string) => {
  assert(
    isAbsolute(path) && realpathSync(path) === path,
    "Require the owner's canonical absolute ledger path",
  );
  readFileSync(join(dirname(path), "attempt-ledger.md"));
  const ledger = readLedger(path);
  const reservation = ledger.reservation;
  assert.equal(reservation.runId, runId);
  assert.equal(reservation.status, "active");
  assert(
    Number.isSafeInteger(reservation.calls) &&
      reservation.calls > 0 &&
      reservation.calls <= 20,
  );
  assert(reservation.usd > 0 && reservation.usd <= 15);
  assert.deepEqual(reservation.perCall, { maxOutputTokens, reservedUsd });
  assert(ledger.limits.calls <= 200 && ledger.limits.usd <= 100);
  assert(
    !ledger.calls.some(
      (call) => call.status === "unknown" || call.journalPending,
    ),
  );
  assert(
    ledger.calls.every((call) =>
      ["complete", "not-started"].includes(call.status),
    ),
  );
  const spentCalls = ledger.calls.filter(
    (call) => call.status !== "not-started",
  ).length;
  const spentUsd = ledger.calls.reduce(
    (sum, call) =>
      sum + (call.status === "complete" ? (call.actualUsd ?? NaN) : 0),
    0,
  );
  assert(Number.isFinite(spentUsd) && spentUsd >= 0);
  assert.equal(ledger.totals.spentCalls, spentCalls);
  assert(Math.abs(ledger.totals.spentUsd - spentUsd) < 1e-9);
  assert.equal(ledger.totals.remainingCalls, ledger.limits.calls - spentCalls);
  assert(
    Math.abs(ledger.totals.remainingUsd - (ledger.limits.usd - spentUsd)) <
      1e-9,
  );
  assert.equal(ledger.totals.outstandingReservedCalls, 0);
  assert.equal(ledger.totals.outstandingReservedUsd, 0);
  const runCalls = ledger.calls.filter(
    (call) => call.runId === runId && call.status !== "not-started",
  );
  assert(
    runCalls.length < reservation.calls && spentCalls < ledger.limits.calls,
  );
  assert(
    runCalls.reduce((sum, call) => sum + (call.actualUsd ?? NaN), 0) +
      reservedUsd <=
      reservation.usd,
  );
  assert(spentUsd + reservedUsd <= ledger.limits.usd);
  return ledger;
};

/** Cumulative provider tool history, deduplicated across continuations. Stop all
 * further calls after the third rejected canonical operation, not just its fourth
 * execution. Browser failures are also fed directly by the HTTP result boundary. */
export const repairBudget = () => {
  // A rejected canonical operation counts even when this mode does not mount it.
  // This registry controls repair limits, never tool admission.
  const canonicalNames = new Set(Object.keys(petrinautAiTools));
  const names = new Map<string, string>();
  const rejected = new Map<string, Set<string>>();
  const reject = (id: string, name: string) => {
    if (!canonicalNames.has(name)) return;
    const ids = rejected.get(name) ?? new Set<string>();
    ids.add(id);
    rejected.set(name, ids);
  };
  const check = () => {
    assert(
      ![...rejected.values()].some((ids) => ids.size >= 3),
      "Canonical operation repair budget exhausted (three rejected attempts); no further provider calls",
    );
  };
  const observe = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) observe(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    if (
      item.type === "tool_use" &&
      typeof item.id === "string" &&
      typeof item.name === "string"
    )
      names.set(item.id, item.name);
    if (
      item.type === "tool_result" &&
      item.is_error === true &&
      typeof item.tool_use_id === "string"
    ) {
      const name = names.get(item.tool_use_id);
      assert(name, "Unattributed tool rejection");
      reject(item.tool_use_id, name);
    }
    if (
      typeof item.toolCallId === "string" &&
      typeof item.toolName === "string"
    ) {
      const output = item.output as Record<string, unknown> | undefined;
      const metadata = item.metadata as
        | { transitionRecord?: { outcome?: string } }
        | undefined;
      if (
        item.error ||
        output?.error ||
        output?.success === false ||
        ["failed", "stale", "unknown", "no-op"].includes(
          metadata?.transitionRecord?.outcome ?? "",
        )
      )
        reject(item.toolCallId, item.toolName);
    }
    for (const child of Object.values(item)) observe(child);
  };
  return {
    observe,
    check,
    reject,
    snapshot: () =>
      Object.fromEntries([...rejected].map(([name, ids]) => [name, [...ids]])),
  };
};
