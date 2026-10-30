/**
 * Walks the configured packages and resolves every source file to a layer.
 *
 * A layer is declared on a folder, by `@layerRoot` in a doc comment or by
 * README frontmatter, and every descendant file inherits it until a deeper
 * declaration says otherwise. `@talksTo` declarations are collected for the
 * graph stage, which resolves them into edges. An `.mdx` page or a `.d2`
 * diagram beside the code belongs to the layer of its folder, the same way.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, posix, relative } from "node:path";

import { audienceSchema, layerSchema, parentLayerId } from "../model";
import { error, type Diagnostic } from "../shared/diagnostics";
import { parseFrontmatter } from "../shared/frontmatter";
import { toPosix } from "../shared/paths";
import { scanTags } from "./scan/tags";
import { sourceExtensionsFor, sourceRootOf } from "./shared/scope";

import type { ArchitecturePackage, Audience, Layer } from "../model";

interface LayerAccumulator {
  id: string;
  name: string;
  package: string;
  role: string;
  declaredIn: string;
  /** Folder the declaration governs; descendants inherit from it. */
  scope: string;
  prose: string | null;
  tags: string[];
  audience: Audience[];
  references: string[];
  pages: string[];
  diagrams: string[];
  files: string[];
  lineCount: number;
}

/** One `@talksTo` occurrence, kept against its file for the graph stage. */
export interface TalksToDeclaration {
  file: string;
  line: number;
  target: string;
  protocol: string;
}

/** One `@interface` occurrence, with the `@summary` beside it. */
export interface InterfaceDeclaration {
  id: string;
  name: string;
  transport: string;
  summary: string;
  file: string;
  line: number;
}

/** One `@participates` occurrence; the file's layer is the participant. */
export interface ParticipationDeclaration {
  file: string;
  line: number;
  interfaceId: string;
  role: "provides" | "consumes" | "implements";
}

export interface ScanResult {
  layers: Layer[];
  /** Repo-relative source file → layer id. */
  fileLayers: Map<string, string>;
  talksTo: TalksToDeclaration[];
  interfaces: InterfaceDeclaration[];
  participations: ParticipationDeclaration[];
  diagnostics: Diagnostic[];
}

export interface ScanOptions {
  repoRoot: string;
  packages: ArchitecturePackage[];
  ignoredDirectories: string[];
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
    for (const item of await readdir(absoluteDirectory, {
      withFileTypes: true,
    })) {
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
      const path = toPosix(relative(repoRoot, absolutePath));
      entries.push({
        path,
        absolutePath,
        directory: posix.dirname(path),
        name: item.name,
      });
    }
  };
  await visit(root);
  return entries.sort((left, right) => left.path.localeCompare(right.path));
};

/** `@audience` values, each checked against the three audiences. */
const readAudience = (
  value: string | undefined,
  file: string,
  line: number | undefined,
  diagnostics: Diagnostic[],
): Audience[] => {
  if (value === undefined) {
    return ["contributor"];
  }
  const audience: Audience[] = [];
  for (const word of value.split(/\s+/u).filter((entry) => entry !== "")) {
    const parsed = audienceSchema.safeParse(word);
    if (parsed.success) {
      audience.push(parsed.data);
    } else {
      diagnostics.push(
        error(
          file,
          `@audience \`${word}\` is not one of user, integrator, contributor`,
          line ?? null,
        ),
      );
    }
  }
  return audience.length === 0 ? ["contributor"] : audience;
};

/** The deepest declaring folder on the path from `directory` up to the root. */
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

export const scanDeclarations = async (
  options: ScanOptions,
): Promise<ScanResult> => {
  const { repoRoot, packages, ignoredFilePattern } = options;
  const ignoredDirectories = new Set(options.ignoredDirectories);
  const diagnostics: Diagnostic[] = [];
  const accumulators = new Map<string, LayerAccumulator>();
  const talksTo: TalksToDeclaration[] = [];
  const interfaces: InterfaceDeclaration[] = [];
  const participations: ParticipationDeclaration[] = [];
  const scopes = new Map<string, string>();
  const declaredBy = new Map<string, string>();

  const packageEntries = new Map<string, WalkEntry[]>();
  const isSourceEntry = (pkg: ArchitecturePackage, entry: WalkEntry): boolean =>
    sourceExtensionsFor(pkg).includes(extensionOf(entry.name));
  const isMarkdownEntry = (entry: WalkEntry): boolean =>
    entry.name.toLowerCase().endsWith(".md");
  const isPageEntry = (entry: WalkEntry): boolean =>
    entry.name.toLowerCase().endsWith(".mdx");
  const isDiagramEntry = (entry: WalkEntry): boolean =>
    entry.name.toLowerCase().endsWith(".d2");
  const isDocumentEntry = (entry: WalkEntry): boolean =>
    isMarkdownEntry(entry) || isPageEntry(entry) || isDiagramEntry(entry);

  for (const pkg of packages) {
    const entries = await walkFiles(
      join(repoRoot, sourceRootOf(pkg)),
      repoRoot,
      ignoredDirectories,
    );
    packageEntries.set(
      pkg.name,
      entries.filter(
        (entry) =>
          !ignoredFilePattern.test(entry.path) &&
          (isDocumentEntry(entry) || isSourceEntry(pkg, entry)),
      ),
    );
  }

  const register = (
    accumulator: Omit<
      LayerAccumulator,
      "files" | "lineCount" | "references" | "pages" | "diagrams"
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
      pages: [],
      diagrams: [],
      files: [],
      lineCount: 0,
    });
  };

  // Pass 1: collect declarations, so inheritance resolves in pass 2 whatever
  // the order files are visited in. Every file is read here once; pass 2
  // counts lines from the same text.
  const sources = new Map<string, string>();
  for (const pkg of packages) {
    for (const entry of packageEntries.get(pkg.name) ?? []) {
      if (isPageEntry(entry) || isDiagramEntry(entry)) {
        continue;
      }
      const contents = await readFile(entry.absolutePath, "utf8");
      sources.set(entry.path, contents);
      const lastSegment = (id: string): string => id.split(".").pop() ?? "";

      if (isMarkdownEntry(entry)) {
        const { declaration, body, errors } = parseFrontmatter(contents);
        for (const message of errors) {
          diagnostics.push(error(entry.path, message));
        }
        if (declaration) {
          register({
            id: declaration.layer,
            name: lastSegment(declaration.layer),
            package: pkg.name,
            role: declaration.role,
            declaredIn: entry.path,
            scope: entry.directory,
            prose: body === "" ? null : body,
            tags: declaration.tags ?? [],
            audience: declaration.audience ?? ["contributor"],
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
      for (const declaration of tags.talksTo) {
        talksTo.push({ file: entry.path, ...declaration });
      }
      if (tags.interface) {
        interfaces.push({
          ...tags.interface,
          summary: tags.summary?.value ?? "",
          file: entry.path,
        });
      }
      for (const declaration of tags.participates) {
        participations.push({ file: entry.path, ...declaration });
      }
      const audience = readAudience(
        tags.audience?.value,
        entry.path,
        tags.audience?.line,
        diagnostics,
      );
      if (tags.layerRoot) {
        const id = tags.layerRoot.value;
        register({
          id,
          name: lastSegment(id),
          package: pkg.name,
          role: tags.role?.value ?? "",
          declaredIn: entry.path,
          scope: entry.directory,
          prose: null,
          tags:
            tags.tags?.value.split(/\s+/u).filter((tag) => tag !== "") ?? [],
          audience,
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

  // Pass 2: resolve every file to its layer.
  const fileLayers = new Map<string, string>();
  for (const pkg of packages) {
    for (const entry of packageEntries.get(pkg.name) ?? []) {
      const layerId = resolveScope(entry.directory, scopes);
      if (isMarkdownEntry(entry)) {
        const accumulator =
          layerId === null ? undefined : accumulators.get(layerId);
        if (accumulator && accumulator.declaredIn !== entry.path) {
          accumulator.references.push(entry.path);
        }
        continue;
      }
      if (isPageEntry(entry) || isDiagramEntry(entry)) {
        const accumulator =
          layerId === null ? undefined : accumulators.get(layerId);
        if (accumulator === undefined) {
          diagnostics.push(
            error(
              entry.path,
              `no layer resolves for this ${isPageEntry(entry) ? "page" : "diagram"}; it belongs beside code a layer claims, or under the content directory`,
            ),
          );
        } else if (isPageEntry(entry)) {
          accumulator.pages.push(entry.path);
        } else {
          accumulator.diagrams.push(entry.path);
        }
        continue;
      }
      if (layerId === null) {
        diagnostics.push(
          error(
            entry.path,
            `no layer resolves for this file — declare one on ${entry.directory} or an ancestor (README frontmatter or @layerRoot)`,
          ),
        );
        continue;
      }
      const accumulator = accumulators.get(layerId);
      if (!accumulator) {
        continue;
      }
      accumulator.files.push(entry.path);
      accumulator.lineCount += countNonBlankLines(
        sources.get(entry.path) ?? "",
      );
      fileLayers.set(entry.path, layerId);
    }
  }

  // Every layer is validated here so the model never carries an invalid one;
  // invalid layers stay in the result, since the build refuses to write while
  // an error stands and dropping them would orphan their files.
  const layers: Layer[] = [...accumulators.values()]
    .map((accumulator): Layer => {
      const candidate: Layer = {
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
        pages: accumulator.pages.sort((left, right) =>
          left.localeCompare(right),
        ),
        diagrams: accumulator.diagrams.sort((left, right) =>
          left.localeCompare(right),
        ),
        files: accumulator.files,
        fileCount: accumulator.files.length,
        lineCount: accumulator.lineCount,
        tags: accumulator.tags,
        audience: accumulator.audience,
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
      return candidate;
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    layers,
    fileLayers,
    talksTo,
    interfaces,
    participations,
    diagnostics,
  };
};
