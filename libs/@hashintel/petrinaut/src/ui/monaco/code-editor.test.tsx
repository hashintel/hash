import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
/**
 * @vitest-environment jsdom
 */
import { Suspense, useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CodeEditor } from "./code-editor";
import { MonacoContext } from "./context";

import type { MonacoContextValue } from "./context";
import type { EditorProps } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

afterEach(cleanup);

// A stand-in for @monaco-editor/react's Editor: shows `loading` until the
// test releases the mount, then reports a minimal editor instance.
const mountGate: { release: () => void } = { release: () => {} };

const FakeEditor: React.FC<EditorProps> = ({ loading, onMount }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    mountGate.release = () => setMounted(true);
  }, []);
  useEffect(() => {
    if (!mounted) {
      return;
    }
    const model = {
      getValue: () => "",
      setValue: vi.fn(),
      getLineCount: () => 1,
      getLineMaxColumn: () => 1,
      getFullModelRange: () => ({}),
    };
    const instance = {
      getModel: () => model,
      setPosition: vi.fn(),
      setSelection: vi.fn(),
      onDidChangeModelContent: vi.fn(),
      onDidScrollChange: vi.fn(),
      onDidFocusEditorText: vi.fn(),
      onDidBlurEditorText: vi.fn(),
    } as unknown as editor.IStandaloneCodeEditor;
    onMount?.(instance, {} as never);
  }, [mounted, onMount]);
  return mounted ? (
    <div data-testid="editor" />
  ) : (
    <div data-testid="editor-loading">{loading}</div>
  );
};

const monacoContext: Promise<MonacoContextValue> = Promise.resolve({
  monaco: {} as never,
  Editor: FakeEditor,
});

describe("CodeEditor", () => {
  it("shows the placeholder only once the editor has mounted", async () => {
    // The inner component suspends on the Monaco module, so the render is
    // awaited for the module to settle.
    await act(async () => {
      render(
        <MonacoContext value={monacoContext}>
          <Suspense fallback={null}>
            <CodeEditor singleLine placeholder="Type an expression" value="" />
          </Suspense>
        </MonacoContext>,
      );
    });

    // While Monaco mounts, its dimmed label has the row; the placeholder
    // would land at the same inset and read as two labels. (The Suspense
    // fallback shows the same label first, so wait for the editor's own.)
    const loading = await screen.findByTestId("editor-loading");
    expect(loading.textContent).toBe("Loading...");
    expect(screen.queryByText("Type an expression")).toBeNull();

    act(() => {
      mountGate.release();
    });
    await waitFor(() => screen.getByTestId("editor"));
    expect(screen.getByText("Type an expression")).toBeTruthy();
    expect(screen.queryByText("Loading...")).toBeNull();
  });
});
