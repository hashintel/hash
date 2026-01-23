/**
 * Hook to set up Monaco editor with the LSP client.
 *
 * Responsibilities:
 * - Registers the LSP completion provider for TypeScript
 * - Disables Monaco's built-in TS worker for SDCPN files
 * - Sets up the diagnostics manager
 * - Configures Monaco compiler options
 */

import { loader } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { use, useEffect, useRef, useState } from "react";

import { LSPContext } from "../lsp/lsp-context";
import { createLSPCompletionProvider } from "../lsp/monaco-completion-provider";
import { MonacoDiagnosticsManager } from "../lsp/monaco-diagnostics-manager";
import type { SDCPNItemDiagnostic } from "../lsp/protocol";

interface ReactTypeDefinitions {
  react: string;
  reactJsxRuntime: string;
  reactDom: string;
}

/**
 * Fetch React type definitions from unpkg CDN.
 * These are needed for visualizer code which uses JSX.
 */
async function fetchReactTypes(): Promise<ReactTypeDefinitions> {
  const [react, reactJsxRuntime, reactDom] = await Promise.all([
    fetch("https://unpkg.com/@types/react@18/index.d.ts").then((response) =>
      response.text(),
    ),
    fetch("https://unpkg.com/@types/react@18/jsx-runtime.d.ts").then(
      (response) => response.text(),
    ),
    fetch("https://unpkg.com/@types/react-dom@18/index.d.ts").then((response) =>
      response.text(),
    ),
  ]);

  return { react, reactJsxRuntime, reactDom };
}

/**
 * Configure Monaco TypeScript compiler options.
 *
 * Note: Monaco types mark the typescript API as deprecated, but it's still
 * the standard way to configure TS options. We use any to bypass this.
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
function configureMonacoCompilerOptions(monaco: typeof Monaco): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ts = (monaco.languages as any).typescript;

  // Disable Monaco's built-in TypeScript validation for SDCPN files
  // We'll use our own LSP-based diagnostics instead
  ts.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
  });

  ts.typescriptDefaults.setCompilerOptions({
    target: ts.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    module: ts.ModuleKind.ESNext,
    noEmit: true,
    esModuleInterop: true,
    jsx: ts.JsxEmit.ReactJSX,
    allowJs: false,
    checkJs: false,
    typeRoots: ["node_modules/@types"],
  });
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

/**
 * Sets up Monaco's TypeScript environment with React types.
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
async function setupMonacoReactTypes(monaco: typeof Monaco): Promise<void> {
  const reactTypes = await fetchReactTypes();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ts = (monaco.languages as any).typescript;

  ts.typescriptDefaults.setExtraLibs([
    {
      content: reactTypes.react,
      filePath: "inmemory://sdcpn/node_modules/@types/react/index.d.ts",
    },
    {
      content: reactTypes.reactJsxRuntime,
      filePath: "inmemory://sdcpn/node_modules/@types/react/jsx-runtime.d.ts",
    },
    {
      content: reactTypes.reactDom,
      filePath: "inmemory://sdcpn/node_modules/@types/react-dom/index.d.ts",
    },
  ]);
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

export interface UseMonacoLSPResult {
  /** Whether the LSP setup is complete */
  isReady: boolean;
  /** Current diagnostics from LSP (for CheckerProvider) */
  diagnostics: SDCPNItemDiagnostic[];
}

/**
 * Hook to set up Monaco with LSP-based TypeScript support.
 *
 * This hook:
 * 1. Configures Monaco's TypeScript compiler options
 * 2. Disables Monaco's built-in TS worker (we use our own LSP)
 * 3. Registers our LSP completion provider
 * 4. Sets up the diagnostics manager
 * 5. Loads React types for visualizer code
 */
export function useMonacoLSP(): UseMonacoLSPResult {
  const { client, isReady: clientReady } = use(LSPContext);
  const [isMonacoReady, setIsMonacoReady] = useState(false);
  const [diagnostics, setDiagnostics] = useState<SDCPNItemDiagnostic[]>([]);

  const diagnosticsManagerRef = useRef<MonacoDiagnosticsManager | null>(null);
  const completionDisposableRef = useRef<Monaco.IDisposable | null>(null);

  // Initialize Monaco configuration once
  useEffect(() => {
    let cancelled = false;

    /* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
    void loader.init().then(async (monaco) => {
      if (cancelled) {
        return;
      }

      // Configure compiler options
      configureMonacoCompilerOptions(monaco);

      // Set up React types
      await setupMonacoReactTypes(monaco);

      // Create diagnostics manager
      diagnosticsManagerRef.current = new MonacoDiagnosticsManager(monaco);

      // Register completion provider for TypeScript
      completionDisposableRef.current =
        monaco.languages.registerCompletionItemProvider(
          "typescript",
          createLSPCompletionProvider(monaco, () => client),
        );

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- closure race condition
      if (!cancelled) {
        setIsMonacoReady(true);
      }
    });
    /* eslint-enable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

    return () => {
      cancelled = true;
      completionDisposableRef.current?.dispose();
      diagnosticsManagerRef.current?.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to diagnostics when client is ready
  useEffect(() => {
    if (!clientReady || !client || !diagnosticsManagerRef.current) {
      return;
    }

    // Subscribe to diagnostics
    diagnosticsManagerRef.current.subscribe(client);

    // Also subscribe to update state for CheckerProvider
    const unsubscribe = client.onDiagnostics((newDiagnostics) => {
      setDiagnostics(newDiagnostics);
    });

    return () => {
      unsubscribe();
    };
  }, [client, clientReady]);

  return {
    isReady: isMonacoReady && clientReady,
    diagnostics,
  };
}
