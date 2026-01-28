/**
 * LSP Client for main thread communication with the LSP worker.
 *
 * Manages:
 * - Worker lifecycle
 * - Request/response correlation
 * - Debounced document updates
 * - Diagnostics subscription
 */

import type ts from "typescript";

import type { SDCPN } from "../core/types/sdcpn";
import type {
  LSPRequest,
  LSPWorkerMessage,
  SDCPNItemDiagnostic,
} from "./protocol";

export type DiagnosticsListener = (diagnostics: SDCPNItemDiagnostic[]) => void;

/**
 * Pending request awaiting response from worker.
 */
type PendingRequest<T> = {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

/**
 * LSP Client that communicates with the TypeScript language service worker.
 */
export class LSPClient {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, PendingRequest<unknown>>();
  private requestIdCounter = 0;
  private isInitialized = false;
  private initializePromise: Promise<void> | null = null;
  private diagnosticsListeners = new Set<DiagnosticsListener>();

  // Debounced document update tracking
  private updateTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly UPDATE_DEBOUNCE_MS = 150;

  constructor() {
    this.createWorker();
  }

  /**
   * Creates and initializes the web worker.
   */
  private createWorker(): void {
    // Use Vite's worker import syntax
    this.worker = new Worker(new URL("./lsp.worker.ts", import.meta.url), {
      type: "module",
    });

    this.worker.onmessage = this.handleMessage.bind(this);
    this.worker.onerror = this.handleError.bind(this);
  }

  /**
   * Handles messages from the worker.
   */
  private handleMessage(event: MessageEvent<LSPWorkerMessage>): void {
    const message = event.data;

    switch (message.type) {
      case "initialized":
        this.isInitialized = true;
        break;

      case "documentUpdated":
      case "completions":
      case "diagnostics": {
        const pending = this.pendingRequests.get(message.requestId);
        if (pending) {
          this.pendingRequests.delete(message.requestId);
          if (message.type === "completions") {
            pending.resolve(message.items);
          } else if (message.type === "diagnostics") {
            pending.resolve(message.diagnostics);
          } else {
            pending.resolve(undefined);
          }
        }
        break;
      }

      case "diagnosticsPush":
        // Notify all listeners of diagnostics update
        for (const listener of this.diagnosticsListeners) {
          listener(message.diagnostics);
        }
        break;
    }
  }

  /**
   * Handles worker errors.
   */
  private handleError(error: ErrorEvent): void {
    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error(`Worker error: ${error.message}`));
    }
    this.pendingRequests.clear();
  }

  /**
   * Generates a unique request ID.
   */
  private nextRequestId(): string {
    return `req_${++this.requestIdCounter}`;
  }

  /**
   * Sends a request to the worker.
   */
  private sendRequest(request: LSPRequest): void {
    if (!this.worker) {
      throw new Error("Worker not initialized");
    }
    this.worker.postMessage(request);
  }

  /**
   * Initializes the LSP with an SDCPN model.
   * Must be called before any other operations.
   */
  async initialize(sdcpn: SDCPN): Promise<void> {
    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = new Promise<void>((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("Worker not created"));
        return;
      }

      // Listen for the initialized response
      const handleInit = (event: MessageEvent<LSPWorkerMessage>) => {
        if (event.data.type === "initialized") {
          this.isInitialized = true;
          resolve();
        }
      };

      this.worker.addEventListener("message", handleInit, { once: true });

      this.sendRequest({
        type: "initialize",
        sdcpn,
      });
    });

    return this.initializePromise;
  }

  /**
   * Updates a document's content.
   * Debounced to avoid excessive updates during typing.
   *
   * @param path - LSP path (e.g., /transitions/{id}/lambda/code.ts)
   * @param content - New content
   */
  updateDocument(path: string, content: string): void {
    // Clear existing timer for this path
    const existingTimer = this.updateTimers.get(path);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounced timer
    const timer = setTimeout(() => {
      this.updateTimers.delete(path);
      void this.updateDocumentImmediate(path, content);
    }, this.UPDATE_DEBOUNCE_MS);

    this.updateTimers.set(path, timer);
  }

  /**
   * Updates a document immediately without debouncing.
   */
  private updateDocumentImmediate(
    path: string,
    content: string,
  ): Promise<void> {
    const requestId = this.nextRequestId();

    return new Promise<void>((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      this.sendRequest({
        type: "updateDocument",
        requestId,
        path,
        content,
      });
    });
  }

  /**
   * Gets completions at a position in a document.
   *
   * @param path - LSP path
   * @param position - Character offset from start of user code
   */
  async getCompletions(
    path: string,
    position: number,
  ): Promise<ts.CompletionInfo | undefined> {
    const requestId = this.nextRequestId();

    return new Promise<ts.CompletionInfo | undefined>((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      this.sendRequest({
        type: "getCompletions",
        requestId,
        path,
        position,
      });
    });
  }

  /**
   * Gets diagnostics for specified files.
   *
   * @param paths - LSP paths to check. Empty array checks all code files.
   */
  async getDiagnostics(paths: string[] = []): Promise<SDCPNItemDiagnostic[]> {
    const requestId = this.nextRequestId();

    return new Promise<SDCPNItemDiagnostic[]>((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      this.sendRequest({
        type: "getDiagnostics",
        requestId,
        paths,
      });
    });
  }

  /**
   * Subscribes to diagnostics updates.
   * Called whenever diagnostics change (after document updates).
   *
   * @returns Unsubscribe function
   */
  onDiagnostics(listener: DiagnosticsListener): () => void {
    this.diagnosticsListeners.add(listener);
    return () => {
      this.diagnosticsListeners.delete(listener);
    };
  }

  /**
   * Checks if the client is initialized and ready.
   */
  get ready(): boolean {
    return this.isInitialized;
  }

  /**
   * Terminates the worker and cleans up.
   */
  dispose(): void {
    // Clear all pending update timers
    for (const timer of this.updateTimers.values()) {
      clearTimeout(timer);
    }
    this.updateTimers.clear();

    // Reject pending requests
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error("Client disposed"));
    }
    this.pendingRequests.clear();

    // Clear listeners
    this.diagnosticsListeners.clear();

    // Terminate worker
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.isInitialized = false;
    this.initializePromise = null;
  }
}
