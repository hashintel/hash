/** Shared HTTP/static/Chrome setup for the root and persona browser witnesses. */
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";

import { chromium } from "@playwright/test";

import type { BuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";

export const openBrowserFixture = async (
  app: BuiltBrunchApplication,
  website: string,
) => {
  const deliveries: { path: string; body: string }[] = [];
  const errors: string[] = [];
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
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    page.on("pageerror", (error) => errors.push(String(error)));
    const blocked: string[] = [];
    await page.route("**/*", (route) => {
      if (new URL(route.request().url()).origin === origin)
        return route.continue();
      blocked.push(route.request().url());
      return route.abort();
    });
    return { server, browser, page, origin, deliveries, errors, blocked };
  } catch (error) {
    try {
      try {
        await browser?.close();
      } finally {
        await new Promise<void>((done, reject) =>
          server.close((closeError) =>
            closeError ? reject(closeError) : done(),
          ),
        );
      }
    } catch (closeError) {
      throw new AggregateError(
        [error, closeError],
        "Browser fixture setup failed; cleanup incomplete",
      );
    }
    throw error;
  }
};
