/**
 * The website: an Astro and Starlight project shipped with the tool under
 * `site/`. The bundle and the instance's identity are written into it, then
 * Astro builds or serves it.
 */

import { cp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { listFiles, syncDirectory } from "./shared/sync-directory";
import { checkBuiltCss } from "./site/check-built-css";

import type { ArchinautConfig } from "./config";

export const siteRoot = fileURLToPath(new URL("../site", import.meta.url));

/**
 * Runs Astro from the site tree. Astro resolves its cache and the prerender
 * step's imports against the working directory, and the site's dependencies
 * are installed under `site/`, not wherever the command was started.
 */
const inSiteTree = async <T>(work: () => Promise<T>): Promise<T> => {
  const previous = process.cwd();
  process.chdir(siteRoot);
  try {
    return await work();
  } finally {
    process.chdir(previous);
  }
};

/** Bundle directory → where it lands under the site. */
const contentMapping = {
  pages: "src/content/docs",
  diagrams: "src/content/diagrams",
  components: "src/content/components",
} as const;

/** The named files under `root`, skipping any that no longer exist. */
const readSome = async (
  root: string,
  paths: string[],
): Promise<Map<string, string>> => {
  const files = new Map<string, string>();
  for (const path of paths) {
    const contents = await readFile(join(root, path), "utf8").catch(() => null);
    if (contents !== null) {
      files.set(path, contents);
    }
  }
  return files;
};

const readTree = async (root: string): Promise<Map<string, string>> => {
  const files = new Map<string, string>();
  for (const path of await listFiles(root)) {
    files.set(path, await readFile(join(root, path), "utf8"));
  }
  return files;
};

/**
 * Brings the site's inputs up to date with the bundle. With `changed`, only
 * those bundle paths are copied or, when the bundle no longer has them,
 * removed, which is what a dev rebuild knows; without it every directory is
 * compared, which is what the first run needs.
 */
export const syncSite = async (
  config: ArchinautConfig,
  bundleRoot: string,
  changed?: string[],
): Promise<string[]> => {
  const written: string[] = [];
  for (const [source, target] of Object.entries(contentMapping)) {
    const prefix = `${source}/`;
    const named = new Set(
      changed
        ?.filter((path) => path.startsWith(prefix))
        .map((path) => path.slice(prefix.length)),
    );
    const files =
      changed === undefined
        ? await readTree(join(bundleRoot, source))
        : await readSome(join(bundleRoot, source), [...named]);
    const summary = await syncDirectory(join(siteRoot, target), files, {
      // A partial sync prunes only the named paths the bundle lost.
      keep: (path) => changed !== undefined && !named.has(path),
    });
    written.push(...summary.written.map((path) => `${target}/${path}`));
  }
  const identity = new Map<string, string | Uint8Array>([
    [
      "manifest.json",
      await readFile(join(bundleRoot, "manifest.json"), "utf8"),
    ],
    [
      "site.json",
      `${JSON.stringify({ title: config.site.title, description: config.site.description, url: config.site.url })}\n`,
    ],
    ["logo.png", await readFile(join(config.root, config.site.logo))],
  ]);
  const content = await syncDirectory(join(siteRoot, "src/content"), identity, {
    keep: (path) =>
      path.startsWith("docs/") ||
      path.startsWith("diagrams/") ||
      path.startsWith("components/"),
  });
  written.push(...content.written.map((path) => `src/content/${path}`));
  const served = new Map<string, string | Uint8Array>([
    [
      "architecture.md",
      await readFile(join(bundleRoot, "architecture.md"), "utf8"),
    ],
    [
      "architecture.json",
      await readFile(join(bundleRoot, "architecture.json"), "utf8"),
    ],
    ["favicon.ico", await readFile(join(config.root, config.site.favicon))],
  ]);
  const publicSummary = await syncDirectory(join(siteRoot, "public"), served);
  written.push(...publicSummary.written.map((path) => `public/${path}`));
  return written;
};

export const buildSite = async (options: {
  config: ArchinautConfig;
  bundleRoot: string;
  /** Absolute output directory. */
  outDir: string;
}): Promise<void> => {
  await syncSite(options.config, options.bundleRoot);
  // Built inside the site tree: Astro's prerender step resolves the site's
  // dependencies relative to the output directory, and they are installed
  // here, not wherever the caller wants the result.
  const outDir = join(siteRoot, "dist");
  const { build } = await import("astro");
  await inSiteTree(() => build({ root: siteRoot, outDir, logLevel: "warn" }));
  const failures = await checkBuiltCss(outDir);
  if (failures.length > 0) {
    throw new Error(`built CSS check failed:\n  ${failures.join("\n  ")}`);
  }
  if (options.outDir !== outDir) {
    await rm(options.outDir, { recursive: true, force: true });
    await cp(outDir, options.outDir, { recursive: true });
  }
};

export interface SiteServer {
  stop: () => Promise<void>;
}

export const serveSite = async (options: {
  config: ArchinautConfig;
  bundleRoot: string;
  port: number;
}): Promise<SiteServer> => {
  await syncSite(options.config, options.bundleRoot);
  const { dev } = await import("astro");
  const server = await inSiteTree(() =>
    dev({ root: siteRoot, server: { port: options.port }, logLevel: "warn" }),
  );
  return { stop: () => server.stop() };
};
