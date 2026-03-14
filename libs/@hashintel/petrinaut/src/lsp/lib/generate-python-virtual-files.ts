import type { SDCPN } from "../../core/types/sdcpn";
import type { VirtualFile } from "./create-language-service-host";
import { getItemFilePath } from "./file-paths";

/**
 * Maps SDCPN element types to Python type annotation strings
 */
function toPythonType(type: "real" | "integer" | "boolean"): string {
  switch (type) {
    case "real":
      return "float";
    case "integer":
      return "int";
    case "boolean":
      return "bool";
  }
}

/**
 * Sanitizes a color ID to be a valid Python identifier.
 */
function sanitizeColorId(colorId: string): string {
  return colorId.replace(/[^a-zA-Z0-9_]/g, "");
}

/**
 * Generates virtual Python files (.py / .pyi) for all SDCPN entities.
 *
 * This parallels `generateVirtualFiles` (TypeScript) but emits Python code
 * with TypedDict type stubs for Pyright type checking in the browser.
 */
export function generatePythonVirtualFiles(
  sdcpn: SDCPN,
): Map<string, VirtualFile> {
  const files = new Map<string, VirtualFile>();

  // Build lookup maps
  const placeById = new Map(sdcpn.places.map((place) => [place.id, place]));
  const colorById = new Map(sdcpn.types.map((color) => [color.id, color]));

  // Generate global SDCPN library stub
  files.set(getItemFilePath("sdcpn-lib-defs", undefined, "python"), {
    content: [
      `from typing import TypedDict, Callable`,
      `import math`,
      ``,
      `class Distribution:`,
      `    def map(self, fn: Callable[[float], float]) -> "Distribution": ...`,
      ``,
      `    @staticmethod`,
      `    def Gaussian(mean: float, deviation: float) -> "Distribution": ...`,
      ``,
      `    @staticmethod`,
      `    def Uniform(min: float, max: float) -> "Distribution": ...`,
      ``,
      `    @staticmethod`,
      `    def Lognormal(mu: float, sigma: float) -> "Distribution": ...`,
    ].join("\n"),
  });

  // Generate parameters TypedDict
  const parametersFields = sdcpn.parameters
    .map((param) => `    ${param.variableName}: ${toPythonType(param.type)}`)
    .join("\n");

  files.set(getItemFilePath("parameters-defs", undefined, "python"), {
    content: [
      `from typing import TypedDict`,
      ``,
      `class Parameters(TypedDict):`,
      parametersFields || `    pass`,
    ].join("\n"),
  });

  // Generate TypedDict for each color
  for (const color of sdcpn.types) {
    const sanitizedId = sanitizeColorId(color.id);
    const fields = color.elements
      .map((el) => `    ${el.name}: ${toPythonType(el.type)}`)
      .join("\n");

    files.set(getItemFilePath("color-defs", { colorId: color.id }, "python"), {
      content: [
        `from typing import TypedDict`,
        ``,
        `class Color_${sanitizedId}(TypedDict):`,
        fields || `    pass`,
      ].join("\n"),
    });
  }

  // Generate files for each differential equation
  for (const de of sdcpn.differentialEquations) {
    const sanitizedId = sanitizeColorId(de.colorId);
    const deDefsPath = getItemFilePath(
      "differential-equation-defs",
      { id: de.id },
      "python",
    );
    const deCodePath = getItemFilePath(
      "differential-equation-code",
      { id: de.id },
      "python",
    );

    // Type stubs
    files.set(deDefsPath, {
      content: [
        `from typing import List`,
        `from parameters.defs import Parameters`,
        `from colors.${sanitizeColorId(de.colorId)}.defs import Color_${sanitizedId}`,
        ``,
        `Tokens = List[Color_${sanitizedId}]`,
      ].join("\n"),
    });

    // User code file
    files.set(deCodePath, {
      prefix: [
        `from typing import List`,
        `from sdcpn_lib import Distribution, math`,
        ``,
      ].join("\n"),
      content: de.code,
    });
  }

  // Generate files for each transition
  for (const transition of sdcpn.transitions) {
    const lambdaDefsPath = getItemFilePath(
      "transition-lambda-defs",
      { transitionId: transition.id },
      "python",
    );
    const lambdaCodePath = getItemFilePath(
      "transition-lambda-code",
      { transitionId: transition.id },
      "python",
    );
    const kernelDefsPath = getItemFilePath(
      "transition-kernel-defs",
      { transitionId: transition.id },
      "python",
    );
    const kernelCodePath = getItemFilePath(
      "transition-kernel-code",
      { transitionId: transition.id },
      "python",
    );

    // Build input type
    const inputFields: string[] = [];
    for (const arc of transition.inputArcs) {
      const place = placeById.get(arc.placeId);
      if (!place?.colorId) continue;
      const color = colorById.get(place.colorId);
      if (!color) continue;
      const sanitizedId = sanitizeColorId(color.id);
      inputFields.push(`    ${place.name}: List[Color_${sanitizedId}]`);
    }

    // Build output type
    const outputFields: string[] = [];
    for (const arc of transition.outputArcs) {
      const place = placeById.get(arc.placeId);
      if (!place?.colorId) continue;
      const color = colorById.get(place.colorId);
      if (!color) continue;
      const sanitizedId = sanitizeColorId(color.id);
      outputFields.push(`    ${place.name}: List[Color_${sanitizedId}]`);
    }

    const lambdaReturnType =
      transition.lambdaType === "predicate" ? "bool" : "float";

    // Lambda defs
    files.set(lambdaDefsPath, {
      content: [
        `from typing import TypedDict, List`,
        `from parameters.defs import Parameters`,
        ``,
        inputFields.length > 0
          ? `class Input(TypedDict):\n${inputFields.join("\n")}`
          : `Input = dict`,
        ``,
        `# Lambda should return ${lambdaReturnType}`,
      ].join("\n"),
    });

    // Lambda code
    files.set(lambdaCodePath, {
      prefix: [`from sdcpn_lib import Distribution, math`, ``].join("\n"),
      content: transition.lambdaCode,
    });

    // Kernel defs
    files.set(kernelDefsPath, {
      content: [
        `from typing import TypedDict, List`,
        `from parameters.defs import Parameters`,
        ``,
        inputFields.length > 0
          ? `class Input(TypedDict):\n${inputFields.join("\n")}`
          : `Input = dict`,
        ``,
        outputFields.length > 0
          ? `class Output(TypedDict):\n${outputFields.join("\n")}`
          : `Output = dict`,
      ].join("\n"),
    });

    // Kernel code
    files.set(kernelCodePath, {
      prefix: [`from sdcpn_lib import Distribution, math`, ``].join("\n"),
      content: transition.transitionKernelCode,
    });
  }

  return files;
}
