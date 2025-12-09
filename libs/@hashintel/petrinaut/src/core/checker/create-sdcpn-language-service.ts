import ts from "typescript";

import type { SDCPN } from "../types/sdcpn";
import {
  createLanguageServiceHost,
  type VirtualFile,
} from "./create-language-service-host";

export type SDCPNLanguageService = ts.LanguageService;

/**
 * Maps SDCPN element types to TypeScript types
 */
function toTsType(type: "real" | "integer" | "boolean"): string {
  return type === "boolean" ? "boolean" : "number";
}

/**
 * Generates virtual files for all SDCPN entities
 */
function generateVirtualFiles(sdcpn: SDCPN): Map<string, VirtualFile> {
  const files = new Map<string, VirtualFile>();

  // Generate parameters type definition
  const parametersProperties = sdcpn.parameters
    .map((param) => `  "${param.variableName}": ${toTsType(param.type)};`)
    .join("\n");

  files.set("parameters/defs.d.ts", {
    content: `export type Parameters = {\n${parametersProperties}\n};`,
  });

  // Generate type definitions for each color
  for (const color of sdcpn.types) {
    const properties = color.elements
      .map((el) => `  ${el.name}: ${toTsType(el.type)};`)
      .join("\n");

    files.set(`colors/${color.id}/defs.d.ts`, {
      content: `export type Color_${color.id} = {\n${properties}\n}`,
    });
  }

  // Generate files for each differential equation
  for (const de of sdcpn.differentialEquations) {
    // Type definitions file
    files.set(`differential_equations/${de.id}/defs.d.ts`, {
      content: [
        `import type { Color_${de.colorId} } from "../../colors/${de.colorId}/defs.d.ts";`,
        `export type Tokens = Array<Color_${de.colorId}>;`,
      ].join("\n"),
    });

    // User code file with injected declarations
    files.set(`differential_equations/${de.id}/code.ts`, {
      prefix: [
        `import type { Parameters } from "../../parameters/defs.d.ts";`,
        `import type { Tokens } from "./defs.d.ts";`,
        // TODO: Directly wrap user code in Dynamics call to remove need for user to do it.
        `declare function Dynamics(fn: (tokens: Tokens, parameters: Parameters) => void ): void;`,
        "",
      ].join("\n"),
      content: de.code,
    });
  }

  return files;
}

/**
 * Adjusts diagnostic positions to account for injected prefix
 */
function adjustDiagnostics<T extends ts.Diagnostic>(
  diagnostics: readonly T[],
  prefixLength: number,
): T[] {
  return diagnostics.map((diag) => ({
    ...diag,
    start: diag.start !== undefined ? diag.start - prefixLength : undefined,
  }));
}

/**
 * Creates a TypeScript language service for SDCPN code validation.
 *
 * @param sdcpn - The SDCPN model to create the service for
 * @returns A TypeScript LanguageService instance
 */
export function createSDCPNLanguageService(sdcpn: SDCPN): SDCPNLanguageService {
  const files = generateVirtualFiles(sdcpn);
  const host = createLanguageServiceHost(files);
  const baseService = ts.createLanguageService(host);

  // Proxy service to adjust positions for injected prefixes
  return {
    ...baseService,

    getSemanticDiagnostics(fileName) {
      const entry = files.get(fileName);
      const prefixLength = entry?.prefix?.length ?? 0;
      const diagnostics = baseService.getSemanticDiagnostics(fileName);
      return adjustDiagnostics(diagnostics, prefixLength);
    },

    getSyntacticDiagnostics(fileName) {
      const entry = files.get(fileName);
      const prefixLength = entry?.prefix?.length ?? 0;
      const diagnostics = baseService.getSyntacticDiagnostics(fileName);
      return adjustDiagnostics(diagnostics, prefixLength);
    },

    getCompletionsAtPosition(fileName, position, options) {
      const entry = files.get(fileName);
      const prefixLength = entry?.prefix?.length ?? 0;
      return baseService.getCompletionsAtPosition(
        fileName,
        position + prefixLength,
        options,
      );
    },
  };
}
