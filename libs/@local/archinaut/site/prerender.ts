/**
 * Writes one HTML file per page from the built server entry and the built
 * client shell: the page's markup goes where the client would mount, the
 * title and description into the head, and the client's own script tags
 * stay, so the browser hydrates and navigates from there. Rendering is
 * CPU-bound and one page never depends on another, so the pages are shared
 * out across worker threads, each holding the server entry once.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";

import { startWorker } from "../src/shared/worker-channel";

import type { BundleManifest } from "../src/bundle/outputs";

/**
 * What the server entry renders for one URL; mirrors `src/entry-server.tsx`,
 * which the Vite build owns and this Node-side file cannot import.
 */
export interface RenderedPage {
  html: string;
  title: string;
  description: string;
}

const escape = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** The file a URL path is served from, under `cleanUrls` without a trailing slash. */
const fileFor = (path: string): string =>
  path === "/" ? "index.html" : `${path.replace(/^\//u, "")}.html`;

export const prerender = async (options: {
  /** Absolute; holds the client build, with `index.html` as the template. */
  clientDirectory: string;
  /** Absolute path of the built server entry. */
  serverEntry: string;
  manifest: BundleManifest;
}): Promise<string[]> => {
  const template = await readFile(
    join(options.clientDirectory, "index.html"),
    "utf8",
  );
  const paths = [
    ...options.manifest.pages.map((page) =>
      page.slug === "index" ? "/" : `/${page.slug}`,
    ),
    "/404",
  ];
  const writePage = async (path: string, page: RenderedPage): Promise<void> => {
    // Function replacements, so a `$` sequence in a page stays literal.
    const html = template
      .replace("<!--page-title-->", () => escape(page.title))
      .replace("<!--page-description-->", () => escape(page.description))
      .replace("<!--app-html-->", () => page.html);
    const target = join(options.clientDirectory, fileFor(path));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, html);
  };

  const renderers = Array.from(
    { length: Math.min(availableParallelism(), paths.length) },
    () =>
      startWorker<string, RenderedPage>(
        new URL("./prerender/render-worker.ts", import.meta.url),
        { serverEntry: options.serverEntry },
      ),
  );
  let next = 0;
  try {
    await Promise.all(
      renderers.map(async (renderer) => {
        while (next < paths.length) {
          const path = paths[next];
          next += 1;
          if (path !== undefined) {
            await writePage(path, await renderer.call(path));
          }
        }
      }),
    );
  } finally {
    await Promise.all(renderers.map((renderer) => renderer.close()));
  }
  return paths.map(fileFor);
};
