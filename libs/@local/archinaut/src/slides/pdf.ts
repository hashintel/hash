/**
 * `archinaut build --pdf`: every deck's print route, served from the built
 * site and printed by a headless Chromium, to `<out>/slides/<deck>.pdf`.
 * Playwright is loaded only here, so the other commands never need it.
 */

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize } from "node:path";

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".md": "text/markdown; charset=utf-8",
};

/** The file a URL path names under clean URLs: `/a/b` is `a/b.html`, `/` is `index.html`. */
const fileFor = (root: string, pathname: string): string | null => {
  const path = normalize(decodeURIComponent(pathname)).replace(
    /^(\.\.[/\\])+/u,
    "",
  );
  const candidates =
    path === "/"
      ? ["index.html"]
      : [path, `${path}.html`, join(path, "index.html")];
  for (const candidate of candidates) {
    const file = join(root, candidate);
    if (existsSync(file) && statSync(file).isFile()) {
      return file;
    }
  }
  return null;
};

const serveStatic = (
  root: string,
): Promise<{ server: Server; origin: string }> =>
  new Promise((done) => {
    const server = createServer((request, response) => {
      const file = fileFor(
        root,
        new URL(request.url ?? "/", "http://x").pathname,
      );
      if (file === null) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        "content-type":
          contentTypes[extname(file)] ?? "application/octet-stream",
      });
      createReadStream(file).pipe(response);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port =
        typeof address === "object" && address !== null ? address.port : 0;
      done({ server, origin: `http://127.0.0.1:${port}` });
    });
  });

export const exportDeckPdfs = async (options: {
  /** The built site. */
  outDir: string;
  deckIds: string[];
}): Promise<string[]> => {
  if (options.deckIds.length === 0) {
    return [];
  }
  const { chromium } = await import("playwright").catch(() => {
    throw new Error("`--pdf` needs the `playwright` package and its Chromium");
  });
  const { server, origin } = await serveStatic(options.outDir);
  const browser = await chromium.launch();
  try {
    const written: string[] = [];
    for (const id of options.deckIds) {
      const page = await browser.newPage({
        viewport: { width: 1600, height: 1400 },
      });
      await page.goto(`${origin}/slides/${id}/print`, {
        waitUntil: "networkidle",
      });
      await page.waitForSelector(".deck-print__page");
      // A string, since this module is typed for Node and the page is a browser.
      await page.evaluate("document.fonts.ready");
      const path = join(options.outDir, "slides", `${id}.pdf`);
      await page.pdf({ path, preferCSSPageSize: true, printBackground: true });
      await page.close();
      written.push(path);
    }
    return written;
  } finally {
    await browser.close();
    server.close();
  }
};
