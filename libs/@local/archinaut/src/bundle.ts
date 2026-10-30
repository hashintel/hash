/**
 * The bundle: the model, the single-file digest, the manifest, generated
 * layer pages, authored pages merged in, and the React cards the pages
 * import. Framework-neutral; a host renders it with its own MDX pipeline.
 */

import {
  collectAuthoredContent,
  collectColocatedContent,
  type AuthoredComponent,
  type AuthoredContentResult,
  type AuthoredDiagram,
  type AuthoredPage,
} from "./bundle/content";
import {
  buildNeighbourhoodDiagram,
  buildOverviewDiagram,
  buildSubtreeDiagram,
} from "./bundle/diagrams";
import {
  buildManifest,
  buildSingleFileArchitecture,
  type BundleManifest,
} from "./bundle/outputs";
import {
  resolveAuthoredLinks,
  resolveComponentImports,
  resolveDiagramImages,
  resolveLocalDiagrams,
} from "./bundle/page-links";
import { buildPages, layerSlug, type GeneratedPage } from "./bundle/pages";
import { buildSearchIndex, type SearchIndex } from "./bundle/search";
import { bundlePages } from "./bundle/shared/bundle-page";
import { readShippedComponents } from "./bundle/shipped-components";
import { error, type Diagnostic } from "./shared/diagnostics";

import type { ArchitectureModel } from "./model";

export { bundlePages, type BundlePage } from "./bundle/shared/bundle-page";

export const GENERATOR_NAME = "@local/archinaut";

/**
 * Diagram names are namespaced by subdirectory: a layer id is unique only
 * among layer ids, so a flat `around-<id>` could collide with a top-level
 * layer actually called `around-something`.
 */
const OVERVIEW_DIAGRAM = "overview";
const NEIGHBOURHOOD_PREFIX = "around";
const SUBTREE_PREFIX = "within";

export interface Bundle {
  manifest: BundleManifest;
  generated: GeneratedPage[];
  authored: AuthoredPage[];
  components: AuthoredComponent[];
  /** Diagram name → D2 source, generated and authored alike. */
  diagramSources: Map<string, string>;
  singleFile: string;
  search: SearchIndex;
  diagnostics: Diagnostic[];
}

interface GeneratedDiagrams {
  /** Diagram name → D2 source. */
  sources: Map<string, string>;
  overview: string;
  /** Layer id → the name of its neighbourhood diagram. */
  neighbourhood: Map<string, string>;
  /** Layer id → the name of its sub-layer diagram, for layers that have any. */
  subtree: Map<string, string>;
}

/** The overview, one neighbourhood per layer, one drill-down per parent layer. */
const generatedDiagrams = (model: ArchitectureModel): GeneratedDiagrams => {
  const { layers, edges } = model;
  const sources = new Map<string, string>();
  const neighbourhood = new Map<string, string>();
  const subtree = new Map<string, string>();
  sources.set(
    OVERVIEW_DIAGRAM,
    buildOverviewDiagram(layers, edges, GENERATOR_NAME),
  );
  for (const layer of layers) {
    const name = `${NEIGHBOURHOOD_PREFIX}/${layer.id}`;
    neighbourhood.set(layer.id, name);
    sources.set(
      name,
      buildNeighbourhoodDiagram(layer.id, layers, edges, GENERATOR_NAME),
    );
  }
  for (const layer of layers) {
    if (layers.some((other) => other.parent === layer.id)) {
      const name = `${SUBTREE_PREFIX}/${layer.id}`;
      subtree.set(layer.id, name);
      sources.set(
        name,
        buildSubtreeDiagram(layer.id, layers, edges, GENERATOR_NAME),
      );
    }
  }
  return { sources, overview: OVERVIEW_DIAGRAM, neighbourhood, subtree };
};

/**
 * Adds the authored diagrams to the generated ones. They render through the
 * same pipeline, so a name collision would silently overwrite a generated
 * diagram; such a diagram is reported and left out.
 */
const addAuthoredDiagrams = (
  diagrams: AuthoredDiagram[],
  sources: Map<string, string>,
  diagnostics: Diagnostic[],
): { names: Set<string>; bySource: Map<string, string> } => {
  const names = new Set<string>();
  const bySource = new Map<string, string>();
  for (const diagram of diagrams) {
    if (sources.has(diagram.name)) {
      diagnostics.push(
        error(
          diagram.sourceFile,
          `diagram name \`${diagram.name}\` collides with a generated diagram`,
        ),
      );
      continue;
    }
    sources.set(diagram.name, diagram.source);
    names.add(diagram.name);
    bySource.set(diagram.sourceFile, diagram.name);
  }
  return { names, bySource };
};

interface Guide {
  slug: string;
  title: string;
  description: string;
}

/**
 * Where each authored page lands: a page attached to a layer moves beneath
 * that layer's page, so its final slug is only known here, and the layer's
 * page lists it as a guide.
 */
const placeAuthoredPages = (
  pages: AuthoredPage[],
  model: ArchitectureModel,
  diagnostics: Diagnostic[],
): { slugs: Map<string, string>; guidesByLayer: Map<string, Guide[]> } => {
  const declaredLayerIds = new Set(model.layers.map((layer) => layer.id));
  const slugs = new Map<string, string>();
  const guidesByLayer = new Map<string, Guide[]>();
  for (const page of pages) {
    if (page.attachTo === null) {
      slugs.set(page.slug, page.slug);
      continue;
    }
    if (!declaredLayerIds.has(page.attachTo)) {
      diagnostics.push(
        error(
          page.sourceFile,
          `attachTo \`${page.attachTo}\` is not a declared layer`,
        ),
      );
      slugs.set(page.slug, page.slug);
      continue;
    }
    const slug = `${layerSlug(page.attachTo)}/${page.slug.slice(page.slug.lastIndexOf("/") + 1)}`;
    slugs.set(page.slug, slug);
    guidesByLayer.set(page.attachTo, [
      ...(guidesByLayer.get(page.attachTo) ?? []),
      { slug, title: page.title, description: page.description },
    ]);
  }
  return { slugs, guidesByLayer };
};

/** What link resolution needs to know about the rest of the bundle. */
interface LinkContext {
  layerSlugs: Map<string, string>;
  docSlugs: Map<string, string>;
  componentNames: Set<string>;
  authoredDiagramNames: Set<string>;
  /** Repo-relative `.d2` source file → the bundle's diagram name. */
  diagramsBySource: Map<string, string>;
  includeDiagrams: boolean;
}

/** A page's links, component imports and diagram references, resolved against its final slug. */
const resolvePageLinks = (
  page: AuthoredPage,
  slug: string,
  context: LinkContext,
): { contents: string; unresolved: string[] } => {
  const linked = resolveAuthoredLinks(page.contents, slug, {
    layerSlugs: context.layerSlugs,
    docSlugs: context.docSlugs,
  });
  const imported = resolveComponentImports(
    linked.contents,
    slug,
    context.componentNames,
  );
  const illustrated = resolveDiagramImages(
    imported.contents,
    slug,
    context.authoredDiagramNames,
    context.includeDiagrams,
  );
  const local = resolveLocalDiagrams(
    illustrated.contents,
    slug,
    page.sourceFile,
    context.diagramsBySource,
    context.includeDiagrams,
  );
  return {
    contents: local.contents,
    unresolved: [
      ...linked.unresolved,
      ...imported.unresolved,
      ...illustrated.unresolved,
      ...local.unresolved,
    ],
  };
};

/** Hand-written content from the content directory and from beside the code, as one. */
const collectContent = async (options: {
  repoRoot: string;
  contentDirectory: string;
  model: ArchitectureModel;
}): Promise<AuthoredContentResult> => {
  const [fromContent, fromCode] = await Promise.all([
    collectAuthoredContent({
      repoRoot: options.repoRoot,
      contentDirectory: options.contentDirectory,
    }),
    collectColocatedContent({
      repoRoot: options.repoRoot,
      layers: options.model.layers,
    }),
  ]);
  return {
    pages: [...fromContent.pages, ...fromCode.pages],
    components: fromContent.components,
    diagrams: [...fromContent.diagrams, ...fromCode.diagrams],
    errors: [...fromContent.errors, ...fromCode.errors],
  };
};

export const emitBundle = async (options: {
  model: ArchitectureModel;
  repoRoot: string;
  contentDirectory: string;
  sourceUrlPrefix: string;
  /** Whether SVGs will exist; when false, pages omit diagram images. */
  includeDiagrams: boolean;
}): Promise<Bundle> => {
  const { model, includeDiagrams } = options;
  const diagnostics: Diagnostic[] = [];
  const [content, shippedComponents] = await Promise.all([
    collectContent(options),
    readShippedComponents(),
  ]);
  for (const failure of content.errors) {
    diagnostics.push(error(failure.file, failure.message));
  }

  const diagrams = generatedDiagrams(model);
  const authoredDiagrams = addAuthoredDiagrams(
    content.diagrams,
    diagrams.sources,
    diagnostics,
  );
  const placed = placeAuthoredPages(content.pages, model, diagnostics);

  const shippedPaths = new Set(
    shippedComponents.map((component) => component.path),
  );
  for (const component of content.components) {
    if (shippedPaths.has(component.path)) {
      diagnostics.push(
        error(
          `${options.contentDirectory}/${component.path}`,
          `component \`${component.name}\` collides with a component the generator ships`,
        ),
      );
    }
  }

  const context: LinkContext = {
    layerSlugs: new Map(
      model.layers.map((layer) => [layer.id, layerSlug(layer.id)]),
    ),
    docSlugs: placed.slugs,
    componentNames: new Set(
      content.components.map((component) => component.name),
    ),
    authoredDiagramNames: authoredDiagrams.names,
    diagramsBySource: authoredDiagrams.bySource,
    includeDiagrams,
  };
  const authored = content.pages.map((page): AuthoredPage => {
    const slug = placed.slugs.get(page.slug) ?? page.slug;
    const resolved = resolvePageLinks(page, slug, context);
    for (const target of resolved.unresolved) {
      diagnostics.push(
        error(page.sourceFile, `link target \`${target}\` does not resolve`),
      );
    }
    return {
      ...page,
      slug,
      path: `pages/${slug}.mdx`,
      contents: resolved.contents,
    };
  });

  const generated = buildPages(model, {
    sourceUrlPrefix: options.sourceUrlPrefix,
    overviewDiagram: includeDiagrams ? diagrams.overview : null,
    neighbourhoodDiagrams: includeDiagrams ? diagrams.neighbourhood : new Map(),
    subtreeDiagrams: includeDiagrams ? diagrams.subtree : new Map(),
    guidesByLayer: placed.guidesByLayer,
  });

  const occupiedSlugs = new Set(generated.map((page) => page.slug));
  for (const page of authored) {
    if (occupiedSlugs.has(page.slug)) {
      diagnostics.push(
        error(
          page.sourceFile,
          `page slug \`${page.slug}\` is already taken; rename this file or attach it to a different layer`,
        ),
      );
      continue;
    }
    occupiedSlugs.add(page.slug);
  }

  const pages = bundlePages({ generated, authored });
  return {
    manifest: buildManifest({ generator: GENERATOR_NAME, pages }),
    generated,
    authored,
    components: [...content.components, ...shippedComponents],
    diagramSources: diagrams.sources,
    singleFile: buildSingleFileArchitecture(model),
    search: buildSearchIndex(pages),
    diagnostics,
  };
};

/** Every bundle file, keyed by path relative to the bundle root. */
export const bundleFiles = (
  model: ArchitectureModel,
  bundle: Bundle,
): Map<string, string> => {
  const files = new Map<string, string>();
  files.set("architecture.json", `${JSON.stringify(model, null, 2)}\n`);
  files.set("manifest.json", `${JSON.stringify(bundle.manifest, null, 2)}\n`);
  files.set("architecture.md", bundle.singleFile);
  files.set("search.json", `${JSON.stringify(bundle.search)}\n`);
  for (const page of [...bundle.generated, ...bundle.authored]) {
    files.set(page.path, page.contents);
  }
  for (const component of bundle.components) {
    files.set(component.path, component.contents);
  }
  for (const [name, source] of bundle.diagramSources) {
    files.set(`diagrams/${name}.d2`, source);
  }
  return files;
};
