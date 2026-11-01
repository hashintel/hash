import ts from "@typescript/typescript6";
// `react-types` is a Vite alias for `@types/react`'s directory (see
// `vite.config.ts`): TypeScript refuses specifiers that start with `@types/`.
import reactGlobalDts from "react-types/global.d.ts?raw";
import reactIndexDts from "react-types/index.d.ts?raw";
import reactJsxRuntimeDts from "react-types/jsx-runtime.d.ts?raw";

import {
  TYPESCRIPT_LIB_NAMES,
  TYPESCRIPT_LIBS,
  type LanguageServiceHostConfig,
} from "./create-language-service-host";
import { VISUALIZER_JSX_PACKAGE } from "./file-paths";
import { generateVisualizerVirtualFiles } from "./generate-virtual-files";
import { VirtualFileLanguageServer } from "./virtual-file-language-server";

import type { PetrinautExtensionSettings } from "../../extensions";
import type { SDCPN } from "../../types/sdcpn";

const JSX_PACKAGE_DIRECTORY = `/node_modules/${VISUALIZER_JSX_PACKAGE}`;

/**
 * React's `index.d.ts` also declares `React` as a UMD global (`export as
 * namespace React`). Without that line `React.useState` is an unknown name
 * (TS2304) rather than a UMD global referenced from a module (TS2686), so no
 * spelling of a hook resolves in a visualizer.
 */
const reactIndexWithoutGlobal = reactIndexDts.replace(
  /^export as namespace React;$/m,
  "",
);

/**
 * `index.d.ts` imports `csstype` for `CSSProperties`. The real package is
 * 895 KB of declarations, parsed on the first visualizer check and shipped
 * inside the inlined worker, and what it buys is CSS property names in
 * `style` objects, which visualizers (SVG drawings) rarely use. This stub
 * keeps `style={{ ... }}` accepting string and number values and drops the
 * property catalogue. Bundle the real package if `style` completion is asked
 * for.
 */
const CSSTYPE_STUB = [
  `export interface Properties<TLength = string | 0, TTime = string> {`,
  `  [property: string]: TLength | TTime | undefined;`,
  `}`,
].join("\n");

const packageJson = (name: string): string =>
  JSON.stringify({ name, version: "0.0.0", types: "index.d.ts" });

/**
 * The visualizer language service: JavaScript with JSX, checked against
 * React's element and attribute types, served under a package that is not
 * `react`, with no DOM lib. React's `global.d.ts` declares the element
 * interfaces the attribute types reference as empty interfaces, so `window`,
 * `document`, `fetch` and `setTimeout` stay unknown names.
 */
export const VISUALIZER_LANGUAGE_SERVICE_HOST: LanguageServiceHostConfig = {
  compilerOptions: {
    target: ts.ScriptTarget.ES2015,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    jsx: ts.JsxEmit.ReactJSX,
    jsxImportSource: VISUALIZER_JSX_PACKAGE,
    // Visualizer code is JavaScript with JSX: types are inferred, and a
    // type annotation is reported where it is written (TS8010 and kin).
    allowJs: true,
    checkJs: true,
    lib: [...TYPESCRIPT_LIB_NAMES],
    typeRoots: [],
    types: [],
  },
  bundledFiles: {
    ...TYPESCRIPT_LIBS,
    [`${JSX_PACKAGE_DIRECTORY}/package.json`]: packageJson(
      VISUALIZER_JSX_PACKAGE,
    ),
    [`${JSX_PACKAGE_DIRECTORY}/index.d.ts`]: reactIndexWithoutGlobal,
    [`${JSX_PACKAGE_DIRECTORY}/global.d.ts`]: reactGlobalDts,
    [`${JSX_PACKAGE_DIRECTORY}/jsx-runtime.d.ts`]: reactJsxRuntimeDts,
    "/node_modules/csstype/package.json": packageJson("csstype"),
    "/node_modules/csstype/index.d.ts": CSSTYPE_STUB,
  },
};

/**
 * Persistent TypeScript language server for place visualizer code: one JSX
 * file per place that has a visualizer, typed over the same parameters and
 * colour types as the SDCPN service. A program of its own, so an edit to a
 * visualizer never re-checks the net's transitions, nor the other way round.
 */
export class VisualizerLanguageServer extends VirtualFileLanguageServer {
  constructor() {
    super(VISUALIZER_LANGUAGE_SERVICE_HOST);
  }

  /**
   * Sync virtual files to match the given SDCPN model: the shared type
   * definitions and a defs/code pair for every place with a visualizer.
   */
  syncFiles(sdcpn: SDCPN, extensions?: PetrinautExtensionSettings): void {
    this.reconcileFiles(
      generateVisualizerVirtualFiles(sdcpn, extensions),
      () => true,
    );
  }
}
