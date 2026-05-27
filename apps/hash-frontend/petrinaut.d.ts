/**
 * Type shims for `@hashintel/petrinaut` subpath exports.
 *
 * The frontend's `tsconfig.json` extends a legacy base that pins
 * `moduleResolution: "node"`, which predates package-`exports` resolution.
 * The petrinaut package declares the subpaths below in its
 * `package.json` "exports" map and emits matching `.d.ts` files into
 * `dist/`, but TypeScript will refuse to find them under
 * `moduleResolution: "node"`. These ambient shims paper over that.
 *
 * Next.js's `transpilePackages` (see `next.config.js`) handles the
 * runtime side — it resolves the subpaths directly from the petrinaut
 * source tree, so what's declared here just needs to match what the
 * source actually exports.
 *
 * @todo Replace this with `moduleResolution: "bundler"` (or `"node16"`)
 *   once the broader frontend codebase is ready to drop legacy
 *   resolution.
 */

declare module "@hashintel/petrinaut/sandbox-runtime" {
  /**
   * Mount the sandbox runtime in the current window. Reads
   * `window.location.hash` to pick between `#mode=headless` and
   * `#mode=visualizer`.
   */
  export function mountSandboxRuntime(): () => void;
}

declare module "@hashintel/petrinaut/sandbox-iframe" {
  import type { EvalSandbox } from "@hashintel/petrinaut";

  export interface CreateIframeSandboxOptions {
    src: string;
    onError?: (error: Error, origin: "sandbox" | "visualizer") => void;
  }

  export function createIframeSandbox(
    options: CreateIframeSandboxOptions,
  ): EvalSandbox;
}

declare module "@hashintel/petrinaut/sandbox-inline" {
  import type { EvalSandbox } from "@hashintel/petrinaut";

  export interface CreateInlineSandboxOptions {
    onError?: (error: Error) => void;
  }

  export function createInlineSandbox(
    options?: CreateInlineSandboxOptions,
  ): EvalSandbox;
}
