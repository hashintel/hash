/**
 * Single source of truth for mapping between:
 * - Document URIs (`inmemory://sdcpn/...`) used by Monaco and the LSP protocol
 * - Internal file paths (`/transitions/.../code.ts` or `.py`) used by the language service
 * - Item types + IDs used by the SDCPN domain model
 *
 * Supports both TypeScript (.ts) and Python (.py) file extensions.
 */
import type { SDCPNLanguage } from "../../core/types/sdcpn";
import type { ItemType } from "./checker";
import { getItemFilePath } from "./file-paths";

// ---------------------------------------------------------------------------
// URI construction
// ---------------------------------------------------------------------------

/** Build a document URI for a given SDCPN item (used as Monaco model URI). */
export function getDocumentUri(
  itemType: ItemType,
  itemId: string,
  language: SDCPNLanguage = "typescript",
): string {
  const ext = language === "python" ? ".py" : ".ts";
  switch (itemType) {
    case "transition-lambda":
      return `inmemory://sdcpn/transitions/${itemId}/lambda${ext}`;
    case "transition-kernel":
      return `inmemory://sdcpn/transitions/${itemId}/kernel${ext}`;
    case "differential-equation":
      return `inmemory://sdcpn/differential-equations/${itemId}${ext}`;
  }
}

// ---------------------------------------------------------------------------
// URI parsing
// ---------------------------------------------------------------------------

const TRANSITION_LAMBDA_URI_RE =
  /^inmemory:\/\/sdcpn\/transitions\/([^/]+)\/lambda\.(ts|py)$/;
const TRANSITION_KERNEL_URI_RE =
  /^inmemory:\/\/sdcpn\/transitions\/([^/]+)\/kernel\.(ts|py)$/;
const DE_URI_RE =
  /^inmemory:\/\/sdcpn\/differential-equations\/([^/]+)\.(ts|py)$/;

/** Extract `(itemType, itemId, language)` from a document URI string. */
export function parseDocumentUri(
  uri: string,
): { itemType: ItemType; itemId: string; language: SDCPNLanguage } | null {
  let match = TRANSITION_LAMBDA_URI_RE.exec(uri);
  if (match) {
    return {
      itemType: "transition-lambda",
      itemId: match[1]!,
      language: match[2] === "py" ? "python" : "typescript",
    };
  }

  match = TRANSITION_KERNEL_URI_RE.exec(uri);
  if (match) {
    return {
      itemType: "transition-kernel",
      itemId: match[1]!,
      language: match[2] === "py" ? "python" : "typescript",
    };
  }

  match = DE_URI_RE.exec(uri);
  if (match) {
    return {
      itemType: "differential-equation",
      itemId: match[1]!,
      language: match[2] === "py" ? "python" : "typescript",
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// URI ↔ internal file path conversion
// ---------------------------------------------------------------------------

/** Convert a document URI to the internal virtual file path used by the language service. */
export function uriToFilePath(uri: string): string | null {
  const parsed = parseDocumentUri(uri);
  if (!parsed) {
    return null;
  }

  switch (parsed.itemType) {
    case "transition-lambda":
      return getItemFilePath(
        "transition-lambda-code",
        { transitionId: parsed.itemId },
        parsed.language,
      );
    case "transition-kernel":
      return getItemFilePath(
        "transition-kernel-code",
        { transitionId: parsed.itemId },
        parsed.language,
      );
    case "differential-equation":
      return getItemFilePath(
        "differential-equation-code",
        { id: parsed.itemId },
        parsed.language,
      );
  }
}

const TRANSITION_LAMBDA_PATH_RE =
  /^\/transitions\/([^/]+)\/lambda\/code\.(ts|py)$/;
const TRANSITION_KERNEL_PATH_RE =
  /^\/transitions\/([^/]+)\/kernel\/code\.(ts|py)$/;
const DE_PATH_RE = /^\/differential_equations\/([^/]+)\/code\.(ts|py)$/;

/** Convert an internal file path to a document URI. */
export function filePathToUri(filePath: string): string | null {
  let match = TRANSITION_LAMBDA_PATH_RE.exec(filePath);
  if (match) {
    const language: SDCPNLanguage = match[2] === "py" ? "python" : "typescript";
    return getDocumentUri("transition-lambda", match[1]!, language);
  }

  match = TRANSITION_KERNEL_PATH_RE.exec(filePath);
  if (match) {
    const language: SDCPNLanguage = match[2] === "py" ? "python" : "typescript";
    return getDocumentUri("transition-kernel", match[1]!, language);
  }

  match = DE_PATH_RE.exec(filePath);
  if (match) {
    const language: SDCPNLanguage = match[2] === "py" ? "python" : "typescript";
    return getDocumentUri("differential-equation", match[1]!, language);
  }

  return null;
}
