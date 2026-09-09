import { describe, expect, it, vi } from "vitest";

import { createLanguageClient } from "./language-client";

import type { LspTransport } from "./transport";
import type {
  PublishDiagnosticsParams,
  ServerMessage,
} from "./worker/protocol";
import type { Diagnostic } from "vscode-languageserver-types";

const createFakeTransport = () => {
  let listener: ((message: ServerMessage) => void) | null = null;
  const transport: LspTransport = {
    send: vi.fn(),
    onMessage(next) {
      listener = next;
      return () => {
        listener = null;
      };
    },
    terminate: vi.fn(),
  };
  const publish = (params: PublishDiagnosticsParams[]) =>
    listener?.({
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params,
    });
  return { transport, publish };
};

const diagnostic = (message: string): Diagnostic => ({
  range: {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 1 },
  },
  message,
  severity: 1,
});

describe("createLanguageClient diagnostics", () => {
  it("notifies subscribers only when a publish changed a diagnostic", () => {
    const { transport, publish } = createFakeTransport();
    const client = createLanguageClient({ transport });
    const onChange = vi.fn();
    client.diagnostics.subscribe(onChange);

    publish([{ uri: "inmemory://a", diagnostics: [diagnostic("x")] }]);
    publish([{ uri: "inmemory://a", diagnostics: [diagnostic("x")] }]);
    expect(onChange).toHaveBeenCalledTimes(1);

    publish([{ uri: "inmemory://a", diagnostics: [diagnostic("y")] }]);
    expect(onChange).toHaveBeenCalledTimes(2);

    publish([]);
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(client.diagnostics.get().total).toBe(0);
  });

  it("keeps the array of a document whose diagnostics did not change", () => {
    const { transport, publish } = createFakeTransport();
    const client = createLanguageClient({ transport });

    publish([
      { uri: "inmemory://a", diagnostics: [diagnostic("x")] },
      { uri: "inmemory://b", diagnostics: [diagnostic("y")] },
    ]);
    const untouched = client.diagnostics.get().byUri.get("inmemory://a");

    publish([
      { uri: "inmemory://a", diagnostics: [diagnostic("x")] },
      { uri: "inmemory://b", diagnostics: [diagnostic("z")] },
    ]);
    const snapshot = client.diagnostics.get();
    expect(snapshot.byUri.get("inmemory://a")).toBe(untouched);
    expect(snapshot.byUri.get("inmemory://b")?.[0]?.message).toBe("z");
    expect(snapshot.total).toBe(2);
    expect(snapshot.errorCount).toBe(2);
  });
});
