import * as ts from "typescript";
import libEs2015Core from "typescript/lib/lib.es2015.core.d.ts?raw";
import libEs5 from "typescript/lib/lib.es5.d.ts?raw";

/** Bundled TypeScript lib files for browser compatibility */
const BUNDLED_LIBS: Record<string, string> = {
  "lib.es5.d.ts": libEs5,
  "lib.es2015.core.d.ts": libEs2015Core,
};

/** TypeScript compiler options for SDCPN code checking */
const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  lib: ["lib.es5.d.ts", "lib.es2015.core.d.ts"],
};

/** Virtual file entry with optional prefix (for injected declarations) */
export type VirtualFile = {
  prefix?: string;
  content: string;
};

/** Creates a TypeScript LanguageServiceHost for virtual SDCPN files */
export function createLanguageServiceHost(
  files: Map<string, VirtualFile>,
): ts.LanguageServiceHost {
  const getFileContent = (fileName: string): string | undefined => {
    const entry = files.get(fileName);
    if (entry) {
      return (entry.prefix ?? "") + entry.content;
    }
    // Check bundled lib files
    const libName = fileName.split("/").pop() ?? fileName;
    return BUNDLED_LIBS[libName];
  };

  return {
    getScriptFileNames: () => [...files.keys()],
    getCompilationSettings: () => COMPILER_OPTIONS,
    getScriptVersion: () => "0",
    getCurrentDirectory: () => "",
    getDefaultLibFileName: () => ts.getDefaultLibFilePath(COMPILER_OPTIONS),

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

    // Custom module resolution for virtual files
    resolveModuleNames(moduleNames: string[], containingFile: string) {
      return moduleNames.map((moduleName) => {
        if (!moduleName.startsWith(".")) {
          return undefined;
        }

        // Resolve relative path
        const dir = containingFile.substring(
          0,
          containingFile.lastIndexOf("/"),
        );
        const parts = [...dir.split("/"), ...moduleName.split("/")];
        const resolved: string[] = [];

        for (const part of parts) {
          if (part === "..") {
            resolved.pop();
          } else if (part !== ".") {
            resolved.push(part);
          }
        }

        const resolvedPath = resolved.join("/");
        return files.has(resolvedPath)
          ? { resolvedFileName: resolvedPath, isExternalLibraryImport: false }
          : undefined;
      });
    },
  };
}
