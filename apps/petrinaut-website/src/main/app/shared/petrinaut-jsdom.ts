/** jsdom stand-ins for the browser capabilities a real mounted Petrinaut reads. */
import {
  compileHirArtifacts,
  lowerScenarioToHir,
} from "@hashintel/petrinaut-core/hir";

import type { LspWorkerFactory } from "@hashintel/petrinaut-core";

/**
 * Call from `vi.hoisted`: Monaco reads `queryCommandSupported` and
 * `CSS.escape` while its modules load, before any test hook runs.
 * `vitest.setup.ts` installs `matchMedia`.
 */
export const installPetrinautDomShims = () => {
  // Monaco's clipboard contrib reads this at import time; jsdom does not
  // implement it.
  Object.defineProperty(document, "queryCommandSupported", {
    configurable: true,
    value: () => false,
  });
  Object.defineProperty(window, "CSS", {
    configurable: true,
    value: {
      ...window.CSS,
      escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "\\$&"),
    },
  });
  // jsdom reads as a WebKit web view, so once loaded, Monaco writes to the
  // clipboard on every click and keydown. It cancels each write's pending
  // item on the next event; `write` awaits the items so that rejection
  // reaches Monaco's own `catch`.
  class ClipboardItem {
    constructor(readonly items: Record<string, unknown>) {}
  }
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      write: (items: readonly ClipboardItem[]) =>
        Promise.all(items.flatMap((item) => Object.values(item.items))).then(
          () => undefined,
        ),
    },
  });
  Object.defineProperty(globalThis, "ClipboardItem", {
    configurable: true,
    value: ClipboardItem,
  });
};

/**
 * The real panel loads Monaco lazily. Resolve its browser capability checks
 * during setup rather than letting an import race a later test. Give the hook
 * 30 seconds: cold transforms exceed the default when the suite runs in parallel.
 */
export const preloadMonaco = async () => {
  await import("monaco-editor");
};

/**
 * The editor imports the language server's worker module, a large inline
 * bundle, when it mounts, and `diagnose()` waits for that worker. Import it
 * during setup, with `Worker` stubbed, so a test's own waits leave out the
 * cold import. Give the hook 30 seconds, as for {@link preloadMonaco}.
 */
export const preloadLanguageServer = async () => {
  const { createLanguageServerWorker } =
    await import("@hashintel/petrinaut-core/workers/lsp");
  (await createLanguageServerWorker()).terminate();
};

export class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

type LspWorker = Awaited<ReturnType<LspWorkerFactory>>;

/** The language-server Worker, answered in-process: clean diagnostics and real HIR. */
export class InProcessLspWorker {
  private listeners = new Set<(event: MessageEvent) => void>();

  postMessage(message: Parameters<LspWorker["postMessage"]>[0]) {
    if (!("id" in message)) return;
    const result =
      message.method === "sdcpn/diagnostics"
        ? []
        : message.method === "sdcpn/compileHirArtifacts"
          ? compileHirArtifacts(
              message.params.sdcpn,
              message.params.extensions,
              message.params.options,
            )
          : message.method === "sdcpn/lowerScenario"
            ? lowerScenarioToHir(message.params.scenario, {
                adHocContext: message.params.adHocContext,
              })
            : null;
    queueMicrotask(() => {
      for (const listener of this.listeners)
        listener({
          data: { jsonrpc: "2.0", id: message.id, result },
        } as MessageEvent);
    });
  }

  addEventListener(_type: string, listener: (event: MessageEvent) => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: string, listener: (event: MessageEvent) => void) {
    this.listeners.delete(listener);
  }

  terminate() {
    this.listeners.clear();
  }
}
