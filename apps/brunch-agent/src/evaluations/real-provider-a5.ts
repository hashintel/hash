/* eslint-disable no-await-in-loop -- One bounded browser conversation and one ledger writer, deliberately serial. */
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { isIP } from "node:net";
import { extname, join, resolve } from "node:path";

import { createFlueClient, type AgentSendResult } from "@flue/sdk";
import { chromium } from "@playwright/test";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../conversation/identity.ts";
import {
  instrumentManifest,
  verifyManifest,
} from "./real-provider-a5/manifest.ts";
import { attestNativeResponse } from "./real-provider-a5/native-response.ts";
import { assertExternalDenied } from "./real-provider-a5/network-guard.ts";
import {
  acquireWriter,
  credentialsAvailable,
  endpoint,
  modelId,
  readLedger,
  repairBudget,
  reservationReady,
  selectedModel,
  sha256,
} from "./real-provider-a5/preflight.ts";
import { pinnedNativeRequest } from "./real-provider-a5/transport.ts";
import { loadBuiltBrunchApplication } from "./runbook/load-built-application.ts";

const [mode, outputArgument, activationPath] = process.argv.slice(2);
assert(
  mode === "preflight" || mode === "dry" || mode === "real",
  "Explicit mode required: preflight | dry | real",
);
assert(outputArgument, "Fresh absolute evidence output directory required");
await assertExternalDenied();
const output = resolve(outputArgument);
assert.equal(output, outputArgument);
mkdirSync(output, { mode: 0o700 });
const save = (name: string, value: unknown) =>
  writeFileSync(join(output, name), `${JSON.stringify(value, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
const scenario = JSON.parse(
  readFileSync(
    new URL("./real-provider-a5/scenario.json", import.meta.url),
    "utf8",
  ),
) as { messages: string[] };
selectedModel();
if (mode === "preflight") {
  const manifest = instrumentManifest();
  save("manifest.json", manifest);
  save("preflight.json", {
    credentialsAvailable: await credentialsAvailable(),
    credentialValidity: "Not probed; no provider invocation",
    model: manifest.bounds,
    manifestSha256: sha256(readFileSync(join(output, "manifest.json"))),
    activation:
      "NOT ACTIVE: parent must supply authoritative ledger, named reservation, sole-writer delegation, manifest hash and concrete egress decision",
  });
  process.stdout.write(`Read-only preflight: ${output}\n`);
} else {
  type Activation = {
    runId: string;
    ledgerPath: string;
    manifestPath: string;
    manifestSha256: string;
    providerIp: string;
    singleWriter: true;
    egressDecision: string;
    egressPolicy: "os-tcp443+pinned-native-tls+loopback-browser-v1";
  };
  let activation: Activation;
  if (mode === "dry") {
    // A distinct explicit process mode. Never a credential-missing fallback.
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_OAUTH_TOKEN;
    process.env.ANTHROPIC_API_KEY = "TEST-synthetic-transport-not-a-credential";
    process.env.BRUNCH_CHAT_MODEL = modelId;
    activation = {
      runId: "TEST-a5-driver",
      ledgerPath: join(output, "TEST-usage-ledger.json"),
      manifestPath: "",
      manifestSha256: "",
      providerIp: "",
      singleWriter: true,
      egressDecision: "TEST loopback only",
      egressPolicy: "os-tcp443+pinned-native-tls+loopback-browser-v1",
    };
    save("TEST-usage-ledger.json", {
      authority: "TEST INPUT/OUTPUT ONLY, not a paid authority",
      limits: { calls: 200, usd: 100 },
      reservation: {
        runId: activation.runId,
        status: "active",
        calls: 20,
        usd: 15,
        perCall: { maxOutputTokens: 4096, reservedUsd: 7 },
      },
      calls: [],
      totals: {
        spentCalls: 0,
        spentUsd: 0,
        remainingCalls: 200,
        remainingUsd: 100,
        outstandingReservedCalls: 0,
        outstandingReservedUsd: 0,
      },
    });
    writeFileSync(
      join(output, "attempt-ledger.md"),
      "# TEST synthetic transport attempts\n",
      { flag: "wx" },
    );
  } else {
    assert(activationPath, "Explicit parent activation file required");
    activation = JSON.parse(readFileSync(activationPath, "utf8")) as Activation;
    assert.equal(activation.singleWriter, true);
    assert.equal(
      activation.egressPolicy,
      "os-tcp443+pinned-native-tls+loopback-browser-v1",
      "Parent must explicitly accept the OS port-only plus pinned-native transport boundary",
    );
    assert(
      isIP(activation.providerIp),
      "Parent must provide a reviewed concrete provider IP",
    );
    assert(
      activation.egressDecision.trim(),
      "Parent concrete egress decision required",
    );
    assert.equal(
      process.env.BRUNCH_CHAT_MODEL,
      modelId,
      "Never use default Haiku",
    );
    assert(
      !activation.ledgerPath.startsWith(`${process.cwd()}/`),
      "This lane's cloned ledger is not the shared paid authority",
    );
    save(
      "verified-manifest.json",
      verifyManifest(activation.manifestPath, activation.manifestSha256),
    );
    save("activation-observation.json", {
      runId: activation.runId,
      ledgerPath: activation.ledgerPath,
      manifestSha256: activation.manifestSha256,
      providerIp: activation.providerIp,
      egressPolicy: activation.egressPolicy,
      egressDecision: activation.egressDecision,
      singleWriter: activation.singleWriter,
    });
    assert(
      await credentialsAvailable(),
      "Technical prerequisite: configured provider credentials unavailable; no validity request made",
    );
  }
  activation.ledgerPath = realpathSync(activation.ledgerPath);
  if (mode === "real")
    assert(
      !activation.ledgerPath.startsWith(`${process.cwd()}/`),
      "Cloned ledger refused after canonical resolution",
    );
  const initialLedger = reservationReady(
    activation.ledgerPath,
    activation.runId,
  );
  // Supplement, not replace, the integration owner's global single-writer lease.
  // Stale locks block; this driver never clears a prior writer's lock.
  const releaseWriter = acquireWriter(activation.ledgerPath, activation.runId);
  process.env.HASH_OTLP_ENDPOINT = "";
  process.env.BRUNCH_DEV_DB_PATH = join(output, "conversation.db");
  process.env.BRUNCH_STEP_A_ACCOUNTING = JSON.stringify({
    ledgerPath: activation.ledgerPath,
    runId: activation.runId,
  });
  assert(
    !process.env.BRUNCH_TEST_KEEP_RECENT_TOKENS,
    "Do not silently alter compaction for the frozen run",
  );
  const budget = repairBudget();
  const dispatched = new Set<number>();
  let stopped = false;
  let origin = "";
  const actualFetch = globalThis.fetch;
  const dryTransport =
    mode === "dry"
      ? (
          await import("./real-provider-a5/synthetic-transport.ts")
        ).syntheticTransport()
      : undefined;
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (origin && new URL(url).origin === origin)
      return actualFetch(input, init);
    assert.equal(url, endpoint, "Unexpected evaluation egress refused");
    assert(!stopped, "Driver stopped; no further provider requests");
    budget.check();
    assert(init && typeof init.body === "string");
    const body = init.body as string;
    const payload: unknown = JSON.parse(body);
    budget.observe(payload);
    budget.check();
    const ledger = readLedger(activation.ledgerPath);
    const row = ledger.calls.at(-1);
    assert(
      row &&
        row.runId === activation.runId &&
        row.status === "unknown" &&
        row.transport === "started" &&
        !row.journalPending,
      "Existing production accounting must precede dispatch",
    );
    assert(!dispatched.has(row.sequence), "SDK retry refused");
    assert.equal(
      new Headers(init.headers).get("x-stainless-retry-count") ?? "0",
      "0",
    );
    dispatched.add(row.sequence);
    // Request BODY only. Never headers, credentials, environment or SDK options.
    writeFileSync(join(output, `native-${row.sequence}-request.json`), body, {
      flag: "wx",
      mode: 0o600,
    });
    try {
      if (dryTransport) {
        const response = dryTransport(input, init);
        attestNativeResponse(Buffer.from(await response.clone().arrayBuffer()));
        return response;
      }
      return await pinnedNativeRequest(
        input,
        init,
        activation.providerIp,
        ({ status, body: responseBody, latencyMs }) => {
          writeFileSync(
            join(output, `native-${row.sequence}-response.sse`),
            responseBody,
            { flag: "wx", mode: 0o600 },
          );
          let attestation: ReturnType<typeof attestNativeResponse> | undefined;
          if (status === 200) {
            try {
              attestation = attestNativeResponse(responseBody);
            } catch {
              stopped = true;
            }
          } else stopped = true;
          save(`native-${row.sequence}-transport.json`, {
            status,
            latencyMs,
            requestedModel: modelId,
            reportedModels: attestation ? [attestation.reportedModel] : [],
            nativeAttestation: attestation,
            stopped,
            responseBytes: responseBody.length,
          });
          // Normalized Pi identity/usage do not attest native identity or final
          // usage presence. Retain the raw evidence, then refuse ambiguous settlement.
          if (status === 200)
            assert(
              !stopped,
              "Native identity/terminal usage evidence failed; keep unknown accounting",
            );
        },
      );
    } catch {
      stopped = true;
      throw new Error(
        "Native transport failed; preserve accounting and stop, no retry or guessed settlement",
      );
    }
  };
  let application:
    | Awaited<ReturnType<typeof loadBuiltBrunchApplication>>
    | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let client: ReturnType<typeof createFlueClient> | undefined;
  const errors: string[] = [];
  const blockedOrigins: string[] = [];
  const deliveries: { path: string; body: string }[] = [];
  const website = resolve("apps/petrinaut-website/dist");
  const server = createServer((incoming, outgoing) => {
    void (async () => {
      const abort = new AbortController();
      outgoing.on("close", () => abort.abort());
      try {
        assert.equal(incoming.headers.host, new URL(origin).host);
        const url = new URL(incoming.url ?? "/", origin);
        let response: Response;
        if (url.pathname.startsWith("/agents/")) {
          const chunks: Buffer[] = [];
          for await (const chunk of incoming)
            chunks.push(Buffer.from(chunk as Uint8Array));
          const body = Buffer.concat(chunks).toString();
          if (body) {
            deliveries.push({ path: url.pathname, body });
            // Signals carry a JSON-encoded body. Inspect only; never rewrite it.
            const inspect = (value: unknown): void => {
              budget.observe(value);
              if (Array.isArray(value)) value.forEach(inspect);
              else if (value && typeof value === "object")
                for (const child of Object.values(value)) inspect(child);
              else if (typeof value === "string" && /^[[{]/u.test(value)) {
                try {
                  budget.observe(JSON.parse(value));
                } catch {
                  /* not a JSON signal */
                }
              }
            };
            inspect(JSON.parse(body));
          }
          const headers = new Headers();
          for (const [key, value] of Object.entries(incoming.headers))
            if (value !== undefined)
              headers.set(key, Array.isArray(value) ? value.join(",") : value);
          assert(application);
          response = await application.fetch(
            new Request(url, {
              method: incoming.method,
              headers,
              signal: abort.signal,
              ...(body ? { body } : {}),
            }),
          );
        } else if (url.pathname.startsWith("/api/")) {
          assert(application);
          response = await application.fetch(
            new Request(url, { method: incoming.method, signal: abort.signal }),
          );
        } else {
          const file = resolve(
            website,
            `.${url.pathname === "/" ? "/index.html" : url.pathname}`,
          );
          assert(file.startsWith(`${website}/`));
          const types: Record<string, string> = {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".svg": "image/svg+xml",
            ".json": "application/json",
            ".wasm": "application/wasm",
          };
          response = new Response(readFileSync(file), {
            headers: {
              "content-type":
                types[extname(file)] ?? "application/octet-stream",
            },
          });
        }
        outgoing.writeHead(
          response.status,
          Object.fromEntries(response.headers),
        );
        if (response.body) {
          const reader = response.body.getReader();
          try {
            while (!abort.signal.aborted) {
              const next = await reader.read();
              if (next.done) break;
              if (!outgoing.write(next.value)) await once(outgoing, "drain");
            }
          } finally {
            await reader.cancel();
          }
        }
        outgoing.end();
      } catch {
        if (!abort.signal.aborted) {
          errors.push(
            `Listener request failed: ${new URL(incoming.url ?? "/", origin).pathname}`,
          );
          outgoing.writeHead(500).end("Evaluation request failed");
        }
      }
    })();
  });
  try {
    application = await loadBuiltBrunchApplication();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address !== "string");
    origin = `http://127.0.0.1:${address.port}`;
    // Chrome receives no provider credentials and a strictly narrower OS sandbox.
    browser = await chromium.launch({
      executablePath: resolve(
        "apps/brunch-agent/src/evaluations/real-provider-a5/chrome-loopback.sh",
      ),
      headless: true,
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: process.env.HOME ?? "/tmp",
        TMPDIR: process.env.TMPDIR ?? "/tmp",
      },
    });
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1100 },
      serviceWorkers: "block",
    });
    await context.route("**/*", (route) => {
      const target = new URL(route.request().url()).origin;
      if (target === origin) return route.continue();
      blockedOrigins.push(target);
      return route.abort();
    });
    await context.routeWebSocket("**/*", (socket) => socket.close());
    const page = await context.newPage();
    page.on("pageerror", () => errors.push("Browser page error"));
    await page.goto(origin);
    await page.getByRole("button", { name: "Skip tour" }).click();
    const preparationResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().startsWith(`${origin}/agents/chat/`),
    );
    await page
      .getByRole("link", {
        name: "Open the prepared root-arc mechanical tracer",
      })
      .click();
    const preparationReceipt = (await (
      await preparationResponse
    ).json()) as AgentSendResult;
    save("preparation-receipt.json", preparationReceipt);
    await page
      .getByText(
        "Bound conversation ready. Settle the workpiece before the arc.",
      )
      .waitFor({ timeout: 120_000 });
    const binding = await page.evaluate(() => {
      const documents = JSON.parse(
        localStorage.getItem("petrinaut-sdcpn") ?? "{}",
      ) as Record<
        string,
        { id: string; incarnationId?: string; sdcpn: unknown }
      >;
      const document = Object.values(documents).find((entry) =>
        entry.id.endsWith(":root-arc"),
      );
      const key = Object.keys(localStorage).find((entry) =>
        entry.includes("principal"),
      );
      if (!document?.incarnationId || !key)
        throw new Error("Prepared binding missing");
      const raw = localStorage.getItem(key) ?? "";
      return {
        document,
        principalKey: raw.startsWith('"') ? (JSON.parse(raw) as string) : raw,
      };
    });
    save("initial-browser-document.json", binding.document);
    const identity = {
      principalKey: binding.principalKey,
      conversationId: `prepared-root-arc:${binding.document.incarnationId}`,
    };
    client = createFlueClient({
      url: `${origin}/agents/chat/${flueConversationIdFrom(identity)}`,
      headers: agentOwnershipHeaders(identity),
    });
    await client.wait(preparationReceipt, {
      signal: AbortSignal.timeout(180_000),
    });
    await page
      .getByRole("button", { name: "Show AI assistant", exact: true })
      .click();
    // Existing SDK wait follows the original submissions; browser handles its own
    // causal client results through the real mounted result path.
    const browserOrigin = origin;
    for (const [index, message] of scenario.messages.entries()) {
      budget.check();
      assert(!stopped);
      reservationReady(activation.ledgerPath, activation.runId);
      await page.locator("textarea").fill(message);
      const admitted = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().startsWith(`${browserOrigin}/agents/chat/`) &&
          (response.request().postDataJSON() as { kind?: string }).kind ===
            "user",
      );
      await page.locator("textarea").press("Enter");
      const receipt = (await (await admitted).json()) as AgentSendResult;
      save(`user-${index}-receipt.json`, receipt);
      await client.wait(receipt, { signal: AbortSignal.timeout(180_000) });
      // Wait on product-visible settled input, not a canned assistant phrase.
      await page.waitForFunction(() => {
        const field = document.querySelector("textarea");
        return field && field.value === "";
      });
      await page
        .getByRole("button", { name: "Stop AI response", exact: true })
        .waitFor({ state: "hidden", timeout: 180_000 });
      const snapshot = await client.history();
      save(`history-${index}.json`, snapshot);
      assert(
        snapshot.settlements.every(
          (settlement) => settlement.outcome === "completed",
        ),
        "Failed submission: no automatic repair or retry",
      );
      await page.screenshot({
        path: join(output, `pane-${index}.png`),
        fullPage: true,
      });
    }
    const finalHistory = await client.history();
    save("final-history.json", finalHistory);
    if (mode === "dry") {
      assert(
        finalHistory.messages.some(
          (message) => message.signal?.tagName === "client-tool-result",
        ),
        "Dry driver must cross the actual browser result path",
      );
      assert(
        !finalHistory.messages.some((message) =>
          message.parts.some(
            (part) =>
              part.type === "dynamic-tool" && part.state === "output-error",
          ),
        ),
      );
    }
    save(
      "final-browser-document.json",
      await page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("petrinaut-sdcpn") ?? "{}",
          ) as unknown,
      ),
    );
  } finally {
    stopped = true;
    try {
      if (client) save("retained-history-on-exit.json", await client.history());
      const finalLedger = readLedger(activation.ledgerPath);
      save("accounting-observations.json", {
        authority:
          "Read-only evidence snapshot; authoritative shared ledger is not replaced",
        runId: activation.runId,
        calls: finalLedger.calls.filter(
          (call) => call.runId === activation.runId,
        ),
        totals: finalLedger.totals,
      });
    } finally {
      try {
        await browser?.close();
      } finally {
        try {
          await application?.stop();
        } finally {
          server.closeAllConnections();
          if (server.listening)
            await new Promise<void>((done) => server.close(() => done()));
          globalThis.fetch = actualFetch;
        }
      }
    }
    save("http-deliveries.json", deliveries);
    save("driver-result.json", {
      mode,
      runId: activation.runId,
      providerDispatches: dispatched.size,
      initialTotals: initialLedger.totals,
      finalTotals: readLedger(activation.ledgerPath).totals,
      rejectedOperations: budget.snapshot(),
      blockedOrigins,
      errors,
      verdict:
        "Unadjudicated: dry mechanics are not real-provider acceptance; real refusals/missing observations are not success",
    });
    releaseWriter();
  }
}
