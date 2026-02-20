import ts from "typescript";

import type { SDCPN } from "../../core/types/sdcpn";
import { createLanguageServiceHost } from "./create-language-service-host";
import { generateVirtualFiles } from "./generate-virtual-files";

export type SDCPNLanguageService = ts.LanguageService & {
  updateFileContent: (fileName: string, content: string) => void;
};

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
  const { host, updateFileContent } = createLanguageServiceHost(files);
  const baseService = ts.createLanguageService(host);

  // Proxy service to adjust positions for injected prefixes
  return {
    ...baseService,

    updateFileContent,

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

    getQuickInfoAtPosition(fileName, position) {
      const entry = files.get(fileName);
      const prefixLength = entry?.prefix?.length ?? 0;
      const info = baseService.getQuickInfoAtPosition(
        fileName,
        position + prefixLength,
      );
      if (!info) {
        return undefined;
      }
      return {
        ...info,
        textSpan: {
          start: info.textSpan.start - prefixLength,
          length: info.textSpan.length,
        },
      };
    },

    getSignatureHelpItems(fileName, position, options) {
      const entry = files.get(fileName);
      const prefixLength = entry?.prefix?.length ?? 0;
      return baseService.getSignatureHelpItems(
        fileName,
        position + prefixLength,
        options,
      );
    },
  };
}
