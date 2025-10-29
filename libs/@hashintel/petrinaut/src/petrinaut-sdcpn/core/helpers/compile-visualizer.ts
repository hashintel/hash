import * as Babel from "@babel/standalone";
import { createElement, type ReactElement } from "react";

type VisualizerProps = {
  tokens: Record<string, number>[];
  parameters: Record<string, number | boolean>;
};

type VisualizerComponent = (props: VisualizerProps) => ReactElement;

/**
 * Compiles TypeScript/JSX visualizer code into a React component.
 * Expects a module with a default export using the Visualization constructor.
 *
 * @param code - The TypeScript/JSX module code with a default export.
 *               Should follow the pattern: `export default Visualization(({ tokens, parameters }) => { ... })`
 * @returns A compiled React component function
 *
 * @example
 * ```typescript
 * const code = `
 *   export default Visualization(({ tokens, parameters }) => {
 *     return <div>{tokens.length} satellites</div>;
 *   });
 * `;
 * const Component = compileVisualizer(code);
 * const element = <Component tokens={[]} parameters={{}} />;
 * ```
 */
export function compileVisualizer(code: string): VisualizerComponent {
  try {
    // Transform TypeScript + JSX to JavaScript
    // Using classic runtime to avoid needing react/jsx-runtime imports
    const result = Babel.transform(code.trim(), {
      filename: "visualizer.tsx",
      presets: [
        ["typescript", { allExtensions: true, isTSX: true }],
        ["react", { runtime: "classic" }],
      ],
    });

    const transformedCode = result.code ?? "";

    // Verify that the code has a default export
    const defaultExportRegex = /export\s+default\s+/;
    if (!defaultExportRegex.test(transformedCode)) {
      throw new Error(
        "Module must have a default export. Expected pattern: export default Visualization(...)",
      );
    }

    // Create a mock Visualization constructor that extracts the component
    const mockConstructor = `
      function Visualization(fn) {
        if (typeof fn !== 'function') {
          throw new Error('Visualization expects a function as argument');
        }
        return fn;
      }
    `;

    // Create an executable module-like environment
    // The transformed JSX will use React.createElement (classic runtime)
    const executableCode = `
      ${mockConstructor}
      let __default_export__;
      ${transformedCode.replace(/export\s+default\s+/, "__default_export__ = ")}
      return __default_export__;
    `;

    // Use Function constructor to create and execute the module
    // We need to provide React in scope for React.createElement calls
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func, @typescript-eslint/no-unsafe-call
    const compiledComponent = new Function("React", executableCode)(
      // Provide a minimal React object with createElement
      { createElement },
    ) as VisualizerComponent;

    if (typeof compiledComponent !== "function") {
      throw new Error(
        `Expected default export to be a function, got ${typeof compiledComponent}`,
      );
    }

    return compiledComponent;
  } catch (error) {
    // Provide a detailed error message for debugging
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error occurred during compilation";

    throw new Error(`Failed to compile visualizer code: ${errorMessage}`);
  }
}

// Export createElement for use by compiled code if needed
export { createElement };
