/**
 * @vitest-environment jsdom
 */
import { cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorTrackerContext } from "../../react/error-tracker-context";
import { InstalledPluginsProvider } from "./installed-plugins";
import { definePetrinautPlugin } from "./plugin";
import { usePluginSubViews } from "./plugin-sub-views";

import type { ReactNode } from "react";

afterEach(cleanup);

const Tab = () => <output>tab</output>;

const plugin = definePetrinautPlugin({
  id: "test.panels",
  subViews: [
    {
      id: "test.panels.tab",
      title: "Tab",
      placement: "bottom-panel",
      component: Tab,
    },
    {
      id: "test.panels.broken",
      title: "Broken",
      placement: "bottom-panel",
      component: () => {
        throw new Error("tab failure");
      },
    },
  ],
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <InstalledPluginsProvider plugins={[plugin]}>
    {children}
  </InstalledPluginsProvider>
);

describe("usePluginSubViews", () => {
  it("strips the placement and keeps one component identity across renders", () => {
    const { result, rerender } = renderHook(
      () => usePluginSubViews("bottom-panel"),
      { wrapper },
    );
    const [first] = result.current;
    expect(first).not.toHaveProperty("placement");
    expect(first?.id).toBe("test.panels.tab");

    rerender();
    expect(result.current[0]?.component).toBe(first?.component);
  });

  it("renders a failing tab as nothing and reports it with its place", () => {
    const captureException = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const Panel = () =>
      usePluginSubViews("bottom-panel").map((subView) => {
        const Component = subView.component;
        return <Component key={subView.id} />;
      });

    render(
      <ErrorTrackerContext value={{ captureException }}>
        <InstalledPluginsProvider plugins={[plugin]}>
          <Panel />
        </InstalledPluginsProvider>
      </ErrorTrackerContext>,
    );

    expect(screen.getByText("tab")).not.toBeNull();
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "tab failure" }),
      {
        source: "plugin.contribution",
        tags: {
          pluginId: "test.panels",
          contributionId: "test.panels.broken",
          place: "bottom-panel",
        },
      },
    );
    consoleError.mockRestore();
  });
});
