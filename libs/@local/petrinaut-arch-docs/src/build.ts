/**
 * Builds the bundle in memory.
 *
 * Kept separate from the CLI so `build` and `check` run the same pipeline —
 * `check` builds and throws the files away, reporting only the diagnostics.
 */

import { join } from "node:path";

import { config, type ArchitectureConfig } from "../architecture.config";
import { runChecks } from "./check";
import {
  collectAuthoredContent,
  type AuthoredComponent,
  type AuthoredPage,
} from "./content";
import {
  buildManifest,
  buildSingleFileArchitecture,
  type BundleManifest,
  type DiagramRecord,
} from "./emit/bundle-outputs";
import { buildOverviewDiagram, buildSubtreeDiagram } from "./emit/d2";
import {
  buildPages,
  resolveAuthoredLinks,
  resolveComponentImports,
  slugForLayer,
  type GeneratedPage,
} from "./emit/mdx";
import { extract, type Diagnostic } from "./extract";
import { buildGraph } from "./graph";
import {
  architectureModelSchema,
  packageSchema,
  type ArchitectureModel,
} from "./model";

export const GENERATOR_NAME = "@local/petrinaut-arch-docs";

export interface BuiltBundle {
  model: ArchitectureModel;
  manifest: BundleManifest;
  generated: GeneratedPage[];
  authored: AuthoredPage[];
  /** Diagram name → D2 source. */
  diagramSources: Map<string, string>;
  /** Importable diagram components shipped with the bundle. */
  components: AuthoredComponent[];
  singleFile: string;
  diagnostics: Diagnostic[];
}

/** Diagram embedded on the overview page. */
const OVERVIEW_DIAGRAM = "overview";

export const buildBundle = async (options: {
  repoRoot: string;
  overrides?: Partial<ArchitectureConfig>;
  /**
   * Whether rendered SVGs will exist. When false, pages omit diagram images
   * rather than pointing at files that were never written — a bundle that
   * references a missing image fails the consuming site's build.
   */
  includeDiagrams?: boolean;
}): Promise<BuiltBundle> => {
  const settings: ArchitectureConfig = { ...config, ...options.overrides };
  const { repoRoot } = options;

  // Normalise once up front so every stage sees defaulted fields such as
  // `sourceDirectory` rather than each having to reapply them.
  const packages = settings.packages.map((pkg) => packageSchema.parse(pkg));

  const extraction = await extract({
    repoRoot,
    packages,
    ignoredDirectories: settings.ignoredDirectories,
    ignoredFilePattern: settings.ignoredFilePattern,
  });

  const diagnostics: Diagnostic[] = [...extraction.diagnostics];

  const graph = await buildGraph({
    repoRoot,
    packages,
    tsconfigPath: join(
      repoRoot,
      "libs/@local/petrinaut-arch-docs/dependency-cruiser.tsconfig.json",
    ),
    excludePattern: settings.ignoredFilePattern.source,
    fileLayers: extraction.fileLayers,
    layers: extraction.layers,
  });

  for (const warning of graph.warnings) {
    diagnostics.push({
      file: "architecture.config.ts",
      line: null,
      severity: "warning",
      message: warning,
    });
  }

  const model = architectureModelSchema.parse({
    version: 1,
    packages,
    layers: extraction.layers,
    edges: graph.edges,
    rules: settings.rules,
  } satisfies ArchitectureModel);

  diagnostics.push(
    ...runChecks({
      repoRoot,
      model,
      rules: settings.rules,
      packages,
    }),
  );

  const diagramSources = new Map<string, string>();

  diagramSources.set(
    OVERVIEW_DIAGRAM,
    buildOverviewDiagram(model.layers, model.edges, GENERATOR_NAME),
  );
  // A drill-down diagram for every layer that has sub-layers, embedded on that
  // layer's own page.
  const parentLayerIds = model.layers
    .filter((layer) => model.layers.some((other) => other.parent === layer.id))
    .map((layer) => layer.id);

  for (const parentId of parentLayerIds) {
    diagramSources.set(
      parentId,
      buildSubtreeDiagram(parentId, model.layers, model.edges, GENERATOR_NAME),
    );
  }

  const diagrams: DiagramRecord[] = [...diagramSources.keys()].map((name) => ({
    name,
    source: `diagrams/${name}.d2`,
    svg: `diagrams/${name}.svg`,
  }));

  const authoredResult = await collectAuthoredContent({
    repoRoot,
    contentDirectory: settings.contentDirectory,
  });

  for (const error of authoredResult.errors) {
    diagnostics.push({
      file: error.file,
      line: null,
      severity: "error",
      message: error.message,
    });
  }

  const declaredLayerIds = new Set(model.layers.map((layer) => layer.id));

  /**
   * Final slug for each authored page.
   *
   * An attached page moves beneath its layer's page so the guide and the
   * generated reference for the same code sit together. Its file name becomes
   * the last segment, which is why two guides attached to one layer must not
   * share a file name.
   */
  const authoredSlugs = new Map<string, string>();
  for (const page of authoredResult.pages) {
    if (page.attachTo === null) {
      authoredSlugs.set(page.slug, page.slug);
      continue;
    }

    if (!declaredLayerIds.has(page.attachTo)) {
      diagnostics.push({
        file: page.sourceFile,
        line: null,
        severity: "error",
        message: `attachTo \`${page.attachTo}\` is not a declared layer`,
      });
      authoredSlugs.set(page.slug, page.slug);
      continue;
    }

    const leaf = page.slug.slice(page.slug.lastIndexOf("/") + 1);
    authoredSlugs.set(page.slug, `${slugForLayer(page.attachTo)}/${leaf}`);
  }

  const layerSlugsById = new Map(
    model.layers.map((layer) => [layer.id, slugForLayer(layer.id)]),
  );

  const guidesByLayer = new Map<
    string,
    { slug: string; title: string; description: string }[]
  >();
  for (const page of authoredResult.pages) {
    if (page.attachTo === null || !declaredLayerIds.has(page.attachTo)) {
      continue;
    }
    guidesByLayer.set(page.attachTo, [
      ...(guidesByLayer.get(page.attachTo) ?? []),
      {
        slug: authoredSlugs.get(page.slug) ?? page.slug,
        title: page.title,
        description: page.description,
      },
    ]);
  }

  const componentNames = new Set(
    authoredResult.components.map((component) => component.name),
  );

  // Authored pages address their targets by name (`layer:`, `doc:`, `@diagrams/`)
  // rather than by path, because a page's depth is only known once `attachTo` is
  // resolved.
  const authored = authoredResult.pages.map((page) => {
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
    const contents = imported.contents;
    const unresolved = [...linked.unresolved, ...imported.unresolved];

    for (const target of unresolved) {
      diagnostics.push({
        file: page.sourceFile,
        line: null,
        severity: "error",
        message: `link target \`${target}\` does not resolve`,
      });
    }

    return { ...page, slug, path: `pages/${slug}.mdx`, contents };
  });

  const includeDiagrams = options.includeDiagrams ?? true;

  const generated = buildPages(model, {
    sourceUrlPrefix: settings.sourceUrlPrefix,
    overviewDiagram: includeDiagrams ? OVERVIEW_DIAGRAM : null,
    layerDiagrams: includeDiagrams
      ? new Set(parentLayerIds)
      : new Set<string>(),
    guidesByLayer,
  });

  const generatedSlugs = new Set(generated.map((page) => page.slug));
  for (const page of authored) {
    if (generatedSlugs.has(page.slug)) {
      diagnostics.push({
        file: page.sourceFile,
        line: null,
        severity: "error",
        message: `authored page slug \`${page.slug}\` collides with a generated page; rename it`,
      });
    }
  }

  const manifest = buildManifest({
    generator: GENERATOR_NAME,
    generated,
    authored,
    diagrams,
  });

  return {
    model,
    manifest,
    generated,
    authored,
    diagramSources,
    singleFile: buildSingleFileArchitecture(model),
    components: authoredResult.components,
    diagnostics,
  };
};

/**
 * The bundle's text files, keyed by path relative to the bundle root. SVGs are
 * excluded: they are produced by the external `d2` renderer, so comparing them
 * would make drift detection depend on the renderer's exact version.
 */
export const bundleTextFiles = (bundle: BuiltBundle): Map<string, string> => {
  const files = new Map<string, string>();

  files.set("architecture.json", `${JSON.stringify(bundle.model, null, 2)}\n`);
  files.set("manifest.json", `${JSON.stringify(bundle.manifest, null, 2)}\n`);
  files.set("architecture.md", bundle.singleFile);

  for (const [name, source] of bundle.diagramSources) {
    files.set(`diagrams/${name}.d2`, source);
  }

  for (const page of bundle.generated) {
    files.set(page.path, page.contents);
  }

  for (const page of bundle.authored) {
    files.set(page.path, page.contents);
  }

  for (const component of bundle.components) {
    files.set(
      `components/${component.path.replace(/^components\//u, "")}`,
      component.contents,
    );
  }

  return files;
};
