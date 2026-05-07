/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SDCPN } from "../../core/types/sdcpn";
import type { ClientMessage, ServerMessage } from "./protocol";
import { useLanguageClient } from "./use-language-client";

class MockWorker {
  private messageListeners: ((event: MessageEvent<ServerMessage>) => void)[] =
    [];

  postedMessages: ClientMessage[] = [];

  addEventListener(type: string, listener: (event: never) => void): void {
    if (type === "message") {
      this.messageListeners.push(
        listener as (event: MessageEvent<ServerMessage>) => void,
      );
    }
  }

  postMessage(message: ClientMessage): void {
    this.postedMessages.push(message);
  }

  terminate(): void {
    // No-op
  }

  simulateMessage(message: ServerMessage): void {
    const event = { data: message } as MessageEvent<ServerMessage>;
    for (const listener of this.messageListeners) {
      listener(event);
    }
  }

  getMessages(method: ClientMessage["method"]): ClientMessage[] {
    return this.postedMessages.filter((message) => message.method === method);
  }
}

const mocks = vi.hoisted(() => ({
  worker: null as MockWorker | null,
}));

vi.mock("./language-server.worker.ts?worker", () => ({
  default: class LanguageServerWorker extends MockWorker {
    constructor() {
      super();
      mocks.worker = this;
    }
  },
}));

async function flushMicrotasks() {
  await act(async () => {});
}

const EMPTY_SDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

describe("useLanguageClient", () => {
  beforeEach(() => {
    mocks.worker = null;
  });

  it("does not create the language worker on mount or structural initialization", async () => {
    const { result } = renderHook(() => useLanguageClient());
    await flushMicrotasks();

    act(() => {
      result.current.initialize(EMPTY_SDCPN);
    });
    await flushMicrotasks();

    expect(mocks.worker).toBeNull();
  });

  it("creates the worker for document diagnostics and drains queued structural messages first", async () => {
    const diagnostics = vi.fn();
    const { result } = renderHook(() => useLanguageClient());

    act(() => {
      result.current.onDiagnostics(diagnostics);
      result.current.initialize(EMPTY_SDCPN);
      result.current.notifyDocumentChanged(
        "file:///predicate.ts",
        "return true;",
      );
    });
    await flushMicrotasks();

    expect(mocks.worker).not.toBeNull();
    expect(
      mocks.worker?.postedMessages.map((message) => message.method),
    ).toEqual(["initialize", "textDocument/didChange"]);

    act(() => {
      mocks.worker?.simulateMessage({
        jsonrpc: "2.0",
        method: "textDocument/publishDiagnostics",
        params: [{ uri: "file:///predicate.ts", diagnostics: [] }],
      });
    });

    expect(diagnostics).toHaveBeenCalledWith([
      { uri: "file:///predicate.ts", diagnostics: [] },
    ]);
  });

  it("creates the worker for language feature requests and resolves responses", async () => {
    const { result } = renderHook(() => useLanguageClient());

    act(() => {
      result.current.initialize(EMPTY_SDCPN);
    });

    const completionPromise = result.current.requestCompletion(
      "file:///predicate.ts",
      { line: 0, character: 1 },
    );
    await flushMicrotasks();

    expect(
      mocks.worker?.postedMessages.map((message) => message.method),
    ).toEqual(["initialize", "textDocument/completion"]);

    act(() => {
      mocks.worker?.simulateMessage({
        jsonrpc: "2.0",
        id: 0,
        result: { isIncomplete: false, items: [] },
      });
    });

    await expect(completionPromise).resolves.toEqual({
      isIncomplete: false,
      items: [],
    });
  });

  it("creates the worker for language feature requests after a StrictMode remount", async () => {
    const { result } = renderHook(() => useLanguageClient(), {
      reactStrictMode: true,
    });

    act(() => {
      result.current.initialize(EMPTY_SDCPN);
    });

    const completionPromise = result.current.requestCompletion(
      "file:///predicate.ts",
      { line: 0, character: 1 },
    );
    await flushMicrotasks();

    expect(
      mocks.worker?.postedMessages.map((message) => message.method),
    ).toEqual(["initialize", "textDocument/completion"]);

    act(() => {
      mocks.worker?.simulateMessage({
        jsonrpc: "2.0",
        id: 0,
        result: { isIncomplete: false, items: [] },
      });
    });

    await expect(completionPromise).resolves.toEqual({
      isIncomplete: false,
      items: [],
    });
  });
});
