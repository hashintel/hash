/**
 * The website: a Vite and React project shipped with the tool under `site/`.
 * The bundle and the instance's identity are written into it, then Vite
 * builds it and every page is prerendered to its own HTML file, or the dev
 * server serves it.
 */

import { cp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { listFiles, syncDirectory } from "./shared/sync-directory";
import { checkBuiltCss } from "./site/check-built-css";

import type { BundleManifest } from "./bundle/outputs";
import type { ArchinautConfig } from "./config";

export const siteRoot = fileURLToPath(new URL("../site", import.meta.url));

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
    ["search.json", await readFile(join(bundleRoot, "search.json"), "utf8")],
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
  const { build } = await import("vite");
  const configFile = join(siteRoot, "vite.config.ts");
  const clientDirectory = join(siteRoot, "dist/client");
  const serverDirectory = join(siteRoot, "dist/server");
  // The client and the server bundles share nothing but sources, so they
  // build side by side.
  await Promise.all([
    build({
      configFile,
      root: siteRoot,
      logLevel: "warn",
      build: { outDir: clientDirectory, emptyOutDir: true },
    }),
    build({
      configFile,
      root: siteRoot,
      logLevel: "warn",
      build: {
        ssr: "src/entry-server.tsx",
        outDir: serverDirectory,
        emptyOutDir: true,
      },
    }),
  ]);
  const { prerender } = await import("../site/prerender");
  await prerender({
    clientDirectory,
    serverEntry: join(serverDirectory, "entry-server.js"),
    manifest: JSON.parse(
      await readFile(join(options.bundleRoot, "manifest.json"), "utf8"),
    ) as BundleManifest,
  });
  const failures = await checkBuiltCss(clientDirectory);
  if (failures.length > 0) {
    throw new Error(`built CSS check failed:\n  ${failures.join("\n  ")}`);
  }
  if (options.outDir !== clientDirectory) {
    await rm(options.outDir, { recursive: true, force: true });
    await cp(clientDirectory, options.outDir, { recursive: true });
  }
};

export interface SiteServer {
  /**
   * Compiles the shell and the front page before a browser asks for them.
   * Vite transforms on the main thread, so this waits until the first build
   * is done rather than competing with it.
   */
  warm: () => Promise<void>;
  stop: () => Promise<void>;
}

export const serveSite = async (options: {
  config: ArchinautConfig;
  bundleRoot: string;
  port: number;
}): Promise<SiteServer> => {
  await syncSite(options.config, options.bundleRoot);
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: join(siteRoot, "vite.config.ts"),
    root: siteRoot,
    logLevel: "warn",
    appType: "spa",
    server: { port: options.port, strictPort: true },
  });
  await server.listen();
  return {
    warm: async () => {
      await Promise.all(
        ["/src/main.tsx", "/src/content/docs/index.mdx"].map((url) =>
          server.warmupRequest(url),
        ),
      );
    },
    stop: () => server.close(),
  };
};
