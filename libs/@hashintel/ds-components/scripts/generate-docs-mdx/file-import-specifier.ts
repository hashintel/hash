import { pathToFileURL } from "node:url";

/**
 * Converts a file path into an ESM import specifier. Dynamic `import()` only
 * accepts `file://` URLs for absolute paths on Windows, where a bare resolved
 * path (`C:\…`) parses as a URL scheme and fails.
 */
export const fileImportSpecifier = (filePath: string): string =>
  pathToFileURL(filePath).href;
