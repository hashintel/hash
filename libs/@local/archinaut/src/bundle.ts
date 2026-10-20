/**
 * The bundle: the model, the single-file digest, the manifest, generated
 * layer pages, authored pages merged in, and the React cards the pages
 * import. Framework-neutral; a host renders it with its own MDX pipeline.
 */

import {
  collectAuthoredContent,
  type AuthoredComponent,
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
} from "./bundle/page-links";
import { buildPages, layerSlug, type GeneratedPage } from "./bundle/pages";
import { readShippedComponents } from "./bundle/shipped-components";
import { error, type Diagnostic } from "./shared/diagnostics";

import type { ArchitectureModel } from "./model";

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
  diagnostics: Diagnostic[];
}

export const emitBundle = async (options: {
  model: ArchitectureModel;
  repoRoot: string;
  contentDirectory: string;
  sourceUrlPrefix: string;
  /** Whether SVGs will exist; when false, pages omit diagram images. */
  includeDiagrams: boolean;
}): Promise<Bundle> => {
  const { model } = options;
  const diagnostics: Diagnostic[] = [];
  const authoredResult = await collectAuthoredContent({
    repoRoot: options.repoRoot,
    contentDirectory: options.contentDirectory,
  });
  for (const failure of authoredResult.errors) {
    diagnostics.push(error(failure.file, failure.message));
  }

  const diagramSources = new Map<string, string>();
  diagramSources.set(
    OVERVIEW_DIAGRAM,
    buildOverviewDiagram(model.layers, model.edges, GENERATOR_NAME),
  );
  for (const layer of model.layers) {
    diagramSources.set(
      `${NEIGHBOURHOOD_PREFIX}/${layer.id}`,
      buildNeighbourhoodDiagram(
        layer.id,
        model.layers,
        model.edges,
        GENERATOR_NAME,
      ),
    );
  }
  const parentLayerIds = model.layers
    .filter((layer) => model.layers.some((other) => other.parent === layer.id))
    .map((layer) => layer.id);
  for (const parentId of parentLayerIds) {
    diagramSources.set(
      `${SUBTREE_PREFIX}/${parentId}`,
      buildSubtreeDiagram(parentId, model.layers, model.edges, GENERATOR_NAME),
    );
  }
  // Authored diagrams render through the same pipeline, so a name collision
  // would silently overwrite a generated one.
  const authoredDiagramNames = new Set<string>();
  for (const diagram of authoredResult.diagrams) {
    if (diagramSources.has(diagram.name)) {
      diagnostics.push(
        error(
          diagram.sourceFile,
          `diagram name \`${diagram.name}\` collides with a generated diagram`,
        ),
      );
      continue;
    }
    diagramSources.set(diagram.name, diagram.source);
    authoredDiagramNames.add(diagram.name);
  }

  const declaredLayerIds = new Set(model.layers.map((layer) => layer.id));
  const layerSlugsById = new Map(
    model.layers.map((layer) => [layer.id, layerSlug(layer.id)]),
  );

  // An attached page moves beneath its layer's page, so its final slug is only
  // known here; links and imports are resolved against it afterwards.
  const authoredSlugs = new Map<string, string>();
  const guidesByLayer = new Map<
    string,
    { slug: string; title: string; description: string }[]
  >();
  for (const page of authoredResult.pages) {
    const attached =
      page.attachTo !== null && declaredLayerIds.has(page.attachTo);
    if (page.attachTo !== null && !attached) {
      diagnostics.push(
        error(
          page.sourceFile,
          `attachTo \`${page.attachTo}\` is not a declared layer`,
        ),
      );
    }
    if (!attached || page.attachTo === null) {
      authoredSlugs.set(page.slug, page.slug);
      continue;
    }
    const slug = `${layerSlug(page.attachTo)}/${page.slug.slice(page.slug.lastIndexOf("/") + 1)}`;
    authoredSlugs.set(page.slug, slug);
    guidesByLayer.set(page.attachTo, [
      ...(guidesByLayer.get(page.attachTo) ?? []),
      { slug, title: page.title, description: page.description },
    ]);
  }

  const shippedComponents = await readShippedComponents();
  const shippedPaths = new Set(
    shippedComponents.map((component) => component.path),
  );
  for (const component of authoredResult.components) {
    if (shippedPaths.has(component.path)) {
      diagnostics.push(
        error(
          `${options.contentDirectory}/${component.path}`,
          `component \`${component.name}\` collides with a component the generator ships`,
        ),
      );
    }
  }
  const componentNames = new Set(
    authoredResult.components.map((component) => component.name),
  );

  const authored = authoredResult.pages.map((page): AuthoredPage => {
    const slug = authoredSlugs.get(page.slug) ?? page.slug;
    const linked = resolveAuthoredLinks(page.contents, slug, {
      layerSlugs: layerSlugsById,
      docSlugs: authoredSlugs,
    });
    const imported = resolveComponentImports(
      linked.contents,
      slug,
      componentNames,
    );
    const illustrated = resolveDiagramImages(
      imported.contents,
      slug,
      authoredDiagramNames,
      options.includeDiagrams,
    );
    for (const target of [
      ...linked.unresolved,
      ...imported.unresolved,
      ...illustrated.unresolved,
    ]) {
      diagnostics.push(
        error(page.sourceFile, `link target \`${target}\` does not resolve`),
      );
    }
    return {
      ...page,
      slug,
      path: `pages/${slug}.mdx`,
      contents: illustrated.contents,
    };
  });

  const generated = buildPages(model, {
    sourceUrlPrefix: options.sourceUrlPrefix,
    overviewDiagram: options.includeDiagrams ? OVERVIEW_DIAGRAM : null,
    neighbourhoodDiagrams: options.includeDiagrams
      ? new Map(
          model.layers.map((layer) => [
            layer.id,
            `${NEIGHBOURHOOD_PREFIX}/${layer.id}`,
          ]),
        )
      : new Map(),
    subtreeDiagrams: options.includeDiagrams
      ? new Map(parentLayerIds.map((id) => [id, `${SUBTREE_PREFIX}/${id}`]))
      : new Map(),
    guidesByLayer,
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

  return {
    manifest: buildManifest({ generator: GENERATOR_NAME, generated, authored }),
    generated,
    authored,
    components: [...authoredResult.components, ...shippedComponents],
    diagramSources,
    singleFile: buildSingleFileArchitecture(model),
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
