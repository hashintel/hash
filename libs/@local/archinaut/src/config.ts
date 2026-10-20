/**
 * The config file an instance provides: which packages participate, the
 * layer-crossing rules, and where content, output and cache live. The layer
 * taxonomy itself lives in the packages, as annotations.
 */

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { tsImport } from "tsx/esm/api";

import type { ArchitecturePackageInput, LayerRule } from "./model";

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
  /** Where facts and rendered diagrams are cached, repo-relative. */
  cacheDirectory: string;
  /** Base URL for source links in generated pages, including the git ref. */
  sourceUrlPrefix: string;
  site: SiteConfig;
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
  const override = process.env.ARCHINAUT_CACHE_DIR?.trim();
  return {
    ...loaded.default,
    configFile: resolve(configPath),
    // A CI whose persisted cache location differs sets the variable rather
    // than the code guessing its layout.
    ...(override ? { cacheDirectory: override } : {}),
  };
};
