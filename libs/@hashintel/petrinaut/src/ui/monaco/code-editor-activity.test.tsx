/** @vitest-environment jsdom */
import MonacoEditor, { loader } from "@monaco-editor/react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { Activity } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { CodeEditor } from "./code-editor";
import { MonacoContext } from "./context";

import type { MonacoContextValue } from "./context";
import type { RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";

const models = new Map<string, TextModel>();

class TextModel {
  listeners = new Set<() => void>();
  constructor(
    public text: string,
    readonly uri: { path: string },
  ) {}
  getValue = () => this.text;
  getLineCount = () => 1;
  getLineMaxColumn = () => this.text.length + 1;
  getFullModelRange = () => ({});
  setValue = vi.fn((value: string) => {
    this.text = value;
    for (const listener of this.listeners) listener();
  });
  dispose = vi.fn(() => {
    models.delete(this.uri.path);
    this.listeners.clear();
  });
}

class EditorInstance {
  disposed = false;
  focusListeners = new Set<() => void>();
  blurListeners = new Set<() => void>();
  constructor(readonly model: TextModel) {}
  getModel = () => this.model;
  getValue = () => this.model.getValue();
  getOption = () => false;
  setPosition = vi.fn();
  setSelection = vi.fn();
  restoreViewState = vi.fn();
  saveViewState = () => ({});
  updateOptions = vi.fn();
  pushUndoStop = vi.fn();
  executeEdits = vi.fn((_source: string, edits: { text: string }[]) => {
    for (const edit of edits) this.model.setValue(edit.text);
  });
  onDidChangeModelContent = (listener: () => void) => {
    this.model.listeners.add(listener);
    return { dispose: () => this.model.listeners.delete(listener) };
  };
  onDidFocusEditorText = (listener: () => void) => {
    this.focusListeners.add(listener);
    return { dispose: () => this.focusListeners.delete(listener) };
  };
  onDidBlurEditorText = (listener: () => void) => {
    this.blurListeners.add(listener);
    return { dispose: () => this.blurListeners.delete(listener) };
  };
  focus = () => {
    for (const listener of this.focusListeners) listener();
  };
  dispose = vi.fn(() => {
    this.disposed = true;
    this.focusListeners.clear();
    this.blurListeners.clear();
  });
}

const instances: EditorInstance[] = [];
const monaco = {
  Uri: { parse: (path: string) => ({ path }) },
  editor: {
    EditorOption: { readOnly: 0 },
    getModel: (uri: { path: string }) => models.get(uri.path) ?? null,
    createModel: (value: string, _language: string, uri: { path: string }) => {
      const model = new TextModel(value, uri);
      models.set(uri.path, model);
      return model;
    },
    create: (_container: HTMLElement, options: { model: TextModel }) => {
      const instance = new EditorInstance(options.model);
      instances.push(instance);
      return instance;
    },
    setTheme: vi.fn(),
    setModelLanguage: vi.fn(),
    onDidChangeMarkers: () => ({ dispose: vi.fn() }),
  },
} as unknown as MonacoContextValue["monaco"];
loader.config({ monaco });
const context: Promise<MonacoContextValue> = Promise.resolve({
  monaco,
  Editor: MonacoEditor,
});
const onChange = vi.fn();

const Views = ({
  view,
  canvasValue,
  definitionsValue,
}: {
  view: "canvas" | "definitions";
  canvasValue: string;
  definitionsValue: string;
}) => (
  <MonacoContext value={context}>
    <Activity mode={view === "canvas" ? "visible" : "hidden"}>
      <CodeEditor
        path="inmemory://shared.ts"
        value={canvasValue}
        onChange={onChange}
      />
    </Activity>
    <Activity mode={view === "definitions" ? "visible" : "hidden"}>
      <CodeEditor
        path="inmemory://shared.ts"
        value={definitionsValue}
        onChange={onChange}
      />
    </Activity>
  </MonacoContext>
);

const renderViews = async (element: ReactElement) => {
  let view: RenderResult | undefined;
  await act(async () => {
    view = render(element);
    await context;
    await loader.init();
  });
  return view!;
};

afterEach(() => {
  cleanup();
  models.clear();
  instances.length = 0;
  vi.clearAllMocks();
});

it("disposes the hidden editor and ignores stale hidden values while typing", async () => {
  const view = await renderViews(
    <Views view="canvas" canvasValue="initial" definitionsValue="initial" />,
  );
  await waitFor(() => expect(instances).toHaveLength(1));
  const canvas = instances[0]!;
  await act(async () => {
    view.rerender(
      <Views
        view="definitions"
        canvasValue="initial"
        definitionsValue="initial"
      />,
    );
  });
  await waitFor(() => expect(instances).toHaveLength(2));
  const definitions = instances[1]!;
  expect(canvas.disposed).toBe(true);
  expect(canvas.model.dispose).toHaveBeenCalledOnce();
  act(() => definitions.focus());
  act(() => definitions.model.setValue("in-progress typing"));
  await act(async () => {
    view.rerender(
      <Views
        view="definitions"
        canvasValue="stale hidden update"
        definitionsValue="initial"
      />,
    );
  });
  expect(instances.filter((instance) => !instance.disposed)).toEqual([
    definitions,
  ]);
  expect(definitions.getValue()).toBe("in-progress typing");
  expect(definitions.executeEdits).not.toHaveBeenCalled();
});

it("restores the latest committed value when switching back to a previously focused view", async () => {
  const view = await renderViews(
    <Views view="canvas" canvasValue="initial" definitionsValue="initial" />,
  );
  await waitFor(() => expect(instances).toHaveLength(1));
  act(() => instances[0]!.focus());
  await act(async () => {
    view.rerender(
      <Views
        view="definitions"
        canvasValue="initial"
        definitionsValue="initial"
      />,
    );
  });
  await waitFor(() => expect(instances).toHaveLength(2));
  await act(async () => {
    view.rerender(
      <Views
        view="canvas"
        canvasValue="latest committed"
        definitionsValue="latest committed"
      />,
    );
  });
  await waitFor(() => expect(instances).toHaveLength(3));
  expect(instances[2]!.getValue()).toBe("latest committed");
  await act(async () => {
    view.rerender(
      <Views
        view="canvas"
        canvasValue="external update"
        definitionsValue="latest committed"
      />,
    );
  });
  expect(instances[2]!.getValue()).toBe("external update");
});
