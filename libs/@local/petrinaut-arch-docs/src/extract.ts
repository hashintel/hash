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

import { error, type Diagnostic } from "./diagnostics";
import { parseFrontmatter } from "./frontmatter";
import { layerSchema, parentLayerId } from "./model";
import { toPosix } from "./paths";
import { sourceExtensionsFor, sourceRootOf } from "./scope";
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
  const isSourceEntry = (pkg: ArchitecturePackage, entry: WalkEntry): boolean =>
    sourceExtensionsFor(pkg).includes(extensionOf(entry.name));

  for (const pkg of packages) {
    const entries = await walkFiles(
      join(repoRoot, sourceRootOf(pkg)),
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
      const isSource = isSourceEntry(pkg, entry);

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
          diagnostics.push(
            error(
              accumulator.declaredIn,
              `layer \`${accumulator.id}\` is already declared in ${existingFile}`,
            ),
          );
          return;
        }

        const existingScope = scopes.get(accumulator.scope);
        if (existingScope !== undefined) {
          diagnostics.push(
            error(
              accumulator.declaredIn,
              `${accumulator.scope} already declares layer \`${existingScope}\`; a folder may declare at most one layer`,
            ),
          );
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
          diagnostics.push(error(entry.path, message));
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

      const { tags, diagnostics: tagDiagnostics } = scanTags(
        contents,
        pkg.language,
      );

      for (const diagnostic of tagDiagnostics) {
        diagnostics.push(
          error(entry.path, diagnostic.message, diagnostic.line),
        );
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
          diagnostics.push(
            error(
              entry.path,
              `@layerRoot ${id} also needs an @role describing what the layer is responsible for`,
              tags.layerRoot.line,
            ),
          );
        }
      }
    }
  }

  // Pass 2 — resolve every source file to a layer and fold in file-level tags.
  const fileLayers = new Map<string, string>();

  for (const pkg of packages) {
    for (const entry of packageEntries.get(pkg.name) ?? []) {
      const isMarkdown = entry.name.toLowerCase().endsWith(".md");
      const isSource = isSourceEntry(pkg, entry);

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
        diagnostics.push(
          error(
            entry.path,
            `no layer resolves for this file — declare one on ${entry.directory} or an ancestor (README frontmatter or @layerRoot)`,
          ),
        );
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

  /**
   * Every layer is validated here, so the model can never carry an invalid one.
   *
   * Without this, a `@layerRoot` written without a `@role` reached
   * `architectureModelSchema.parse` in `build.ts` and threw a Zod stack trace,
   * which replaced the diagnostic naming the file that needed fixing. A
   * malformed layer id took the same route. Reporting the file and dropping the
   * layer keeps the failure legible, and the build refuses to write anyway.
   */
  const layers: Layer[] = [...accumulators.values()]
    .flatMap((accumulator) => {
      const candidate = {
        id: accumulator.id,
        name: accumulator.name,
        parent: parentLayerId(accumulator.id),
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
      };

      const parsed = layerSchema.safeParse(candidate);

      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          diagnostics.push(
            error(
              accumulator.declaredIn,
              `layer \`${accumulator.id}\` is not valid: ${issue.path.join(".")} ${issue.message}`,
            ),
          );
        }
      }

      // Kept even when invalid. The diagnostic above names the file to fix, and
      // the build refuses to write while any error stands, so the model is never
      // published. Dropping the layer instead would orphan its files and bury
      // the real message under a list of files that no longer resolve.
      return [candidate];
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  return { layers, fileLayers, diagnostics };
};
