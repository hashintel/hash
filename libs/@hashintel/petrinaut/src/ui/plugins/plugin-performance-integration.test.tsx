/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { StrictMode, useEffect, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { useStore } from "../../react/use-store";
import {
  definePetrinautPlugin,
  type PluginHook,
} from "./define-petrinaut-plugin";
import { PluginRoots } from "./plugin-outlets";
import { renderPlugins } from "./plugins-test-harness";

import type { PluginPerformance } from "./plugin-performance";

const apiValues: unknown[] = [];
const mount = vi.fn();
const Counter = () => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    mount();
  }, []);
  return (
    <button type="button" onClick={() => setCount(count + 1)}>
      Count {count}
    </button>
  );
};
const counter = definePetrinautPlugin(
  { id: "test.counter", name: "Counter", root: true },
  { root: <Counter /> },
);
const Reader = ({ performance }: { performance: PluginPerformance }) => {
  const snapshot = useStore(performance.snapshot);
  return <output>{snapshot.frames.length} samples</output>;
};
const Controls = ({ performance }: { performance: PluginPerformance }) => {
  const [observing, setObserving] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setObserving(!observing)}>
        Observe
      </button>
      {observing && <Reader performance={performance} />}
    </>
  );
};
const MonitorPlugin = definePetrinautPlugin({
  id: "test.monitor",
  name: "Monitor",
  root: true,
  access: { performance: "read" },
});
const useMonitor: PluginHook<typeof MonitorPlugin> = (api) => {
  useEffect(() => {
    apiValues.push(api);
  }, [api]);
  return { root: <Controls performance={api.performance} /> };
};
const UnprivilegedPlugin = definePetrinautPlugin({
  id: "test.unprivileged",
  name: "Unprivileged",
});
const useUnprivileged: PluginHook<typeof UnprivilegedPlugin> = (api) => {
  useEffect(() => {
    apiValues.push(api);
  }, [api]);
  return {};
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  apiValues.length = 0;
  mount.mockClear();
});

it("uses public permissions and toggles collection without remounting contributions", () => {
  vi.useFakeTimers({
    toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"],
  });
  const { unmount } = renderPlugins(
    [counter, MonitorPlugin(useMonitor), UnprivilegedPlugin(useUnprivileged)],
    <PluginRoots />,
    { Around: StrictMode },
  );
  expect(
    apiValues.some((api) => Object.hasOwn(api as object, "performance")),
  ).toBe(true);
  expect(
    apiValues.some((api) => !Object.hasOwn(api as object, "performance")),
  ).toBe(true);
  const mountCount = mount.mock.calls.length;
  fireEvent.click(screen.getByText("Count 0"));
  fireEvent.click(screen.getByText("Observe"));
  act(() => {
    vi.advanceTimersByTime(600);
  });
  expect(screen.getByText("2 samples")).toBeTruthy();
  expect(screen.getByText("Count 1")).toBeTruthy();
  expect(mount).toHaveBeenCalledTimes(mountCount);
  fireEvent.click(screen.getByText("Observe"));
  expect(vi.getTimerCount()).toBe(0);
  fireEvent.click(screen.getByText("Observe"));
  act(() => {
    vi.advanceTimersByTime(300);
  });
  expect(screen.getByText("1 samples")).toBeTruthy();
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
