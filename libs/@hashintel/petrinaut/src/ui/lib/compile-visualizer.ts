import * as Babel from "@babel/standalone";
import { createElement, type ReactElement } from "react";

import { runSandboxed, SHADOWED_GLOBALS } from "@hashintel/petrinaut-core";

type VisualizerProps = {
  tokens: Record<string, number | boolean | bigint | string>[];
  parameters: Record<string, number | boolean>;
};

type VisualizerComponent = (props: VisualizerProps) => ReactElement;

function compile(code: string): VisualizerComponent {
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

    // Create an executable module-like environment with the same hardening
    // as the scenario compiler: strict mode, browser/environment globals
    // shadowed to `undefined` for the module body AND (through closure
    // scope) the component body at render time.
    // The transformed JSX will use React.createElement (classic runtime)
    const executableCode = `
      "use strict";
      var ${SHADOWED_GLOBALS};
      ${mockConstructor}
      let __default_export__;
      ${transformedCode.replace(/export\s+default\s+/, "__default_export__ = ")}
      return __default_export__;
    `;

    // Use Function constructor to create and execute the module
    // We need to provide React in scope for React.createElement calls
    // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
    const moduleFn = new Function("React", executableCode) as (
      react: unknown,
    ) => unknown;
    // Module-level code runs here; `runSandboxed` masks the
    // `.constructor`-chain escape route for the duration of the call.
    const compiledComponent = runSandboxed(() =>
      moduleFn(
        // Provide a minimal React object with createElement
        { createElement },
      ),
    ) as VisualizerComponent;

    if (typeof compiledComponent !== "function") {
      throw new Error(
        `Expected default export to be a function, got ${typeof compiledComponent}`,
      );
    }

    // The component body executes at render, outside the compile call, so
    // apply the same masking around each render. Like the scenario sandbox,
    // this is hardening rather than isolation (see `runSandboxed`).
    return (props: VisualizerProps) =>
      runSandboxed(() => compiledComponent(props));
  } catch (error) {
    // Provide a detailed error message for debugging
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error occurred during compilation";

    throw new Error(`Failed to compile visualizer code: ${errorMessage}`);
  }
}

/**
 * Compiled visualizers, kept by their source.
 *
 * Compiling is a pure function of the code, so each source is compiled once
 * and its result kept, the failure too: a visualizer that does not compile is
 * asked for as often as one that does.
 *
 * Bounded, and least-recently-used first: editing the code produces an entry
 * per keystroke, so evicting by arrival would throw out the visualizers being
 * looked at to make room for one keystroke's worth of drafts.
 */
const CACHE_LIMIT = 24;
const compiled = new Map<
  string,
  { component: VisualizerComponent } | { error: unknown }
>();

/**
 * Compiles TypeScript/JSX visualizer code into a React component.
 * Expects a module with a default export using the Visualization constructor.
 *
 * The same code compiles once: repeat calls return the component already
 * made, so a component identity is stable across renders and re-opens.
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
  const cached = compiled.get(code);
  if (cached) {
    // Re-inserting makes this the newest entry, so use decides what survives.
    compiled.delete(code);
    compiled.set(code, cached);
    if ("error" in cached) {
      throw cached.error;
    }
    return cached.component;
  }

  let outcome: { component: VisualizerComponent } | { error: unknown };
  try {
    outcome = { component: compile(code) };
  } catch (error) {
    outcome = { error };
  }

  compiled.set(code, outcome);
  if (compiled.size > CACHE_LIMIT) {
    const oldest = compiled.keys().next();
    if (!oldest.done) {
      compiled.delete(oldest.value);
    }
  }

  if ("error" in outcome) {
    throw outcome.error;
  }
  return outcome.component;
}
