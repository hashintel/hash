import ts from "typescript";

import type { SDCPN } from "../types/sdcpn";
import {
  createLanguageServiceHost,
  type VirtualFile,
} from "./create-language-service-host";
import { getItemFilePath } from "./file-paths";

export type SDCPNLanguageService = ts.LanguageService;

/**
 * Sanitizes a color ID to be a valid TypeScript identifier.
 * Removes all characters that are not valid suffixes for TypeScript identifiers
 * (keeps only letters, digits, and underscores).
 */
function sanitizeColorId(colorId: string): string {
  return colorId.replace(/[^a-zA-Z0-9_]/g, "");
}

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

  // Build lookup maps for places and types
  const placeById = new Map(sdcpn.places.map((place) => [place.id, place]));
  const colorById = new Map(sdcpn.types.map((color) => [color.id, color]));

  // Generate parameters type definition
  const parametersProperties = sdcpn.parameters
    .map((param) => `  "${param.variableName}": ${toTsType(param.type)};`)
    .join("\n");

  files.set(getItemFilePath("parameters-defs"), {
    content: `export type Parameters = {\n${parametersProperties}\n};`,
  });

  // Generate type definitions for each color
  for (const color of sdcpn.types) {
    const sanitizedColorId = sanitizeColorId(color.id);
    const properties = color.elements
      .map((el) => `  ${el.name}: ${toTsType(el.type)};`)
      .join("\n");

    files.set(getItemFilePath("color-defs", { colorId: color.id }), {
      content: `export type Color_${sanitizedColorId} = {\n${properties}\n}`,
    });
  }

  // Generate files for each differential equation
  for (const de of sdcpn.differentialEquations) {
    const sanitizedColorId = sanitizeColorId(de.colorId);
    const deDefsPath = getItemFilePath("differential-equation-defs", {
      id: de.id,
    });
    const deCodePath = getItemFilePath("differential-equation-code", {
      id: de.id,
    });
    const parametersDefsPath = getItemFilePath("parameters-defs");
    const colorDefsPath = getItemFilePath("color-defs", {
      colorId: de.colorId,
    });

    // Type definitions file
    files.set(deDefsPath, {
      content: [
        `import type { Parameters } from "${parametersDefsPath}";`,
        `import type { Color_${sanitizedColorId} } from "${colorDefsPath}";`,
        ``,
        `type Tokens = Array<Color_${sanitizedColorId}>;`,
        `export type Dynamics = (fn: (tokens: Tokens, parameters: Parameters) => Tokens) => void;`,
      ].join("\n"),
    });

    // User code file with injected declarations
    files.set(deCodePath, {
      prefix: [
        `import type { Dynamics } from "${deDefsPath}";`,
        // TODO: Directly wrap user code in Dynamics call to remove need for user to write it.
        `declare const Dynamics: Dynamics;`,
        "",
      ].join("\n"),
      content: de.code,
    });
  }

  // Generate files for each transition
  for (const transition of sdcpn.transitions) {
    const parametersDefsPath = getItemFilePath("parameters-defs");
    const lambdaDefsPath = getItemFilePath("transition-lambda-defs", {
      transitionId: transition.id,
    });
    const lambdaCodePath = getItemFilePath("transition-lambda-code", {
      transitionId: transition.id,
    });
    const kernelDefsPath = getItemFilePath("transition-kernel-defs", {
      transitionId: transition.id,
    });
    const kernelCodePath = getItemFilePath("transition-kernel-code", {
      transitionId: transition.id,
    });

    // Build input type: { [placeName]: [Token, Token, ...] } based on input arcs
    const inputTypeImports: string[] = [];
    const inputTypeProperties: string[] = [];

    for (const arc of transition.inputArcs) {
      const place = placeById.get(arc.placeId);
      if (!place?.colorId) {
        continue;
      }
      const color = colorById.get(place.colorId);
      if (!color) {
        continue;
      }

      const sanitizedColorId = sanitizeColorId(color.id);
      const colorDefsPath = getItemFilePath("color-defs", {
        colorId: color.id,
      });
      // Only add import if not already present (multiple arcs may share the same color)
      const importStatement = `import type { Color_${sanitizedColorId} } from "${colorDefsPath}";`;
      if (!inputTypeImports.includes(importStatement)) {
        inputTypeImports.push(importStatement);
      }
      const tokenTuple = Array.from({ length: arc.weight })
        .fill(`Color_${sanitizedColorId}`)
        .join(", ");
      inputTypeProperties.push(`  "${place.name}": [${tokenTuple}];`);
    }

    // Build output type: { [placeName]: [Token, Token, ...] } based on output arcs
    const outputTypeImports: string[] = [];
    const outputTypeProperties: string[] = [];

    for (const arc of transition.outputArcs) {
      const place = placeById.get(arc.placeId);
      if (!place?.colorId) {
        continue;
      }
      const color = colorById.get(place.colorId);
      if (!color) {
        continue;
      }

      const sanitizedColorId = sanitizeColorId(color.id);
      const colorDefsPath = getItemFilePath("color-defs", {
        colorId: color.id,
      });
      // Only add import if not already present from input arcs or previous output arcs
      const importStatement = `import type { Color_${sanitizedColorId} } from "${colorDefsPath}";`;
      if (
        !inputTypeImports.includes(importStatement) &&
        !outputTypeImports.includes(importStatement)
      ) {
        outputTypeImports.push(importStatement);
      }
      const tokenTuple = Array.from({ length: arc.weight })
        .fill(`Color_${sanitizedColorId}`)
        .join(", ");
      outputTypeProperties.push(`  "${place.name}": [${tokenTuple}];`);
    }

    const allImports = [...inputTypeImports, ...outputTypeImports];
    const inputType =
      inputTypeProperties.length > 0
        ? `{\n${inputTypeProperties.join("\n")}\n}`
        : "Record<string, never>";
    const outputType =
      outputTypeProperties.length > 0
        ? `{\n${outputTypeProperties.join("\n")}\n}`
        : "Record<string, never>";
    const lambdaReturnType =
      transition.lambdaType === "predicate" ? "boolean" : "number";

    // Lambda definitions file
    files.set(lambdaDefsPath, {
      content: [
        `import type { Parameters } from "${parametersDefsPath}";`,
        ...allImports,
        ``,
        `export type Input = ${inputType};`,
        `export type Lambda = (fn: (input: Input, parameters: Parameters) => ${lambdaReturnType}) => void;`,
      ].join("\n"),
    });

    // Lambda code file
    files.set(lambdaCodePath, {
      prefix: [
        `import type { Lambda } from "${lambdaDefsPath}";`,
        `declare const Lambda: Lambda;`,
        "",
      ].join("\n"),
      content: transition.lambdaCode,
    });

    // TransitionKernel definitions file
    files.set(kernelDefsPath, {
      content: [
        `import type { Parameters } from "${parametersDefsPath}";`,
        ...allImports,
        ``,
        `export type Input = ${inputType};`,
        `export type Output = ${outputType};`,
        `export type TransitionKernel = (fn: (input: Input, parameters: Parameters) => Output) => void;`,
      ].join("\n"),
    });

    // TransitionKernel code file
    files.set(kernelCodePath, {
      prefix: [
        `import type { TransitionKernel } from "${kernelDefsPath}";`,
        `declare const TransitionKernel: TransitionKernel;`,
        "",
      ].join("\n"),
      content: transition.transitionKernelCode,
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
