/**
 * The pages, from the bundle's manifest: what each one is, where each is
 * served, and how a page's compiled module is loaded on demand.
 */

import manifestJson from "./content/manifest.json";
import { buildSidebarItems, type SidebarItem } from "./shell/sidebar/items";

import type { BundleManifest, ManifestPage } from "../../src/bundle/outputs";
import type { ComponentType } from "react";

export const manifest = manifestJson as BundleManifest;

/** A page's compiled module: the component, and nothing else, so an edit hot-swaps it. */
export interface PageModule {
  default: ComponentType<{ components?: Record<string, ComponentType> }>;
}

export interface LoadedPage {
  page: ManifestPage;
  Content: PageModule["default"];
}

const modules = import.meta.glob<PageModule>("./content/docs/**/*.mdx");

export const pagesBySlug = new Map(
  manifest.pages.map((page) => [page.slug, page]),
);

/** The URL path a slug is served at. */
export const hrefOf = (slug: string): string =>
  slug === "index" ? "/" : `/${slug}`;

/** The slug a URL path names; `/` is the index page. */
export const slugOf = (pathname: string): string => {
  const trimmed = pathname.replace(/^\/+|\/+$/gu, "");
  return trimmed === "" ? "index" : decodeURIComponent(trimmed);
};

export const loadPage = async (slug: string): Promise<LoadedPage | null> => {
  const page = pagesBySlug.get(slug);
  if (page === undefined) {
    return null;
  }
  const load = modules[`./content/docs/${page.path.slice("pages/".length)}`];
  if (load === undefined) {
    return null;
  }
  const module = await load();
  return { page, Content: module.default };
};

/** The sidebar tree over this manifest, with its diff statuses when it is a diff build. */
export const sidebarItems = (): SidebarItem[] =>
  buildSidebarItems(manifest.pages, manifest.diff?.pages ?? {});
