/**
 * A `Worker` that never answers, for test files that mount the editor: jsdom
 * has none. Assigned, not `vi.stubGlobal`, which a test's `unstubAllGlobals`
 * would undo: the language server starts its worker after an async import,
 * past the test.
 */
class WorkerStub extends EventTarget {
  onerror = null;
  onmessage = null;
  onmessageerror = null;

  postMessage() {}
  terminate() {}
}

globalThis.Worker = WorkerStub as unknown as typeof Worker;
