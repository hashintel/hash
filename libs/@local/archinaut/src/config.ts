/**
 * The config file an instance provides: which packages participate, the
 * layer-crossing rules, and where content, output and cache live. The layer
 * taxonomy itself lives in the packages, as annotations.
 */

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { tsImport } from "tsx/esm/api";

import type { ArchitecturePackageInput, Audience, LayerRule } from "./model";

export interface ArchinautConfig {
  /** Absolute path of the file this config was loaded from. */
  configFile: string;
  /** Absolute repository root every repo-relative path is read against. */
  root: string;
  packages: ArchitecturePackageInput[];
  rules: LayerRule[];
  ignoredDirectories: string[];
  ignoredFilePattern: RegExp;
  /** Hand-written MDX, repo-relative. */
  contentDirectory: string;
  /** Where the bundle is written, repo-relative. */
  outputDirectory: string;
  /** Where facts, rendered diagrams and diff bases are cached; absolute once loaded. */
  cacheDirectory: string;
  /** Base URL for source links in generated pages, including the git ref. */
  sourceUrlPrefix: string;
  /** The domains layers may carry; an unknown `@tags` value is a warning. */
  tags: { id: string; description: string }[];
  /** Parties outside the codebase that take part in interfaces. */
  externals: ExternalConfig[];
  site: SiteConfig;
}

export interface ExternalConfig {
  /** `external:` plus kebab-case. */
  id: string;
  name: string;
  summary: string;
  tags: string[];
  audience: Audience[];
  participates: {
    interface: string;
    role: "provides" | "consumes" | "implements";
  }[];
}

/** What the website shows about the instance; everything else comes from the bundle. */
export interface SiteConfig {
  title: string;
  description: string;
  /** The canonical URL, for sitemaps and absolute links. */
  url: string;
  /** Repo-relative PNG shown beside the title. */
  logo: string;
  /** Repo-relative favicon. */
  favicon: string;
}

/** What a config file default-exports; the loader adds where it came from. */
export const defineConfig = (
  config: Omit<ArchinautConfig, "configFile">,
): Omit<ArchinautConfig, "configFile"> => config;

export const loadConfig = async (
  configPath: string,
): Promise<ArchinautConfig> => {
  const url = pathToFileURL(resolve(configPath)).href;
  const loaded = (await tsImport(url, import.meta.url)) as {
    default?: Omit<ArchinautConfig, "configFile">;
  };
  if (loaded.default === undefined) {
    throw new Error(`${configPath} must default-export defineConfig(...)`);
  }
  const config = loaded.default;
  // A CI whose persisted cache location differs sets the variable rather
  // than the code guessing its layout.
  const override = process.env.ARCHINAUT_CACHE_DIR?.trim();
  return {
    ...config,
    configFile: resolve(configPath),
    cacheDirectory: resolve(config.root, override || config.cacheDirectory),
  };
};
