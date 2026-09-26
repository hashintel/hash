/* oxlint-disable eslint/no-await-in-loop -- Stream reads and backpressure are necessarily sequential. */

/**
 * Shared process, HTTP, static and Chrome setup for the manual browser
 * witnesses. They drive the built website in the local macOS Chrome, so they
 * run by hand rather than in CI.
 */
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";
import { chromium, type Page } from "@playwright/test";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../src/conversation/identity.ts";
import { installFauxProvider } from "../../src/evaluations/install-faux-provider.ts";
import { nativeOpenaiProvider } from "../native-openai-provider.ts";

import type { BuiltBrunchApplication } from "../load-built-application.ts";

const websiteDist = resolve(
  import.meta.dirname,
  "../../../petrinaut-website/dist",
);

/** Test environment, a fresh SQLite file, no telemetry and no network beyond loopback. */
export const prepareWitnessProcess = (name: string) => {
  const output = mkdtempSync(join(tmpdir(), `${name}-`));
  process.env.NODE_ENV = "test";
  process.env.BRUNCH_DEV_DB_PATH = join(output, "conversation.db");
  delete process.env.BRUNCH_CHAT_MODEL;
  delete process.env.HASH_OTLP_ENDPOINT;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    assert.equal(
      new URL(input instanceof Request ? input.url : String(input)).hostname,
      "127.0.0.1",
    );
    return originalFetch(input, init);
  };
  return output;
};

/** Scripted responses behind native OpenAI Responses serialization and parsing. */
export const installFauxOpenai = () => {
  const faux = fauxProvider({ provider: "openai" });
  installFauxProvider(nativeOpenaiProvider(faux.provider, [], async () => {}));
  return faux;
};

/** OpenAI Responses tool calls carry `call_id|item_id`. */
export const openaiCallId = (id: string) => `call_${id}|fc_${id}`;

export const toolCall = (
  name: string,
  args: Record<string, unknown>,
  id: string,
) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id: openaiCallId(id) })], {
    stopReason: "toolUse",
  });

type BrowserBinding = {
  readonly conversationId: string;
  readonly documentId: string;
  readonly incarnationId: string;
};

type BrowserDelivery = {
  readonly kind?: string;
  readonly initialData?: {
    readonly mode?: string;
    readonly construction?: { readonly binding?: BrowserBinding };
  };
};

const closeServer = (server: Server) =>
  new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );

export const openBrowserFixture = async (app: BuiltBrunchApplication) => {
  const deliveries: { path: string; body: string }[] = [];
  const errors: string[] = [];
  const blocked: string[] = [];
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
          websiteDist,
          `.${url.pathname === "/" ? "/index.html" : url.pathname}`,
        );
        assert(file.startsWith(`${websiteDist}/`));
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
  let browser;
  try {
    browser = await chromium.launch({
      executablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
    });
  } catch (error) {
    await closeServer(server);
    throw error;
  }
  const launched = browser;

  /** A fresh browser context, so each case gets its own principal and storage. */
  const openPage = async () => {
    const page = await launched.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.route("**/*", (route) => {
      if (new URL(route.request().url()).origin === origin)
        return route.continue();
      blocked.push(route.request().url());
      return route.abort();
    });
    return page;
  };

  /** Loads the site with the given saved documents and opens the Brunch panel. */
  const openAssistant = async (
    path = "/",
    documents?: Record<string, unknown>,
  ) => {
    const page = await openPage();
    await page.addInitScript(
      (documentsJson: string | null) => {
        localStorage.setItem("petrinaut-website:assistant", "brunch");
        if (documentsJson !== null)
          localStorage.setItem("petrinaut-sdcpn", documentsJson);
      },
      documents === undefined ? null : JSON.stringify(documents),
    );
    await page.goto(`${origin}${path}`);
    await page.getByRole("button", { name: "Skip tour" }).click();
    await page
      .getByRole("button", { name: "Show AI assistant", exact: true })
      .click();
    return page;
  };

  /** Sends one prompt and waits for the reply; returns the first body it posted. */
  const ask = async (
    page: Page,
    prompt: string,
    reply: string,
    timeout: number,
  ) => {
    const start = deliveries.length;
    const composer = page.getByRole("textbox", {
      name: "Message AI assistant",
      exact: true,
    });
    await composer.fill(prompt);
    await composer.press("Enter");
    await page.getByText(reply, { exact: true }).waitFor({ timeout });
    return JSON.parse(deliveries[start]?.body ?? "null") as BrowserDelivery;
  };

  const principalOf = async (page: Page) => {
    const principalKey = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((entry) =>
        entry.includes("principal"),
      );
      const raw = key === undefined ? null : localStorage.getItem(key);
      return raw?.startsWith('"') ? (JSON.parse(raw) as string) : raw;
    });
    assert(principalKey, "Missing browser principal");
    return principalKey;
  };

  /** The Flue client for the conversation the delivery's binding names. */
  const conversationOf = async (page: Page, delivery: BrowserDelivery) => {
    const binding = delivery.initialData?.construction?.binding;
    assert(binding, "Missing browser conversation binding");
    const identity = {
      principalKey: await principalOf(page),
      conversationId: binding.conversationId,
    };
    const client = createFlueClient({
      url: `${origin}/agents/chat/${flueConversationIdFrom(identity)}`,
      headers: agentOwnershipHeaders(identity),
    });
    return { binding, client };
  };

  const storedDocument = <Document>(page: Page, documentId: string) =>
    page.evaluate(
      (id) =>
        (
          JSON.parse(localStorage.getItem("petrinaut-sdcpn") ?? "{}") as Record<
            string,
            unknown
          >
        )[id],
      documentId,
    ) as Promise<Document | undefined>;

  const close = async () => {
    try {
      await launched.close();
    } finally {
      await closeServer(server);
    }
  };

  return {
    origin,
    deliveries,
    errors,
    blocked,
    openAssistant,
    ask,
    conversationOf,
    storedDocument,
    close,
  };
};
