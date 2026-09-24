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

  it("puts the icon, header action and title behind the boundary, and leaves absent parts absent", () => {
    const captureException = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const fail = (part: string) => () => {
      throw new Error(`${part} failure`);
    };
    const headerPlugin = definePetrinautPlugin({
      id: "test.header",
      subViews: [
        {
          id: "test.header.section",
          title: "Section",
          placement: "left-sidebar",
          component: Tab,
          icon: fail("icon"),
          renderHeaderAction: fail("action"),
          renderTitle: fail("title"),
        },
        {
          id: "test.header.plain",
          title: "Plain",
          placement: "left-sidebar",
          component: Tab,
        },
      ],
    });
    const Header = () =>
      usePluginSubViews("left-sidebar").map((subView) => {
        const { icon: Icon, component: Content } = subView;
        return (
          <section key={subView.id} aria-label={subView.title}>
            {Icon && <Icon size={12} />}
            {subView.renderTitle?.()}
            {subView.renderHeaderAction?.()}
            <Content />
          </section>
        );
      });

    const { result } = renderHook(() => usePluginSubViews("left-sidebar"), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <InstalledPluginsProvider plugins={[headerPlugin]}>
          {children}
        </InstalledPluginsProvider>
      ),
    });
    const plain = result.current[1];
    expect(plain?.icon).toBeUndefined();
    expect(plain?.renderHeaderAction).toBeUndefined();
    expect(plain?.renderTitle).toBeUndefined();

    render(
      <ErrorTrackerContext value={{ captureException }}>
        <InstalledPluginsProvider plugins={[headerPlugin]}>
          <Header />
        </InstalledPluginsProvider>
      </ErrorTrackerContext>,
    );

    expect(screen.getByRole("region", { name: "Section" }).textContent).toBe(
      "tab",
    );
    expect(captureException).toHaveBeenCalledTimes(3);
    for (const part of ["icon", "title", "action"]) {
      expect(captureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: `${part} failure` }),
        expect.objectContaining({ source: "plugin.contribution" }),
      );
    }
    consoleError.mockRestore();
  });
});
