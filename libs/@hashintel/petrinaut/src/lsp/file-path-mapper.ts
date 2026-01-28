/**
 * File Path Mapper for Monaco <-> LSP path conversion.
 *
 * Monaco uses `inmemory://sdcpn/...` URIs while the LSP worker
 * uses absolute paths starting with `/`.
 *
 * Monaco paths (as shown in editor):
 * - inmemory://sdcpn/transitions/{id}/lambda.ts
 * - inmemory://sdcpn/transitions/{id}/transition-kernel.ts
 * - inmemory://sdcpn/differential-equations/{id}.ts
 * - inmemory://sdcpn/places/{id}/visualizer.tsx
 *
 * LSP paths (internal virtual filesystem):
 * - /transitions/{id}/lambda/code.ts
 * - /transitions/{id}/kernel/code.ts
 * - /differential_equations/{id}/code.ts
 * - /places/{id}/visualizer/code.tsx
 */

const MONACO_URI_PREFIX = "inmemory://sdcpn";

/**
 * Converts a Monaco editor URI path to an LSP path.
 *
 * @param monacoPath - Path from Monaco URI (e.g., "inmemory://sdcpn/transitions/123/lambda.ts")
 * @returns LSP path or null if the path doesn't match known patterns
 */
export function monacoPathToLspPath(monacoPath: string): string | null {
  // Strip the inmemory://sdcpn prefix if present
  let path = monacoPath;
  if (path.startsWith(MONACO_URI_PREFIX)) {
    path = path.slice(MONACO_URI_PREFIX.length);
  }

  // Transition lambda: /transitions/{id}/lambda.ts -> /transitions/{id}/lambda/code.ts
  const lambdaMatch = path.match(/^\/transitions\/([^/]+)\/lambda\.ts$/);
  if (lambdaMatch) {
    return `/transitions/${lambdaMatch[1]}/lambda/code.ts`;
  }

  // Transition kernel: /transitions/{id}/transition-kernel.ts -> /transitions/{id}/kernel/code.ts
  const kernelMatch = path.match(
    /^\/transitions\/([^/]+)\/transition-kernel\.ts$/,
  );
  if (kernelMatch) {
    return `/transitions/${kernelMatch[1]}/kernel/code.ts`;
  }

  // Differential equation: /differential-equations/{id}.ts -> /differential_equations/{id}/code.ts
  const deMatch = path.match(/^\/differential-equations\/([^/]+)\.ts$/);
  if (deMatch) {
    return `/differential_equations/${deMatch[1]}/code.ts`;
  }

  // Place visualizer: /places/{id}/visualizer.tsx -> /places/{id}/visualizer/code.tsx
  const visualizerMatch = path.match(/^\/places\/([^/]+)\/visualizer\.tsx$/);
  if (visualizerMatch) {
    return `/places/${visualizerMatch[1]}/visualizer/code.tsx`;
  }

  return null;
}

/**
 * Converts an LSP path to a Monaco editor URI path.
 *
 * @param lspPath - LSP path (e.g., "/transitions/123/lambda/code.ts")
 * @returns Monaco URI path or null if the path doesn't match known patterns
 */
export function lspPathToMonacoPath(lspPath: string): string | null {
  // Transition lambda: /transitions/{id}/lambda/code.ts -> inmemory://sdcpn/transitions/{id}/lambda.ts
  const lambdaMatch = lspPath.match(
    /^\/transitions\/([^/]+)\/lambda\/code\.ts$/,
  );
  if (lambdaMatch) {
    return `${MONACO_URI_PREFIX}/transitions/${lambdaMatch[1]}/lambda.ts`;
  }

  // Transition kernel: /transitions/{id}/kernel/code.ts -> inmemory://sdcpn/transitions/{id}/transition-kernel.ts
  const kernelMatch = lspPath.match(
    /^\/transitions\/([^/]+)\/kernel\/code\.ts$/,
  );
  if (kernelMatch) {
    return `${MONACO_URI_PREFIX}/transitions/${kernelMatch[1]}/transition-kernel.ts`;
  }

  // Differential equation: /differential_equations/{id}/code.ts -> inmemory://sdcpn/differential-equations/{id}.ts
  const deMatch = lspPath.match(
    /^\/differential_equations\/([^/]+)\/code\.ts$/,
  );
  if (deMatch) {
    return `${MONACO_URI_PREFIX}/differential-equations/${deMatch[1]}.ts`;
  }

  // Place visualizer: /places/{id}/visualizer/code.tsx -> inmemory://sdcpn/places/{id}/visualizer.tsx
  const visualizerMatch = lspPath.match(
    /^\/places\/([^/]+)\/visualizer\/code\.tsx$/,
  );
  if (visualizerMatch) {
    return `${MONACO_URI_PREFIX}/places/${visualizerMatch[1]}/visualizer.tsx`;
  }

  return null;
}

/**
 * Extracts the item ID and type from a Monaco path.
 *
 * @param monacoPath - Monaco URI path
 * @returns Item info or null if not a recognized SDCPN path
 */
export function getItemInfoFromMonacoPath(monacoPath: string): {
  itemId: string;
  itemType:
    | "transition-lambda"
    | "transition-kernel"
    | "differential-equation"
    | "visualizer";
} | null {
  // Strip the inmemory://sdcpn prefix if present
  let path = monacoPath;
  if (path.startsWith(MONACO_URI_PREFIX)) {
    path = path.slice(MONACO_URI_PREFIX.length);
  }

  const lambdaMatch = path.match(/^\/transitions\/([^/]+)\/lambda\.ts$/);
  if (lambdaMatch) {
    return { itemId: lambdaMatch[1]!, itemType: "transition-lambda" };
  }

  const kernelMatch = path.match(
    /^\/transitions\/([^/]+)\/transition-kernel\.ts$/,
  );
  if (kernelMatch) {
    return { itemId: kernelMatch[1]!, itemType: "transition-kernel" };
  }

  const deMatch = path.match(/^\/differential-equations\/([^/]+)\.ts$/);
  if (deMatch) {
    return { itemId: deMatch[1]!, itemType: "differential-equation" };
  }

  const visualizerMatch = path.match(/^\/places\/([^/]+)\/visualizer\.tsx$/);
  if (visualizerMatch) {
    return { itemId: visualizerMatch[1]!, itemType: "visualizer" };
  }

  return null;
}

/**
 * Checks if a Monaco URI path is an SDCPN code file.
 */
export function isSDCPNCodeFile(monacoPath: string): boolean {
  return monacoPathToLspPath(monacoPath) !== null;
}
