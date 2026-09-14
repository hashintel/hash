import { describe, expect, it, vi } from "vitest";

import { createLanguageClient } from "./language-client";
import { createSDCPN } from "./lib/helper/create-sdcpn";

import type { LspTransport } from "./transport";
import type {
  ClientMessage,
  PublishDiagnosticsParams,
  ServerMessage,
} from "./worker/protocol";
import type { Diagnostic } from "vscode-languageserver-types";

const createFakeTransport = () => {
  let listener: ((message: ServerMessage) => void) | null = null;
  const sent: ClientMessage[] = [];
  const transport: LspTransport = {
    send(message) {
      sent.push(message);
    },
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
  const respond = (id: number, result: PublishDiagnosticsParams[]) =>
    listener?.({ jsonrpc: "2.0", id, result });
  return { transport, sent, publish, respond };
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
  it("resolves repeated clean diagnostic requests independently", async () => {
    const { transport, sent, respond } = createFakeTransport();
    const client = createLanguageClient({ transport });
    const definition = createSDCPN();

    const first = client.requestDiagnostics(definition);
    respond(0, []);
    await expect(first).resolves.toMatchObject({ total: 0, errorCount: 0 });

    const second = client.requestDiagnostics(definition);
    respond(1, []);
    await expect(second).resolves.toMatchObject({ total: 0, errorCount: 0 });
    expect(sent.map((message) => message.method)).toEqual([
      "sdcpn/diagnostics",
      "sdcpn/diagnostics",
    ]);
  });

  it("resolves a clean request after a dirty request", async () => {
    const { transport, respond } = createFakeTransport();
    const client = createLanguageClient({ transport });
    const definition = createSDCPN();

    const dirty = client.requestDiagnostics(definition);
    respond(0, [{ uri: "inmemory://a", diagnostics: [diagnostic("dirty")] }]);
    await expect(dirty).resolves.toMatchObject({ total: 1, errorCount: 1 });

    const clean = client.requestDiagnostics(definition);
    respond(1, []);
    await expect(clean).resolves.toMatchObject({ total: 0, errorCount: 0 });
  });

  it("correlates each response to the exact requested definition", async () => {
    const { transport, sent, respond } = createFakeTransport();
    const client = createLanguageClient({ transport });
    const firstDefinition = createSDCPN();
    const secondDefinition = createSDCPN({
      parameters: [{ id: "second", name: "Second" }],
    });

    const first = client.requestDiagnostics(firstDefinition);
    const second = client.requestDiagnostics(secondDefinition);
    respond(1, []);
    respond(0, [
      { uri: "inmemory://first", diagnostics: [diagnostic("first")] },
    ]);

    await expect(first).resolves.toMatchObject({ total: 1 });
    await expect(second).resolves.toMatchObject({ total: 0 });
    expect(sent).toMatchObject([
      { id: 0, params: { sdcpn: firstDefinition } },
      { id: 1, params: { sdcpn: secondDefinition } },
    ]);
  });

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
