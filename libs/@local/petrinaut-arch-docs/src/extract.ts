/**
 * Walks the configured packages and resolves every source file to a layer.
 *
 * This is the module that replaces the hand-maintained path→layer switch that
 * used to live in `petrinaut-core/scripts/generate-dependency-diagrams.mjs`.
 * There, the mapping was ~180 lines of `if (path.startsWith(...))` sitting far
 * from the code it described, with a silent fallback that mis-bucketed anything
 * moved or renamed. Here the mapping is declared next to the code and resolved
 * by inheritance: declare a layer on a folder, and every descendant file
 * belongs to it until a deeper declaration says otherwise.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, posix, relative } from "node:path";

import { parseFrontmatter } from "./frontmatter";
import { toPosix } from "./paths";
import { scanTags } from "./tags";

import type { Layer, ArchitecturePackage } from "./model";

/** A layer declaration plus everything resolved onto it during the walk. */
interface LayerAccumulator {
  id: string;
  name: string;
  package: string;
  role: string;
  declaredIn: string;
  /** Folder the declaration governs; descendants inherit from it. */
  scope: string;
  prose: string | null;
  references: string[];
  files: string[];
  lineCount: number;
}

export interface Diagnostic {
  file: string;
  line: number | null;
  message: string;
  severity: "error" | "warning";
}

export interface ExtractionResult {
  layers: Layer[];
  /** Repo-relative source file → layer id, for the graph stage. */
  fileLayers: Map<string, string>;
  diagnostics: Diagnostic[];
}

export interface ExtractOptions {
  repoRoot: string;
  packages: ArchitecturePackage[];
  /** Directory names skipped entirely during the walk. */
  ignoredDirectories: string[];
  /** Regex matched against repo-relative paths to skip files. */
  ignoredFilePattern: RegExp;
}

const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot);
};

const countNonBlankLines = (text: string): number =>
  text.split("\n").filter((line) => line.trim() !== "").length;

interface WalkEntry {
  /** Repo-relative, posix-separated. */
  path: string;
  absolutePath: string;
  /** Repo-relative posix directory containing the file. */
  directory: string;
  name: string;
}

const walkFiles = async (
  root: string,
  repoRoot: string,
  ignoredDirectories: Set<string>,
): Promise<WalkEntry[]> => {
  const entries: WalkEntry[] = [];

  const visit = async (absoluteDirectory: string): Promise<void> => {
    const contents = await readdir(absoluteDirectory, { withFileTypes: true });

    for (const item of contents) {
      const absolutePath = join(absoluteDirectory, item.name);

      if (item.isDirectory()) {
        if (!ignoredDirectories.has(item.name)) {
          await visit(absolutePath);
        }
        continue;
      }

      if (!item.isFile()) {
        continue;
      }

      const relativePath = toPosix(relative(repoRoot, absolutePath));
      entries.push({
        path: relativePath,
        absolutePath,
        directory: posix.dirname(relativePath),
        name: item.name,
      });
    }
  };

  await visit(root);
  return entries.sort((left, right) => left.path.localeCompare(right.path));
};

/**
 * Finds the declaration governing a path by walking up the directory chain and
 * taking the first (deepest) match. Ties cannot happen: a folder may hold at
 * most one declaration, which `collectDeclarations` enforces.
 */
const resolveScope = (
  directory: string,
  scopes: Map<string, string>,
): string | null => {
  let current = directory;

  for (;;) {
    const layerId = scopes.get(current);
    if (layerId !== undefined) {
      return layerId;
    }

    const parent = posix.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
};

export const extract = async (
  options: ExtractOptions,
): Promise<ExtractionResult> => {
  const { repoRoot, packages, ignoredFilePattern } = options;
  const ignoredDirectories = new Set(options.ignoredDirectories);
  const diagnostics: Diagnostic[] = [];

  const accumulators = new Map<string, LayerAccumulator>();
  /** Folder → layer id it declares. */
  const scopes = new Map<string, string>();
  /** Layer id → the file that declared it, for duplicate reporting. */
  const declaredBy = new Map<string, string>();

  const packageEntries = new Map<string, WalkEntry[]>();

  for (const pkg of packages) {
    // A package whose language has no extractor would otherwise contribute no
    // files, no layers and no diagnostics — appearing in the model as covered
    // while being entirely undescribed. That is the silent mis-bucketing this
    // system exists to remove, so it is an error rather than a skip.
    if (pkg.language !== "typescript") {
      diagnostics.push({
        file: `${pkg.path}/package.json`,
        line: null,
        severity: "error",
        message: `package \`${pkg.name}\` is configured as \`${pkg.language}\`, which has no extractor — it would be listed in the model with no layers. Remove it from architecture.config.ts until one exists.`,
      });
      continue;
    }

    const entries = await walkFiles(
      join(repoRoot, pkg.path, pkg.sourceDirectory),
      repoRoot,
      ignoredDirectories,
    );
    packageEntries.set(
      pkg.name,
      entries.filter((entry) => !ignoredFilePattern.test(entry.path)),
    );
  }

  // Pass 1 — collect declarations, so inheritance can be resolved in pass 2
  // regardless of the order files are visited in.
  for (const pkg of packages) {
    for (const entry of packageEntries.get(pkg.name) ?? []) {
      const isMarkdown = entry.name.toLowerCase().endsWith(".md");
      const isSource = sourceExtensions.has(extensionOf(entry.name));

      if (!isMarkdown && !isSource) {
        continue;
      }

      const contents = await readFile(entry.absolutePath, "utf8");

      const register = (
        accumulator: Omit<
          LayerAccumulator,
          "files" | "lineCount" | "references"
        >,
      ): void => {
        const existingFile = declaredBy.get(accumulator.id);
        if (existingFile !== undefined) {
          diagnostics.push({
            file: accumulator.declaredIn,
            line: null,
            severity: "error",
            message: `layer \`${accumulator.id}\` is already declared in ${existingFile}`,
          });
          return;
        }

        const existingScope = scopes.get(accumulator.scope);
        if (existingScope !== undefined) {
          diagnostics.push({
            file: accumulator.declaredIn,
            line: null,
            severity: "error",
            message: `${accumulator.scope} already declares layer \`${existingScope}\`; a folder may declare at most one layer`,
          });
          return;
        }

        declaredBy.set(accumulator.id, accumulator.declaredIn);
        scopes.set(accumulator.scope, accumulator.id);
        accumulators.set(accumulator.id, {
          ...accumulator,
          references: [],
          files: [],
          lineCount: 0,
        });
      };

      if (isMarkdown) {
        const { declaration, body, errors } = parseFrontmatter(contents);

        for (const message of errors) {
          diagnostics.push({
            file: entry.path,
            line: null,
            severity: "error",
            message,
          });
        }

        if (declaration) {
          const segments = declaration.layer.split(".");
          register({
            id: declaration.layer,
            name: segments[segments.length - 1] ?? "",
            package: pkg.name,
            role: declaration.role,
            declaredIn: entry.path,
            scope: entry.directory,
            prose: body === "" ? null : body,
          });
        }

        continue;
      }

      const { tags, diagnostics: tagDiagnostics } = scanTags(contents);

      for (const diagnostic of tagDiagnostics) {
        diagnostics.push({
          file: entry.path,
          line: diagnostic.line,
          severity: "error",
          message: diagnostic.message,
        });
      }

      if (tags.layerRoot) {
        const id = tags.layerRoot.value;
        const segments = id.split(".");
        register({
          id,
          name: segments[segments.length - 1] ?? "",
          package: pkg.name,
          role: tags.role?.value ?? "",
          declaredIn: entry.path,
          scope: entry.directory,
          prose: null,
        });

        if (!tags.role) {
          diagnostics.push({
            file: entry.path,
            line: tags.layerRoot.line,
            severity: "error",
            message: `@layerRoot ${id} also needs an @role describing what the layer is responsible for`,
          });
        }
      }
    }
  }

  // Pass 2 — resolve every source file to a layer and fold in file-level tags.
  const fileLayers = new Map<string, string>();

  for (const pkg of packages) {
    for (const entry of packageEntries.get(pkg.name) ?? []) {
      const isMarkdown = entry.name.toLowerCase().endsWith(".md");
      const isSource = sourceExtensions.has(extensionOf(entry.name));

      if (!isMarkdown && !isSource) {
        continue;
      }

      const inheritedLayerId = resolveScope(entry.directory, scopes);

      if (isMarkdown) {
        if (inheritedLayerId === null) {
          continue;
        }
        const accumulator = accumulators.get(inheritedLayerId);
        if (accumulator && accumulator.declaredIn !== entry.path) {
          accumulator.references.push(entry.path);
        }
        continue;
      }

      if (inheritedLayerId === null) {
        diagnostics.push({
          file: entry.path,
          line: null,
          severity: "error",
          message: `no layer resolves for this file — declare one on ${entry.directory} or an ancestor (README frontmatter or @layerRoot)`,
        });
        continue;
      }

      const accumulator = accumulators.get(inheritedLayerId);

      if (!accumulator) {
        continue;
      }

      // Only line counts are read here: with no per-file tags left in the
      // vocabulary, a file's contents say nothing about the architecture beyond
      // which layer's folder it sits in.
      const contents = await readFile(entry.absolutePath, "utf8");

      accumulator.files.push(entry.path);
      accumulator.lineCount += countNonBlankLines(contents);
      fileLayers.set(entry.path, inheritedLayerId);
    }
  }

  const layers: Layer[] = [...accumulators.values()]
    .map((accumulator) => ({
      id: accumulator.id,
      name: accumulator.name,
      parent:
        accumulator.id.lastIndexOf(".") === -1
          ? null
          : accumulator.id.slice(0, accumulator.id.lastIndexOf(".")),
      package: accumulator.package,
      role: accumulator.role,
      declaredIn: accumulator.declaredIn,
      prose: accumulator.prose,
      references: accumulator.references.sort((left, right) =>
        left.localeCompare(right),
      ),
      files: accumulator.files,
      fileCount: accumulator.files.length,
      lineCount: accumulator.lineCount,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return { layers, fileLayers, diagnostics };
};
