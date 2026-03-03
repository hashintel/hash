import * as Babel from "@babel/standalone";

/**
 * Strips TypeScript type annotations from code to make it executable JavaScript.
 * Uses Babel standalone (browser-compatible) to properly parse and transform TypeScript code.
 *
 * @param code - TypeScript code with type annotations
 * @returns JavaScript code without type annotations
 */
function stripTypeAnnotations(code: string): string {
  const result = Babel.transform(code, {
    filename: "input.ts",
    presets: [
      ["typescript", { allowDeclareFields: true, onlyRemoveTypeImports: true }],
    ],
  });
  return result.code ?? "";
}

/**
 * Compiles TypeScript/JavaScript module code into an executable function.
 * Expects a JavaScript module with a default export using a specific constructor function.
 *
 * @param code - The TypeScript/JavaScript module code with a default export.
 *               Should follow the pattern: `export default ConstructorFn((a, b, c) => { ... })`
 *               Can include TypeScript type annotations which will be stripped.
 * @param constructorFnName - The name of the constructor function that wraps the user code.
 *                            This must match the function used in the default export.
 * @returns A compiled function that can be executed
 *
 * @example
 * ```typescript
 * const code = `
 *   export default Dynamics((a: number, b: number, c: number) => {
 *     return a + b + c;
 *   });
 * `;
 * const fn = compileUserCode(code, "Dynamics");
 * const result = fn(1, 2, 3); // returns 6
 * ```
 */
export function compileUserCode<T extends unknown[] = unknown[]>(
  code: string,
  constructorFnName: string,
): (...args: T) => unknown {
  // Strip TypeScript type annotations and remove leading/trailing whitespace
  const sanitizedCode = stripTypeAnnotations(code.trim());

  // Verify that the code has a default export
  const defaultExportRegex = /export\s+default\s+/;
  if (!defaultExportRegex.test(sanitizedCode)) {
    throw new Error(
      `Module must have a default export. Expected pattern: export default ${constructorFnName}(...)`,
    );
  }

  // Verify that the default export uses the specified constructor function
  const constructorPattern = new RegExp(
    `export\\s+default\\s+${constructorFnName}\\s*\\(`,
  );
  if (!constructorPattern.test(sanitizedCode)) {
    throw new Error(
      `Default export must use the constructor function '${constructorFnName}'. Expected pattern: export default ${constructorFnName}(...)`,
    );
  }

  try {
    // Create a mock constructor function that extracts the wrapped function
    const mockConstructor = `
      function ${constructorFnName}(fn) {
        if (typeof fn !== 'function') {
          throw new Error('${constructorFnName} expects a function as argument');
        }
        return fn;
      }
    `;

    // Create an executable module-like environment
    const executableCode = `
      ${mockConstructor}
      let __default_export__;
      ${sanitizedCode.replace(/export\s+default\s+/, "__default_export__ = ")}
      return __default_export__;
    `;

    // Use Function constructor to create and execute the module
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func, @typescript-eslint/no-unsafe-call
    const compiledFunction = new Function(executableCode)() as (
      ...args: T
    ) => unknown;

    if (typeof compiledFunction !== "function") {
      throw new Error(
        `Expected default export to be a function, got ${typeof compiledFunction}`,
      );
    }

    return compiledFunction;
  } catch (error) {
    throw new Error(
      `Failed to compile user code: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
