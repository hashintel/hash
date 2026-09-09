/* eslint-disable no-await-in-loop -- Serial synthetic transport fault controls share one mock. */
import { AssertionError } from "node:assert";
import { EventEmitter } from "node:events";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { request } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test, vi } from "vitest";

vi.mock("node:https", () => ({ request: vi.fn<typeof request>() }));

import {
  acquireWriter,
  repairBudget,
  reservationReady,
  selectedModel,
} from "../src/evaluations/real-provider-a5/preflight.ts";
import { pinnedNativeRequest } from "../src/evaluations/real-provider-a5/transport.ts";

const fixture = () => ({
  authority: "TEST ONLY",
  limits: { calls: 200, usd: 100 },
  reservation: {
    runId: "TEST",
    status: "active",
    calls: 20,
    usd: 15,
    perCall: { maxOutputTokens: 4096, reservedUsd: 7 },
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
    sequence: number;
    status: string;
    runId: string;
    actualUsd?: number;
    journalPending?: boolean;
  }[],
});
const ledgerFile = (ledger = fixture()) => {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), "TEST-a5-preflight-")),
  );
  writeFileSync(join(directory, "attempt-ledger.md"), "# TEST ONLY\n");
  const path = join(directory, "usage-ledger.json");
  writeFileSync(path, JSON.stringify(ledger));
  return path;
};

describe("explicit A5 preflight (no provider invocation)", () => {
  test("uses the actual exact Sonnet catalogue and whole-context 1h-cache envelope", () => {
    const bounds = selectedModel();
    expect(bounds.model.id).toBe("claude-sonnet-4-6");
    expect(bounds.model.contextWindow).toBe(1_000_000);
    expect(bounds.model.cost).toEqual({
      input: 3,
      output: 15,
      cacheRead: 0.3,
      cacheWrite: 3.75,
    });
    expect(bounds.worstUsd).toBe(6.06144);
    expect(bounds.reservedUsd).toBe(7);
  });
  test("one canonical ledger path has one evaluation writer; stale locks refuse", () => {
    const path = ledgerFile();
    const release = acquireWriter(path, "TEST");
    expect(() => acquireWriter(path, "OTHER")).toThrow(/EEXIST/);
    release();
    acquireWriter(path, "TEST-next")();
  });
  test("allows the named TEST reservation without allocating or settling", () => {
    expect(reservationReady(ledgerFile(), "TEST").calls).toEqual([]);
  });
  test.each([
    "released",
    "missing",
    "exhausted",
    "pending",
    "unknown",
    "over-ceiling",
    "underfunded",
    "token-cap",
    "totals",
  ])("refuses %s", (control) => {
    const ledger = fixture();
    if (control === "released") ledger.reservation.status = "released";
    if (control === "missing") ledger.reservation.runId = "OTHER";
    if (control === "exhausted") {
      ledger.reservation.calls = 1;
      ledger.calls.push({
        sequence: 1,
        status: "complete",
        runId: "TEST",
        actualUsd: 0.001,
      });
      Object.assign(ledger.totals, {
        spentCalls: 1,
        spentUsd: 0.001,
        remainingCalls: 199,
        remainingUsd: 99.999,
      });
    }
    if (control === "pending" || control === "unknown")
      ledger.calls.push({
        sequence: 1,
        runId: "TEST",
        status: control === "unknown" ? "unknown" : "complete",
        actualUsd: 0.001,
        journalPending: control === "pending",
      });
    if (control === "over-ceiling") ledger.reservation.calls = 21;
    if (control === "underfunded") ledger.reservation.usd = 6;
    if (control === "token-cap")
      ledger.reservation.perCall.maxOutputTokens = 4097;
    if (control === "totals") ledger.totals.spentUsd = 1;
    expect(() => reservationReady(ledgerFile(ledger), "TEST")).toThrow(
      AssertionError,
    );
  });
  test("stops after three rejected attempts across repeated/compacted histories", () => {
    const budget = repairBudget(new Set(["addArc"]));
    const message = (id: string) => [
      { type: "tool_use", id, name: "addArc" },
      { type: "tool_result", tool_use_id: id, is_error: true },
    ];
    budget.observe(message("one"));
    budget.observe(message("one"));
    budget.check();
    budget.observe(message("two"));
    budget.check();
    budget.observe(message("three"));
    expect(() => budget.check()).toThrow(/three rejected/);
    budget.observe([]);
    expect(() => budget.check()).toThrow(/three rejected/);
    expect(budget.snapshot()).toEqual({ addArc: ["one", "two", "three"] });
  });
  test("counts canonical browser stale/failed/unknown results without a model continuation", () => {
    const budget = repairBudget(new Set(["addArc"]));
    for (const outcome of ["stale", "failed", "unknown"])
      budget.observe({
        toolCallId: outcome,
        toolName: "addArc",
        output: {},
        metadata: { transitionRecord: { outcome } },
      });
    expect(() => budget.check()).toThrow(/three rejected/);
  });
  test("unattributed tool rejection fails closed", () => {
    expect(() =>
      repairBudget(new Set(["addArc"])).observe({
        type: "tool_result",
        tool_use_id: "missing",
        is_error: true,
      }),
    ).toThrow(/Unattributed tool rejection/);
  });
  test("pins TLS/address, preserves native bytes and refuses redirects with one dispatch", async () => {
    for (const status of [200, 302, 429]) {
      const nativeBytes = Buffer.from('data: {"native":true}\n\n');
      const retained: unknown[] = [];
      vi.mocked(request).mockImplementation(((
        _url: unknown,
        options: {
          servername: string;
          rejectUnauthorized: boolean;
          agent: boolean;
          lookup: (
            host: string,
            options: { all: boolean },
            callback: (...args: unknown[]) => void,
          ) => void;
        },
        callback: (
          incoming: EventEmitter & { statusCode: number; headers: object },
        ) => void,
      ) => {
        expect(_url).toBe("https://api.anthropic.com/v1/messages");
        expect(options.servername).toBe("api.anthropic.com");
        expect(options.rejectUnauthorized).toBe(true);
        expect(options.agent).toBe(false);
        const addresses: unknown[][] = [];
        options.lookup("api.anthropic.com", { all: true }, (...args) =>
          addresses.push(args),
        );
        expect(addresses).toEqual([
          [null, [{ address: "127.0.0.1", family: 4 }]],
        ]);
        const outgoing = Object.assign(new EventEmitter(), {
          end: () =>
            queueMicrotask(() => {
              const incoming = Object.assign(new EventEmitter(), {
                statusCode: status,
                headers: { "content-type": "text/event-stream" },
              });
              callback(incoming);
              incoming.emit("data", nativeBytes);
              incoming.emit("end");
              outgoing.emit("close");
            }),
          destroy: () => outgoing.emit("close"),
        });
        return outgoing;
      }) as unknown as typeof request);
      const before = vi.mocked(request).mock.calls.length;
      const result = pinnedNativeRequest(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
          }),
        },
        "127.0.0.1",
        (data) => retained.push(data),
      );
      const outcome = await result.then(
        (response) => response.text(),
        (error: Error) => error.message,
      );
      expect(outcome).toBe(
        status === 302
          ? "Provider redirect refused; no follow-up request"
          : nativeBytes.toString(),
      );
      expect(vi.mocked(request).mock.calls.length - before).toBe(1);
      expect(retained).toHaveLength(1);
    }
  });
  test.each([
    "https://api.anthropic.com/other",
    "https://api.anthropic.com.evil/v1/messages",
    "http://api.anthropic.com/v1/messages",
  ])("refuses destination %s before HTTPS invocation", async (url) => {
    await expect(
      pinnedNativeRequest(
        url,
        {
          method: "POST",
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
          }),
        },
        "127.0.0.1",
        () => {
          throw new Error("must not dispatch");
        },
      ),
    ).rejects.toThrow(AssertionError);
  });
  test.each([
    { model: "claude-haiku-4-5", max_tokens: 4096 },
    { model: "claude-sonnet-4-6", max_tokens: 4097 },
    { model: "claude-sonnet-4-6", max_tokens: 0 },
  ])(
    "refuses changed model/output before HTTPS invocation",
    async (payload) => {
      await expect(
        pinnedNativeRequest(
          "https://api.anthropic.com/v1/messages",
          { method: "POST", body: JSON.stringify(payload) },
          "127.0.0.1",
          () => {
            throw new Error("must not dispatch");
          },
        ),
      ).rejects.toThrow(AssertionError);
    },
  );
});
