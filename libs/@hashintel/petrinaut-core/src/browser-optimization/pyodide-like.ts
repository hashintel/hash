/**
 * The slice of the Pyodide API the optimizer runtime uses, typed structurally
 * so published code never depends on the `pyodide` package's declarations.
 */
export type PyProxyLike = {
  toJs(options?: {
    dict_converter?: (entries: Iterable<[string, unknown]>) => unknown;
  }): unknown;
  destroy(): void;
};

export type PyodideLike = {
  loadPackage(names: string | string[]): Promise<unknown>;
  pyimport(moduleName: string): unknown;
  runPythonAsync(code: string): Promise<unknown>;
  FS: {
    mkdirTree(path: string): void;
    writeFile(path: string, data: string): void;
  };
};

export type LoadPyodide = (options: {
  indexURL: string;
}) => Promise<PyodideLike>;

export const isPyProxyLike = (value: unknown): value is PyProxyLike =>
  typeof value === "object" &&
  value !== null &&
  "toJs" in value &&
  typeof value.toJs === "function" &&
  "destroy" in value &&
  typeof value.destroy === "function";
