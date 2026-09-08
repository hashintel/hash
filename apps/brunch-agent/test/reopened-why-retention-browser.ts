/** Focused actual-Chrome seed. The ephemeral HTTP adapter follows transition-records.integration.ts; no new product route. */
/* eslint-disable no-await-in-loop -- HTTP request/response streams preserve byte order. */
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";

import {
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";
import { chromium } from "@playwright/test";

import { verifyArcTransitionAttempt } from "@hashintel/brunch-agent-plugin-sdcpn";
import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";

import type { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";
import type { Context, FauxProviderHandle } from "@earendil-works/pi-ai";
import type { ArcTransitionAttempt } from "@hashintel/brunch-agent-plugin-sdcpn";
import type { WorkpieceRevision } from "@hashintel/brunch-agent/workpiece";

export const retentionQuote =
  "When final inspection starts, reserve one available crew until sign-off.";
export const retentionSource = `TEST synthetic original testimony control: ${retentionQuote}`;
export const retentionMarkdown = `# TEST retention workpiece\n\n${retentionQuote}\n\nTiming remains unknown. Not genuine testimony.`;
export const retentionQuery = {
  transition: "Start final inspection",
  place: "Dispatch crew available",
  arcDirection: "input",
  field: "entity",
};
export const retentionCall = (
  name: string,
  args: Record<string, unknown>,
  id: string,
) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });
export const retentionOutput = (
  context: Context,
  name: string,
): Record<string, unknown> => {
  const result = context.messages.findLast(
    (message) => message.role === "toolResult" && message.toolName === name,
  );
  assert(result?.role === "toolResult");
  assert.equal(result.isError, false);
  return JSON.parse(
    result.content
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join(""),
  ) as Record<string, unknown>;
};
export const seedRetentionBrowser = async (options: {
  application: Awaited<ReturnType<typeof loadBuiltBrunchApplication>>;
  faux: FauxProviderHandle;
  directory: string;
}) => {
  const { application, faux, directory } = options;
  const save = (name: string, data: unknown) =>
    writeFileSync(
      join(directory, `${name}.json`),
      JSON.stringify(data, null, 2),
    );
  const website = resolve("../petrinaut-website/dist");
  const httpErrors: string[] = [];
  const deliveries: { path: string; body: string }[] = [];
  const server = createServer((incoming, outgoing) => {
    const abort = new AbortController();
    outgoing.on("close", () => abort.abort());
    void (async () => {
      const url = new URL(
        incoming.url ?? "/",
        `http://${incoming.headers.host}`,
      );
      let response: Response;
      if (url.pathname.startsWith("/agents/")) {
        const chunks: Buffer[] = [];
        for await (const chunk of incoming) {
          const bytes: unknown = chunk;
          assert(bytes instanceof Uint8Array);
          chunks.push(Buffer.from(bytes));
        }
        const body = Buffer.concat(chunks).toString("utf8");
        if (body) deliveries.push({ path: url.pathname, body });
        const headers = new Headers();
        for (const [key, value] of Object.entries(incoming.headers))
          if (value !== undefined)
            headers.set(key, Array.isArray(value) ? value.join(",") : value);
        response = await application.fetch(
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
    })().catch((error: unknown) => {
      if (!abort.signal.aborted) {
        httpErrors.push(String(error));
        outgoing.writeHead(500).end(String(error));
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  // Keep the actual profile in its original location; never restore storageState JSON.
  const browser = await chromium.launchPersistentContext(
    join(directory, "chrome-profile"),
    {
      executablePath:
        process.env.M7_CHROME_PATH ??
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
      viewport: { width: 1600, height: 1100 },
    },
  );
  const blocked: string[] = [];
  const errors: string[] = [];
  await browser.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === origin)
      return route.continue();
    blocked.push(route.request().url());
    return route.abort();
  });
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  try {
    faux.setResponses([
      fauxAssistantMessage(
        "TEST prepared fixture acknowledged, not testimony.",
      ),
    ]);
    await page.goto(origin);
    await page.getByRole("button", { name: "Skip tour" }).click();
    await page
      .getByRole("link", {
        name: "Open the prepared root-arc mechanical tracer",
      })
      .click();
    await page
      .getByText(
        "Bound conversation ready. Settle the workpiece before the arc.",
      )
      .waitFor({ timeout: 30000 });
    const stored = await page.evaluate(() => {
      const documents = JSON.parse(
        localStorage.getItem("petrinaut-sdcpn") ?? "{}",
      ) as Record<
        string,
        {
          id: string;
          incarnationId?: string;
          rootArcRequestedBaseHash?: string;
          sdcpn: unknown;
        }
      >;
      const document = Object.values(documents).find((entry) =>
        entry.id.endsWith(":root-arc"),
      );
      const key = Object.keys(localStorage).find((entry) =>
        entry.includes("principal"),
      );
      if (
        !document?.incarnationId ||
        !document.rootArcRequestedBaseHash ||
        !key
      )
        throw new Error("Missing native binding");
      const raw = localStorage.getItem(key) ?? "";
      return {
        document,
        principalKey: raw.startsWith('"') ? (JSON.parse(raw) as string) : raw,
      };
    });
    const identity = {
      principalKey: stored.principalKey,
      conversationId: `prepared-root-arc:${stored.document.incarnationId}`,
    };
    const client = createFlueClient({
      url: `${origin}/agents/chat/${flueConversationIdFrom(identity)}`,
      headers: agentOwnershipHeaders(identity),
    });
    const skipTour = page.getByRole("button", { name: "Skip tour" });
    if (await skipTour.isVisible()) await skipTour.click();
    await page
      .getByRole("button", { name: "Show AI assistant", exact: true })
      .click();
    const send = async (body: string, expected: string) => {
      await page.locator("textarea").fill(body);
      await page.locator("textarea").press("Enter");
      await page
        .getByText(expected, { exact: true })
        .waitFor({ timeout: 30000 });
    };
    let sourceId = "";
    let locator: { start: number; end: number } | undefined;
    let governing: WorkpieceRevision | undefined;
    let verifiedReadCount = 0;
    faux.setResponses([
      retentionCall(
        "brunch_workpiece",
        { markdown: retentionMarkdown, locateTexts: [retentionQuote] },
        "retention-discover",
      ),
      (context) => {
        const output = retentionOutput(context, "brunch_workpiece");
        const source = (output.sources as { id: string; text: string }[]).find(
          (entry) => entry.text === retentionSource,
        );
        assert(source);
        sourceId = source.id;
        const lookup = output.locatorLookup as {
          subject: { kind: string };
          queries: { occurrences: { start: number; end: number }[] }[];
        };
        assert.equal(lookup.subject.kind, "unsettled-candidate");
        assert.equal(output.currentWorkpiece, null);
        assert.equal(lookup.queries[0]?.occurrences.length, 1);
        locator = lookup.queries[0].occurrences[0];
        assert(locator);
        verifiedReadCount++;
        return retentionCall(
          "update_workpiece",
          {
            markdown: retentionMarkdown,
            evidence: [
              { locator, messageIds: [sourceId], kind: "elicited" },
              { locator, messageIds: [], kind: "formalism-constraint" },
            ],
          },
          "retention-revision-1",
        );
      },
      retentionCall(
        "update_workpiece",
        { markdown: `${retentionMarkdown}\n\nUnrelated appended context.` },
        "retention-revision-2",
      ),
      retentionCall(
        "brunch_workpiece",
        { locateTexts: [retentionQuote] },
        "retention-settled-locator",
      ),
      (context) => {
        const output = retentionOutput(context, "brunch_workpiece");
        governing = output.currentWorkpiece as WorkpieceRevision;
        assert.equal(governing.revisionId, "retention-revision-2");
        assert.equal(governing.evidenceValidated, true);
        const lookup = output.locatorLookup as {
          subject: { revisionId: string };
          sha256: string;
          queries: { occurrences: { start: number; end: number }[] }[];
        };
        assert.equal(lookup.subject.revisionId, governing.revisionId);
        assert.equal(lookup.sha256, governing.sha256);
        assert.deepEqual(lookup.queries[0]?.occurrences, [locator]);
        locator = lookup.queries[0].occurrences[0];
        assert.deepEqual(governing.evidence, [
          { locator, messageIds: [sourceId], kind: "elicited" },
          { locator, messageIds: [], kind: "formalism-constraint" },
        ]);
        verifiedReadCount++;
        return fauxAssistantMessage(
          "TEST two overlapping relations carried and settled.",
        );
      },
    ]);
    await send(
      retentionSource,
      "TEST two overlapping relations carried and settled.",
    );
    assert.equal(
      verifiedReadCount,
      2,
      "Factory failures cannot masquerade as completion",
    );
    assert(governing && locator && sourceId);
    faux.setResponses([
      retentionCall("getLatestNetDefinition", {}, "retention-before-read"),
      retentionCall(
        "addArc",
        {
          transitionId: "start-final-inspection",
          placeId: "dispatch-crew-available",
          arcDirection: "input",
          weight: "1",
          type: "standard",
          brunch: {
            requestedBaseHash: stored.document.rootArcRequestedBaseHash,
            basis: {
              kind: "declared",
              revisionId: governing.revisionId,
              sha256: governing.sha256,
              scope: "operation",
              locators: [locator],
              rationale:
                "TEST operation-level declaration, not relevance or utility acceptance.",
            },
          },
        },
        "retention-arc",
      ),
      fauxAssistantMessage("TEST actual browser arc completed once."),
    ]);
    await send(
      "TEST construct the single root arc from the carried revision.",
      "TEST actual browser arc completed once.",
    );
    const mutationHistory = await client.history();
    const result = clientToolHistoryFrom(mutationHistory.messages).results.find(
      (entry) => entry.toolCallId === "retention-arc",
    );
    assert(result);
    const attempt = (
      result.metadata as {
        transitionRecord: { attempts: ArcTransitionAttempt[] };
      }
    ).transitionRecord.attempts[0];
    assert(attempt);
    await verifyArcTransitionAttempt(attempt);
    assert.equal(attempt.outcome, "applied");
    assert.equal(attempt.effects.created.length, 1);
    save("browser-record", result);
    save("canonical-pre", attempt.pre);
    save("canonical-post", attempt.post);
    faux.setResponses([
      retentionCall(
        "update_workpiece",
        {
          markdown: `${governing.markdown}\n\nLater unrelated context; no retroactive basis.`,
        },
        "retention-revision-3",
      ),
      retentionCall("getLatestNetDefinition", {}, "retention-live-read"),
      retentionCall(
        "brunch_why",
        { ...retentionQuery, observationToolCallId: "retention-live-read" },
        "retention-live-why",
      ),
      fauxAssistantMessage([
        fauxText("TEST live structured answer available; utility unassessed."),
      ]),
    ]);
    await send(
      "TEST preserve the old governing revision, then observe and explain the arc.",
      "TEST live structured answer available; utility unassessed.",
    );
    const history = await client.history();
    const why = history.messages
      .flatMap((message) => message.parts)
      .find(
        (part) =>
          part.type === "dynamic-tool" &&
          part.toolCallId === "retention-live-why",
      );
    assert(why?.type === "dynamic-tool" && why.state === "output-available");
    assert.deepEqual(
      JSON.parse(await page.getByTestId("brunch-why-output").innerText()),
      why.output,
    );
    save("browser-dom", await page.locator("body").innerText());
    await page.screenshot({
      path: join(directory, "browser-why.png"),
      fullPage: true,
    });
    save("seed", {
      pid: process.pid,
      origin,
      identity,
      sourceId,
      locator,
      governing,
      binding: attempt.binding,
      dbPath: process.env.BRUNCH_DEV_DB_PATH,
      browserUrl: page.url(),
    });
    save("create-history", history);
    assert.deepEqual(blocked, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(httpErrors, []);
  } catch (error) {
    save("browser-failure", {
      error: String(error),
      dom: await page.locator("body").innerText(),
    });
    await page.screenshot({
      path: join(directory, "browser-failure.png"),
      fullPage: true,
    });
    throw error;
  } finally {
    save("browser-observations", {
      pid: process.pid,
      blocked,
      errors,
      httpErrors,
      deliveries,
    });
    await browser.close();
    await new Promise<void>((resolveClose) =>
      server.close(() => resolveClose()),
    );
  }
};
