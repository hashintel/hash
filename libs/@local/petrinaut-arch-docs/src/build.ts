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
import { error, type Diagnostic } from "./diagnostics";
import {
  buildManifest,
  buildSingleFileArchitecture,
  type BundleManifest,
} from "./emit/bundle-outputs";
import {
  buildNeighbourhoodDiagram,
  buildOverviewDiagram,
  buildSubtreeDiagram,
} from "./emit/d2";
import {
  buildPages,
  resolveAuthoredLinks,
  resolveComponentImports,
  resolveDiagramImages,
  layerSlug,
  type GeneratedPage,
} from "./emit/mdx";
import { readShippedComponents } from "./emit/shipped-components";
import { extract } from "./extract";
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
  /** Bundle components: authored diagram components plus the shipped cards. */
  components: AuthoredComponent[];
  singleFile: string;
  diagnostics: Diagnostic[];
}

/** Diagram embedded on the overview page. */
const OVERVIEW_DIAGRAM = "overview";

/**
 * Diagram names are namespaced by subdirectory rather than by a name prefix,
 * because a layer id is only guaranteed unique among layer ids — a flat
 * `around-${id}` scheme would collide with a top-level layer actually called
 * `around-something`.
 */
const NEIGHBOURHOOD_PREFIX = "around";
const SUBTREE_PREFIX = "within";

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
    ignoredDirectories: settings.ignoredDirectories,
    ignoredFilePattern: settings.ignoredFilePattern,
    fileLayers: extraction.fileLayers,
    layers: extraction.layers,
    talksTo: extraction.talksTo,
  });

  diagnostics.push(...graph.diagnostics);

  const model: ArchitectureModel = {
    version: 1,
    packages,
    layers: extraction.layers,
    edges: graph.edges,
    rules: settings.rules,
  };

  // Validated, not enforced. `extract` already reports each invalid layer
  // against the file that declared it, which is the message someone can act on;
  // throwing here would replace it with a stack trace. Anything the per-layer
  // pass missed still gets reported rather than reaching a consumer, and the
  // build refuses to write while any error stands.
  const validated = architectureModelSchema.safeParse(model);
  if (!validated.success) {
    for (const issue of validated.error.issues) {
      // Layer issues are already reported against the file that declared them.
      // Repeating them here would print the same typo three times.
      if (issue.path[0] === "layers") {
        continue;
      }

      diagnostics.push(
        error(
          "architecture.config.ts",
          `the generated model is not valid at \`${issue.path.join(".")}\`: ${issue.message}`,
        ),
      );
    }
  }

  diagnostics.push(...runChecks({ model, rules: settings.rules }));

  const diagramSources = new Map<string, string>();

  diagramSources.set(
    OVERVIEW_DIAGRAM,
    buildOverviewDiagram(model.layers, model.edges, GENERATOR_NAME),
  );

  // A neighbourhood diagram for *every* layer, including leaves — those are
  // where a reader most often lands, and "what does this touch" is the question
  // they arrive with.
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

  // A drill-down diagram for every layer that has sub-layers, answering the
  // other question: what is inside this one.
  const parentLayerIds = model.layers
    .filter((layer) => model.layers.some((other) => other.parent === layer.id))
    .map((layer) => layer.id);

  for (const parentId of parentLayerIds) {
    diagramSources.set(
      `${SUBTREE_PREFIX}/${parentId}`,
      buildSubtreeDiagram(parentId, model.layers, model.edges, GENERATOR_NAME),
    );
  }

  const authoredResult = await collectAuthoredContent({
    repoRoot,
    contentDirectory: settings.contentDirectory,
  });

  for (const failure of authoredResult.errors) {
    diagnostics.push(error(failure.file, failure.message));
  }

  const includeDiagrams = options.includeDiagrams ?? true;

  // Hand-written diagrams render through the same pipeline as generated ones,
  // so a name collision would silently overwrite a generated diagram.
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

  /**
   * Resolve every authored page's final slug in one pass.
   *
   * An attached page moves beneath its layer's page so the guide and the
   * generated reference for the same code sit together. Its file name becomes
   * the last segment, which is why two guides attached to one layer must not
   * share a file name. A page whose `attachTo` does not name a real layer is
   * reported and stays where it was, so one bad guide does not move the rest.
   */
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

    const leaf = page.slug.slice(page.slug.lastIndexOf("/") + 1);
    const slug = `${layerSlug(page.attachTo)}/${leaf}`;
    authoredSlugs.set(page.slug, slug);
    guidesByLayer.set(page.attachTo, [
      ...(guidesByLayer.get(page.attachTo) ?? []),
      { slug, title: page.title, description: page.description },
    ]);
  }

  // Both component sets land in the bundle's `components/`, so an authored
  // component whose file name matches a shipped one would overwrite a module
  // every generated layer page imports.
  const shippedComponents = await readShippedComponents();
  const shippedPaths = new Set(
    shippedComponents.map((component) => component.path),
  );
  for (const component of authoredResult.components) {
    if (shippedPaths.has(component.path)) {
      diagnostics.push(
        error(
          `${settings.contentDirectory}/${component.path}`,
          `component \`${component.name}\` collides with a component the generator ships`,
        ),
      );
    }
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
    const illustrated = resolveDiagramImages(
      imported.contents,
      slug,
      authoredDiagramNames,
      includeDiagrams,
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
    sourceUrlPrefix: settings.sourceUrlPrefix,
    overviewDiagram: includeDiagrams ? OVERVIEW_DIAGRAM : null,
    neighbourhoodDiagrams: includeDiagrams
      ? new Map(
          model.layers.map((layer) => [
            layer.id,
            `${NEIGHBOURHOOD_PREFIX}/${layer.id}`,
          ]),
        )
      : new Map<string, string>(),
    subtreeDiagrams: includeDiagrams
      ? new Map(parentLayerIds.map((id) => [id, `${SUBTREE_PREFIX}/${id}`]))
      : new Map<string, string>(),
    guidesByLayer,
  });

  /**
   * Checked against generated pages and against other authored pages.
   *
   * An attached page takes its last slug segment from its own file name, so
   * `content/a/protocol.mdx` and `content/b/protocol.mdx` attached to the same
   * layer resolve to one page. Checking only against generated pages let one
   * overwrite the other while the manifest listed both.
   */
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

  const manifest = buildManifest({
    generator: GENERATOR_NAME,
    generated,
    authored,
  });

  return {
    model,
    manifest,
    generated,
    authored,
    diagramSources,
    singleFile: buildSingleFileArchitecture(model),
    components: [...authoredResult.components, ...shippedComponents],
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
    files.set(component.path, component.contents);
  }

  return files;
};
