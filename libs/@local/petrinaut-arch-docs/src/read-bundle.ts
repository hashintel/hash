/**
 * Reads a committed bundle from disk.
 *
 * This is the seam every renderer goes through — the Starlight site here, and
 * anything hash.dev writes on its side. Because it validates the manifest and
 * model versions up front, a bundle produced by a newer generator fails loudly
 * at load rather than rendering half-missing pages.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  BUNDLE_MANIFEST_VERSION,
  type BundleManifest,
} from "./emit/bundle-outputs";
import {
  ARCHITECTURE_MODEL_VERSION,
  architectureModelSchema,
  type ArchitectureModel,
} from "./model";

export interface LoadedPage {
  slug: string;
  title: string;
  description: string;
  kind: "generated" | "authored";
  order: number;
  depth: number;
  /** Raw MDX, frontmatter included. */
  contents: string;
}

export interface LoadedBundle {
  model: ArchitectureModel;
  manifest: BundleManifest;
  pages: LoadedPage[];
}

export const readBundle = async (bundleRoot: string): Promise<LoadedBundle> => {
  const manifest = JSON.parse(
    await readFile(join(bundleRoot, "manifest.json"), "utf8"),
  ) as BundleManifest;

  if (manifest.manifestVersion !== BUNDLE_MANIFEST_VERSION) {
    throw new Error(
      `architecture bundle at ${bundleRoot} has manifest version ${manifest.manifestVersion}, but this reader supports ${BUNDLE_MANIFEST_VERSION}`,
    );
  }

  if (manifest.modelVersion !== ARCHITECTURE_MODEL_VERSION) {
    throw new Error(
      `architecture bundle at ${bundleRoot} has model version ${manifest.modelVersion}, but this reader supports ${ARCHITECTURE_MODEL_VERSION}`,
    );
  }

  const model = architectureModelSchema.parse(
    JSON.parse(await readFile(join(bundleRoot, manifest.model), "utf8")),
  );

  const pages = await Promise.all(
    manifest.pages.map(async (page) => ({
      slug: page.slug,
      title: page.title,
      description: page.description,
      kind: page.kind,
      order: page.order,
      depth: page.depth,
      contents: await readFile(join(bundleRoot, page.path), "utf8"),
    })),
  );

  return { model, manifest, pages };
};
