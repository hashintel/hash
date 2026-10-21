/**
 * Writes one HTML file per page from the built server entry and the built
 * client shell: the page's markup goes where the client would mount, the
 * title and description into the head, and the client's own script tags
 * stay, so the browser hydrates and navigates from there.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import type { BundleManifest } from "../src/bundle/outputs";

/** What the server entry renders for one URL; mirrors `src/entry-server.tsx`. */
interface RenderedPage {
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
  const { render } = (await import(
    pathToFileURL(options.serverEntry).href
  )) as {
    render: (url: string) => Promise<RenderedPage>;
  };
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
  const written: string[] = [];
  for (const path of paths) {
    const page = await render(path);
    const html = template
      .replace("<!--page-title-->", escape(page.title))
      .replace("<!--page-description-->", escape(page.description))
      .replace("<!--app-html-->", page.html);
    const target = join(options.clientDirectory, fileFor(path));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, html);
    written.push(fileFor(path));
  }
  return written;
};
