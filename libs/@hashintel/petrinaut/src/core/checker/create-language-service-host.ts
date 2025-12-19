import * as ts from "typescript";
import libEs5 from "typescript/lib/lib.es5.d.ts?raw";
import libEs2015Core from "typescript/lib/lib.es2015.core.d.ts?raw";
import libEs2015Iterable from "typescript/lib/lib.es2015.iterable.d.ts?raw";
import libEs2015Symbol from "typescript/lib/lib.es2015.symbol.d.ts?raw";

/** Bundled TypeScript lib files (with absolute paths) */
const BUNDLED_LIBS: Record<string, string> = {
  "/lib.es5.d.ts": libEs5,
  "/lib.es2015.core.d.ts": libEs2015Core,
  "/lib.es2015.symbol.d.ts": libEs2015Symbol,
  "/lib.es2015.iterable.d.ts": libEs2015Iterable,
};

/** TypeScript compiler options for SDCPN code checking */
const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2015,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  lib: [
    "lib.es5.d.ts",
    "lib.es2015.core.d.ts",
    "lib.es2015.symbol.d.ts",
    "lib.es2015.iterable.d.ts",
  ],
  // Use root as base URL for absolute imports
  baseUrl: "/",
  // Disable automatic type resolution to avoid Node.js-specific APIs in browser
  typeRoots: [],
  types: [],
};

/** Virtual file entry with optional prefix (for injected declarations) */
export type VirtualFile = {
  prefix?: string;
  content: string;
};

/**
 * @private Used by `createSDCPNLanguageService`.
 *
 * Creates a TypeScript LanguageServiceHost for virtual SDCPN files
 */
export function createLanguageServiceHost(
  files: Map<string, VirtualFile>,
): ts.LanguageServiceHost {
  const getFileContent = (fileName: string): string | undefined => {
    const entry = files.get(fileName);
    if (entry) {
      return (entry.prefix ?? "") + entry.content;
    }
    // Check bundled lib files (try both absolute path and just filename)
    if (BUNDLED_LIBS[fileName]) {
      return BUNDLED_LIBS[fileName];
    }
    // Fallback: extract lib filename and try with absolute path
    const libName = fileName.split("/").pop();
    if (libName) {
      return BUNDLED_LIBS[`/${libName}`];
    }
    return undefined;
  };

  return {
    getScriptFileNames: () => [...files.keys()],
    getCompilationSettings: () => COMPILER_OPTIONS,
    getScriptVersion: () => "0",
    getCurrentDirectory: () => "/",
    getDefaultLibFileName: () => "/lib.es2015.core.d.ts",

    getScriptSnapshot(fileName: string) {
      const content = getFileContent(fileName);
      return content ? ts.ScriptSnapshot.fromString(content) : undefined;
    },

    fileExists(path: string) {
      return getFileContent(path) !== undefined;
    },

    readFile(path: string) {
      return getFileContent(path);
    },
  };
}
