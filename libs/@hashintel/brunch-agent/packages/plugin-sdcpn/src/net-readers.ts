import * as v from "valibot";

import { getLatestNetDefinitionToolName } from "@hashintel/petrinaut-core/ai";

/** Filtered views of `getLatestNetDefinition`, executed by the bound browser. */
export const netReaderToolNames = {
  outline: "readNetOutline",
  structure: "readNetStructure",
} as const;

export type NetReaderLevel = keyof typeof netReaderToolNames;

export const netReaderInputSchema = v.strictObject({});

export const parseNetReaderInput = (value: unknown) =>
  v.parse(netReaderInputSchema, value);

export const netReaderDescriptions: Record<NetReaderLevel, string> = {
  outline:
    "Read a compact outline of the current net: ids, names and core properties of places, transitions with their input and output arcs, token types, parameters, equations, scenarios, metrics, subnets and component instances. Code bodies, canvas positions and visual settings are left out. Returns { title, definition, extensions }.",
  structure:
    "Read the current net's structure with every core property, including lambda, kernel, equation, scenario and metric code. Canvas positions, visualizer code, icons, colours and host metadata are left out. Returns { title, definition, extensions }.",
};

export const netReaderLevelOf = (
  toolName: string,
): NetReaderLevel | undefined =>
  toolName === netReaderToolNames.outline
    ? "outline"
    : toolName === netReaderToolNames.structure
      ? "structure"
      : undefined;

/** Tools whose settled result shows the model the net's current structure. */
export const isNetObservationTool = (toolName: string): boolean =>
  toolName === getLatestNetDefinitionToolName ||
  netReaderLevelOf(toolName) !== undefined;

const presentationalKeys: ReadonlySet<string> = new Set([
  "x",
  "y",
  "visualizerCode",
  "showAsInitialState",
  "iconSlug",
  "displayColor",
  "metadata",
]);

const isCodeKey = (key: string) => key === "code" || key.endsWith("Code");

/**
 * Drop presentational fields at every depth; the outline also drops code.
 * Everything else the definition carries passes through, so new core fields
 * appear without changes here.
 */
export const projectNetDefinition = (
  value: unknown,
  level: NetReaderLevel,
): unknown => {
  if (Array.isArray(value))
    return value.map((entry) => projectNetDefinition(entry, level));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      presentationalKeys.has(key) || (level === "outline" && isCodeKey(key))
        ? []
        : [[key, projectNetDefinition(entry, level)]],
    ),
  );
};
