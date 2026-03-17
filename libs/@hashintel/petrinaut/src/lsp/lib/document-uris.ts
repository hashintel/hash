/**
 * Single source of truth for mapping between:
 * - Document URIs (`inmemory://sdcpn/...`) used by Monaco and the LSP protocol
 * - Internal file paths (`/transitions/.../code.ts`) used by the TS LanguageService
 * - Item types + IDs used by the SDCPN domain model
 */
import type { ItemType } from "./checker";
import { getItemFilePath } from "./file-paths";

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

// ---------------------------------------------------------------------------
// URI parsing
// ---------------------------------------------------------------------------

const TRANSITION_LAMBDA_URI_RE =
  /^inmemory:\/\/sdcpn\/transitions\/([^/]+)\/lambda\.ts$/;
const TRANSITION_KERNEL_URI_RE =
  /^inmemory:\/\/sdcpn\/transitions\/([^/]+)\/kernel\.ts$/;
const DE_URI_RE = /^inmemory:\/\/sdcpn\/differential-equations\/([^/]+)\.ts$/;

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

// ---------------------------------------------------------------------------
// URI ↔ internal file path conversion
// ---------------------------------------------------------------------------

/** Convert a document URI to the internal virtual file path used by the TS LanguageService. */
export function uriToFilePath(uri: string): string | null {
  const parsed = parseDocumentUri(uri);
  if (!parsed) {
    return null;
  }

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

const TRANSITION_LAMBDA_PATH_RE = /^\/transitions\/([^/]+)\/lambda\/code\.ts$/;
const TRANSITION_KERNEL_PATH_RE = /^\/transitions\/([^/]+)\/kernel\/code\.ts$/;
const DE_PATH_RE = /^\/differential_equations\/([^/]+)\/code\.ts$/;

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

  return null;
}
