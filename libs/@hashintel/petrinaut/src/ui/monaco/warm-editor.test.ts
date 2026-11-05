/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";

import { warmEditor } from "./warm-editor";

import type { MonacoContextValue } from "./context";

const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
  else Reflect.deleteProperty(document, "fonts");
});

it("skips warmup when font loading or idle callbacks are unavailable", () => {
  const idle = vi.fn();
  const load = vi.fn();
  const create = vi.fn();
  const monaco = {
    editor: { create, getEditors: () => [] },
  } as unknown as MonacoContextValue["monaco"];
  vi.stubGlobal("requestIdleCallback", idle);
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: undefined,
  });
  warmEditor(monaco)();
  expect(idle).not.toHaveBeenCalled();

  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { load },
  });
  vi.stubGlobal("requestIdleCallback", undefined);
  warmEditor(monaco)();
  expect(load).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});

it("cancels before idle work and skips warming an editor that already opened", async () => {
  const idle = vi.fn();
  vi.stubGlobal("requestIdleCallback", idle);
  vi.stubGlobal("cancelIdleCallback", vi.fn());
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { load: () => Promise.resolve([]) },
  });
  const create = vi.fn();
  const monaco = {
    editor: { create, getEditors: () => [{}] },
  } as unknown as MonacoContextValue["monaco"];
  warmEditor(monaco)();
  await Promise.resolve();
  expect(idle).not.toHaveBeenCalled();

  const cancel = warmEditor(monaco);
  await Promise.resolve();
  const callback = idle.mock.calls[0]![0] as () => void;
  callback();
  expect(create).not.toHaveBeenCalled();
  cancel();
});

it("removes the temporary editor and model after warming", async () => {
  let runIdle = () => {};
  let runFrame = () => {};
  vi.stubGlobal("requestIdleCallback", (callback: () => void) => {
    runIdle = callback;
    return 1;
  });
  vi.stubGlobal("cancelIdleCallback", vi.fn());
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    runFrame = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { load: () => Promise.resolve([]) },
  });
  const model = { dispose: vi.fn() };
  const instance = { getModel: () => model, dispose: vi.fn() };
  const create = vi.fn(() => instance);
  const monaco = {
    editor: { create, getEditors: () => [] },
  } as unknown as MonacoContextValue["monaco"];
  const cancel = warmEditor(monaco);
  await Promise.resolve();
  runIdle();
  expect(create).toHaveBeenCalledOnce();
  expect(document.querySelector('[aria-hidden="true"]')).not.toBeNull();
  runFrame();
  expect(model.dispose).toHaveBeenCalledOnce();
  expect(instance.dispose).toHaveBeenCalledOnce();
  expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
  cancel();
  expect(instance.dispose).toHaveBeenCalledOnce();
});
