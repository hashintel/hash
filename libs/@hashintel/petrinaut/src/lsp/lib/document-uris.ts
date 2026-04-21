/**
 * Single source of truth for mapping between:
 * - Document URIs (`inmemory://sdcpn/...`) used by Monaco and the LSP protocol
 * - Internal file paths (`/transitions/.../code.ts`) used by the TS LanguageService
 * - Item types + IDs used by the SDCPN domain model
 */
import type { ItemType } from "./checker";
import { getItemFilePath } from "./file-paths";

// ---------------------------------------------------------------------------
// Scenario item types
// ---------------------------------------------------------------------------

export type ScenarioItemType =
  | "scenario-param-override"
  | "scenario-initial-state"
  | "scenario-initial-state-full-code";

// ---------------------------------------------------------------------------
// URI construction
// ---------------------------------------------------------------------------

/** Build a document URI for a given SDCPN item (used as Monaco model URI). */
export function getDocumentUri(itemType: ItemType, itemId: string): string {
  switch (itemType) {
    case "transition-lambda":
      return `inmemory://sdcpn/transitions/${itemId}/lambda.ts`;
    case "transition-kernel":
      return `inmemory://sdcpn/transitions/${itemId}/kernel.ts`;
    case "differential-equation":
      return `inmemory://sdcpn/differential-equations/${itemId}.ts`;
  }
}

/** Build a document URI for a scenario expression (used as Monaco model URI). */
export function getScenarioDocumentUri(
  itemType: ScenarioItemType,
  sessionId: string,
  itemId: string,
): string {
  switch (itemType) {
    case "scenario-param-override":
      return `inmemory://sdcpn/_temp/scenarios/${sessionId}/param-overrides/${itemId}.ts`;
    case "scenario-initial-state":
      return `inmemory://sdcpn/_temp/scenarios/${sessionId}/initial-state/${itemId}.ts`;
    case "scenario-initial-state-full-code":
      return `inmemory://sdcpn/_temp/scenarios/${sessionId}/initial-state-code.ts`;
  }
}

// ---------------------------------------------------------------------------
// URI regex patterns
// ---------------------------------------------------------------------------

const TRANSITION_LAMBDA_URI_RE =
  /^inmemory:\/\/sdcpn\/transitions\/([^/]+)\/lambda\.ts$/;
const TRANSITION_KERNEL_URI_RE =
  /^inmemory:\/\/sdcpn\/transitions\/([^/]+)\/kernel\.ts$/;
const DE_URI_RE = /^inmemory:\/\/sdcpn\/differential-equations\/([^/]+)\.ts$/;

const SCENARIO_PARAM_OVERRIDE_URI_RE =
  /^inmemory:\/\/sdcpn\/_temp\/scenarios\/([^/]+)\/param-overrides\/([^/]+)\.ts$/;
const SCENARIO_INITIAL_STATE_URI_RE =
  /^inmemory:\/\/sdcpn\/_temp\/scenarios\/([^/]+)\/initial-state\/([^/]+)\.ts$/;
const SCENARIO_INITIAL_STATE_FULL_CODE_URI_RE =
  /^inmemory:\/\/sdcpn\/_temp\/scenarios\/([^/]+)\/initial-state-code\.ts$/;

// ---------------------------------------------------------------------------
// File path regex patterns
// ---------------------------------------------------------------------------

const TRANSITION_LAMBDA_PATH_RE = /^\/transitions\/([^/]+)\/lambda\/code\.ts$/;
const TRANSITION_KERNEL_PATH_RE = /^\/transitions\/([^/]+)\/kernel\/code\.ts$/;
const DE_PATH_RE = /^\/differential_equations\/([^/]+)\/code\.ts$/;

const SCENARIO_PARAM_OVERRIDE_PATH_RE =
  /^\/_temp\/scenarios\/([^/]+)\/param_overrides\/([^/]+)\/code\.ts$/;
const SCENARIO_INITIAL_STATE_PATH_RE =
  /^\/_temp\/scenarios\/([^/]+)\/initial_state\/([^/]+)\/code\.ts$/;
const SCENARIO_INITIAL_STATE_FULL_CODE_PATH_RE =
  /^\/_temp\/scenarios\/([^/]+)\/initial_state_code\/code\.ts$/;

// ---------------------------------------------------------------------------
// URI parsing
// ---------------------------------------------------------------------------

/** Extract `(itemType, itemId)` from a document URI string. */
export function parseDocumentUri(
  uri: string,
): { itemType: ItemType; itemId: string } | null {
  let match = TRANSITION_LAMBDA_URI_RE.exec(uri);
  if (match) {
    return { itemType: "transition-lambda", itemId: match[1]! };
  }

  match = TRANSITION_KERNEL_URI_RE.exec(uri);
  if (match) {
    return { itemType: "transition-kernel", itemId: match[1]! };
  }

  match = DE_URI_RE.exec(uri);
  if (match) {
    return { itemType: "differential-equation", itemId: match[1]! };
  }

  return null;
}

/** Extract scenario item info from a document URI string. */
export function parseScenarioDocumentUri(
  uri: string,
): { itemType: ScenarioItemType; sessionId: string; itemId: string } | null {
  let match = SCENARIO_PARAM_OVERRIDE_URI_RE.exec(uri);
  if (match) {
    return {
      itemType: "scenario-param-override",
      sessionId: match[1]!,
      itemId: match[2]!,
    };
  }

  match = SCENARIO_INITIAL_STATE_URI_RE.exec(uri);
  if (match) {
    return {
      itemType: "scenario-initial-state",
      sessionId: match[1]!,
      itemId: match[2]!,
    };
  }

  match = SCENARIO_INITIAL_STATE_FULL_CODE_URI_RE.exec(uri);
  if (match) {
    return {
      itemType: "scenario-initial-state-full-code",
      sessionId: match[1]!,
      itemId: "",
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// URI ↔ internal file path conversion
// ---------------------------------------------------------------------------

/** Convert a scenario document URI to the internal virtual file path. */
export function scenarioUriToFilePath(uri: string): string | null {
  const parsed = parseScenarioDocumentUri(uri);
  if (!parsed) {
    return null;
  }

  switch (parsed.itemType) {
    case "scenario-param-override":
      return getItemFilePath("scenario-param-override-code", {
        sessionId: parsed.sessionId,
        paramId: parsed.itemId,
      });
    case "scenario-initial-state":
      return getItemFilePath("scenario-initial-state-code", {
        sessionId: parsed.sessionId,
        placeId: parsed.itemId,
      });
    case "scenario-initial-state-full-code":
      return getItemFilePath("scenario-initial-state-full-code", {
        sessionId: parsed.sessionId,
      });
  }
}

/** Convert a document URI to the internal virtual file path used by the TS LanguageService. */
export function uriToFilePath(uri: string): string | null {
  const parsed = parseDocumentUri(uri);
  if (parsed) {
    switch (parsed.itemType) {
      case "transition-lambda":
        return getItemFilePath("transition-lambda-code", {
          transitionId: parsed.itemId,
        });
      case "transition-kernel":
        return getItemFilePath("transition-kernel-code", {
          transitionId: parsed.itemId,
        });
      case "differential-equation":
        return getItemFilePath("differential-equation-code", {
          id: parsed.itemId,
        });
    }
  }

  // Try scenario URIs
  return scenarioUriToFilePath(uri);
}

/** Convert an internal file path to a document URI. */
export function filePathToUri(filePath: string): string | null {
  let match = TRANSITION_LAMBDA_PATH_RE.exec(filePath);
  if (match) {
    return getDocumentUri("transition-lambda", match[1]!);
  }

  match = TRANSITION_KERNEL_PATH_RE.exec(filePath);
  if (match) {
    return getDocumentUri("transition-kernel", match[1]!);
  }

  match = DE_PATH_RE.exec(filePath);
  if (match) {
    return getDocumentUri("differential-equation", match[1]!);
  }

  // Scenario file paths
  match = SCENARIO_PARAM_OVERRIDE_PATH_RE.exec(filePath);
  if (match) {
    return getScenarioDocumentUri(
      "scenario-param-override",
      match[1]!,
      match[2]!,
    );
  }

  match = SCENARIO_INITIAL_STATE_PATH_RE.exec(filePath);
  if (match) {
    return getScenarioDocumentUri(
      "scenario-initial-state",
      match[1]!,
      match[2]!,
    );
  }

  match = SCENARIO_INITIAL_STATE_FULL_CODE_PATH_RE.exec(filePath);
  if (match) {
    return getScenarioDocumentUri(
      "scenario-initial-state-full-code",
      match[1]!,
      "",
    );
  }

  return null;
}
