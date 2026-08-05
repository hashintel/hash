/**
 * Builds the bundle in memory.
 *
 * Kept separate from the CLI so `build` and `check` run the exact same pipeline:
 * `check` builds and compares against what is committed, which is only a valid
 * drift signal if nothing differs between the two paths. That is also why no
 * output here depends on the clock — same commit, same bytes.
 */

import { join } from "node:path";

import { config, type ArchitectureConfig } from "../architecture.config";
import { runChecks } from "./check";
import { collectAuthoredContent, type AuthoredPage } from "./content";
import {
  buildLlmsTxt,
  buildManifest,
  buildSingleFileArchitecture,
  type BundleManifest,
  type DiagramRecord,
} from "./emit/bundle-outputs";
import {
  buildLayerDiagram,
  buildOverviewDiagram,
  buildSubtreeDiagram,
} from "./emit/d2";
import { buildPages, type GeneratedPage } from "./emit/mdx";
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
  llmsTxt: string;
  singleFile: string;
  diagnostics: Diagnostic[];
}

/**
 * Diagram embedded on the overview page. Per-root diagrams are added
 * dynamically once the layers are known, and `layers.d2` is emitted as a
 * diffable record of the whole graph without being rendered into a page.
 */
const OVERVIEW_DIAGRAM = "overview";
const FULL_GRAPH_DIAGRAM = "layers";

export const buildBundle = async (options: {
  repoRoot: string;
  overrides?: Partial<ArchitectureConfig>;
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
  diagramSources.set(
    FULL_GRAPH_DIAGRAM,
    buildLayerDiagram(model.layers, model.edges, GENERATOR_NAME),
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

  const generated = buildPages(model, {
    sourceUrlPrefix: settings.sourceUrlPrefix,
    overviewDiagram: OVERVIEW_DIAGRAM,
    layerDiagrams: new Set(parentLayerIds),
  });

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

  const generatedSlugs = new Set(generated.map((page) => page.slug));
  for (const page of authoredResult.pages) {
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
    authored: authoredResult.pages,
    diagrams,
  });

  return {
    model,
    manifest,
    generated,
    authored: authoredResult.pages,
    diagramSources,
    llmsTxt: buildLlmsTxt({
      model,
      generated,
      authored: authoredResult.pages,
    }),
    singleFile: buildSingleFileArchitecture(model),
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
  files.set("llms.txt", bundle.llmsTxt);
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

  return files;
};
