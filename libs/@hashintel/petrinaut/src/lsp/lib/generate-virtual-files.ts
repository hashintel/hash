import type { SDCPN, ScenarioParameter } from "../../core/types/sdcpn";
import type { VirtualFile } from "./create-language-service-host";
import { getItemFilePath } from "./file-paths";

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
function toTsType(type: "real" | "integer" | "boolean" | "ratio"): string {
  return type === "boolean" ? "boolean" : "number";
}

/**
 * Generates virtual files for all SDCPN entities
 */
export function generateVirtualFiles(sdcpn: SDCPN): Map<string, VirtualFile> {
  const files = new Map<string, VirtualFile>();

  // Generate global SDCPN library definitions
  files.set(getItemFilePath("sdcpn-lib-defs"), {
    content: [
      `type Distribution = { map(fn: (value: number) => number): Distribution };`,
      `type Probabilistic<T> = { [K in keyof T]: T[K] extends number ? number | Distribution : T[K] };`,
      `declare namespace Distribution {`,
      `  function Gaussian(mean: number, deviation: number): Distribution;`,
      `  function Uniform(min: number, max: number): Distribution;`,
      `  function Lognormal(mu: number, sigma: number): Distribution;`,
      `}`,
    ].join("\n"),
  });

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
      // Inhibitor arcs never deliver tokens to the transition, so they should
      // not contribute to the input type.
      if (arc.type === "inhibitor") {
        continue;
      }
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
        .fill(`Probabilistic<Color_${sanitizedColorId}>`)
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
 * Data required to generate virtual files for a scenario editing session.
 */
export type ScenarioSessionData = {
  sessionId: string;
  scenarioParameters: ScenarioParameter[];
  /** Parameter ID → expression string */
  parameterOverrides: Record<string, string>;
  /** Place ID → expression string (used when initialStateAsCode is false) */
  initialState: Record<string, string>;
  /** Full code for "Define as code" initial state mode (used when initialStateAsCode is true) */
  initialStateCode?: string;
  /** Which initial state mode is active. Only the active mode's files are generated. */
  initialStateAsCode: boolean;
};

/**
 * Generates virtual files for a scenario editing session.
 *
 * Each parameter override and initial state expression gets its own code file
 * wrapped so the expression is type-checked as the correct return type.
 */
export function generateScenarioSessionFiles(
  sdcpn: SDCPN,
  session: ScenarioSessionData,
): Map<string, VirtualFile> {
  const files = new Map<string, VirtualFile>();
  const { sessionId } = session;

  const parametersDefsPath = getItemFilePath("parameters-defs");

  // Build scenario object type: { hello: number; world: boolean; ... }
  const scenarioProps = session.scenarioParameters
    .filter((p) => p.identifier.trim() !== "")
    .map((p) => `  "${p.identifier}": ${toTsType(p.type)};`)
    .join("\n");

  const scenarioTypeDecl =
    scenarioProps.length > 0
      ? `declare const scenario: {\n${scenarioProps}\n};`
      : `declare const scenario: Record<string, never>;`;

  const commonPrefix = [
    `import type { Parameters } from "${parametersDefsPath}";`,
    `declare const parameters: Parameters;`,
    scenarioTypeDecl,
  ].join("\n");

  // Generate defs file (shared declarations for this session)
  const defsPath = getItemFilePath("scenario-session-defs", { sessionId });
  files.set(defsPath, {
    content: commonPrefix,
  });

  // Generate code files for parameter overrides
  const paramById = new Map(sdcpn.parameters.map((p) => [p.id, p]));
  for (const [paramId, expression] of Object.entries(
    session.parameterOverrides,
  )) {
    const param = paramById.get(paramId);
    if (!param) {
      continue;
    }
    // Skip empty expressions — they fall back to the parameter's default value
    // at runtime, so there's nothing for the LSP to lint.
    if (expression.trim() === "") {
      continue;
    }
    const returnType = toTsType(param.type);
    const filePath = getItemFilePath("scenario-param-override-code", {
      sessionId,
      paramId,
    });
    files.set(filePath, {
      prefix: `${commonPrefix}\nfunction __check(): ${returnType} { return (\n`,
      content: expression,
      suffix: `\n); }`,
    });
  }

  // Generate full code file for "Define as code" initial state — only when
  // that mode is active so we don't lint stale code from the inactive mode.
  if (session.initialStateAsCode && session.initialStateCode !== undefined) {
    // Build return type: { "PlaceName"?: TokenType[], ... }
    const colorById = new Map(sdcpn.types.map((c) => [c.id, c]));
    const initialStateTypeImports: string[] = [];
    const initialStateTypeProperties: string[] = [];

    for (const place of sdcpn.places) {
      let elementType: string;
      if (place.colorId) {
        const color = colorById.get(place.colorId);
        if (color) {
          const sanitized = sanitizeColorId(color.id);
          const colorDefsPath = getItemFilePath("color-defs", {
            colorId: color.id,
          });
          const importStatement = `import type { Color_${sanitized} } from "${colorDefsPath}";`;
          if (!initialStateTypeImports.includes(importStatement)) {
            initialStateTypeImports.push(importStatement);
          }
          elementType = `Color_${sanitized}[]`;
        } else {
          elementType = "number";
        }
      } else {
        elementType = "number";
      }
      initialStateTypeProperties.push(`  "${place.name}"?: ${elementType};`);
    }

    const initialStateReturnType =
      initialStateTypeProperties.length > 0
        ? `{\n${initialStateTypeProperties.join("\n")}\n}`
        : "Record<string, never>";

    const fullCodePrefix = [
      commonPrefix,
      ...initialStateTypeImports,
      `type InitialState = ${initialStateReturnType};`,
      `function __check(): InitialState {`,
    ].join("\n");

    const filePath = getItemFilePath("scenario-initial-state-full-code", {
      sessionId,
    });
    files.set(filePath, {
      prefix: `${fullCodePrefix}\n`,
      content: session.initialStateCode,
      suffix: `\n}`,
    });
  }

  // Generate code files for per-place initial state expressions — only when
  // that mode is active.
  if (!session.initialStateAsCode) {
    for (const [placeId, expression] of Object.entries(session.initialState)) {
      // Skip empty expressions — they fall back to 0 tokens at runtime.
      if (expression.trim() === "") {
        continue;
      }
      const filePath = getItemFilePath("scenario-initial-state-code", {
        sessionId,
        placeId,
      });
      // Initial state expressions for simple places return a number (token count)
      files.set(filePath, {
        prefix: `${commonPrefix}\nfunction __check(): number { return (\n`,
        content: expression,
        suffix: `\n); }`,
      });
    }
  }

  return files;
}
