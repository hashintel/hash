import { expect, it, vi } from "vitest";

import { releaseReplacedModels } from "./release-replaced-models";

import type { editor } from "monaco-editor";

it("releases detached models on path changes without disposing shared or current models", () => {
  const model = (attached: boolean) => ({
    isDisposed: vi.fn(() => false),
    isAttachedToEditor: vi.fn(() => attached),
    dispose: vi.fn(),
  });
  const first = model(false);
  const shared = model(true);
  const current = model(true);
  let selected = first;
  let changed = () => {};
  let disposed = () => {};
  const unsubscribe = vi.fn();
  releaseReplacedModels({
    getModel: () => selected as unknown as editor.ITextModel,
    onDidChangeModel: (listener) => {
      changed = () => listener({ oldModelUrl: null, newModelUrl: null });
      return { dispose: unsubscribe };
    },
    onDidDispose: (listener) => {
      disposed = listener;
      return { dispose: vi.fn() };
    },
  });
  selected = shared;
  changed();
  expect(first.dispose).toHaveBeenCalledOnce();
  selected = current;
  changed();
  expect(shared.dispose).not.toHaveBeenCalled();
  expect(current.dispose).not.toHaveBeenCalled();
  disposed();
  expect(unsubscribe).toHaveBeenCalledOnce();
});
