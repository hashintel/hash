/**
 * Singleton manager for loading and caching Pyodide + SymPy in the WebWorker.
 *
 * Pyodide (Python-in-WASM) is loaded once per worker lifetime and reused
 * for all SymPy compilation calls. SymPy is installed via micropip on first load.
 */

import type { PyodideInterface } from "pyodide";

/**
 * Default CDN URL for Pyodide assets matching the installed version.
 *
 * Pyodide's auto-detection of its asset location (via stack trace parsing)
 * breaks when the JS entry is pre-bundled by Vite/Storybook into a deps cache
 * directory that doesn't contain the WASM/zip files. We always pass an explicit
 * indexURL to avoid this. Consumers can override with a self-hosted URL via
 * the `pyodideUrl` parameter.
 */
const PYODIDE_VERSION = "0.27.7";
const PYODIDE_CDN_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

let cachedPyodide: PyodideInterface | null = null;

/**
 * Load Pyodide and install SymPy. Caches the instance for the worker lifetime.
 *
 * @param pyodideUrl - Optional URL where Pyodide WASM assets are served.
 *                     If not provided, uses the official Pyodide CDN.
 * @returns The initialized Pyodide instance with SymPy available.
 */
export async function loadPyodideAndSymPy(
  pyodideUrl?: string,
): Promise<PyodideInterface> {
  if (cachedPyodide) {
    return cachedPyodide;
  }

  const { loadPyodide } = await import("pyodide");

  const pyodide = await loadPyodide({
    indexURL: pyodideUrl ?? PYODIDE_CDN_URL,
  });

  // Install sympy via micropip (Pyodide's package manager)
  await pyodide.loadPackage("micropip");
  const micropip = pyodide.pyimport("micropip");
  await micropip.install("sympy");

  cachedPyodide = pyodide;
  return pyodide;
}

/**
 * Dispose the cached Pyodide instance, freeing WASM memory.
 */
export function disposePyodide(): void {
  cachedPyodide = null;
}
