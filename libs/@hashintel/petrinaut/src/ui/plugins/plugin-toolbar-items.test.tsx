/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCommandRegistry } from "@hashintel/petrinaut-core";

import { CommandRegistryProvider } from "../../react/commands/command-registry";
import { InstalledPluginsProvider } from "./installed-plugins";
import { definePetrinautPlugin } from "./plugin";
import { PluginToolbarItems } from "./plugin-toolbar-items";

afterEach(cleanup);

describe("PluginToolbarItems", () => {
  it("renders one placement's buttons and custom items, running click handlers and commands", () => {
    const registry = createCommandRegistry();
    const run = vi.fn();
    registry.register({ id: "test.palette.toggle", label: "Toggle", run });
    const onClick = vi.fn();
    const attached: (HTMLButtonElement | null)[] = [];
    const plugin = definePetrinautPlugin({
      id: "test.toolbar",
      buttons: [
        {
          id: "test.toolbar.feedback",
          placement: "top-bar-end",
          label: "Give feedback",
          icon: <span>icon</span>,
          onClick,
          command: "test.palette.toggle",
          ref: (node) => {
            attached.push(node);
          },
        },
        {
          id: "test.toolbar.elsewhere",
          placement: "viewport-controls",
          label: "Elsewhere",
          icon: null,
        },
      ],
      topBarItems: [
        {
          id: "test.toolbar.crumb",
          placement: "top-bar-end",
          component: () => <span>crumb</span>,
        },
      ],
    });

    render(
      <CommandRegistryProvider registry={registry}>
        <InstalledPluginsProvider plugins={[plugin]}>
          <PluginToolbarItems placement="top-bar-end" />
        </InstalledPluginsProvider>
      </CommandRegistryProvider>,
    );

    expect(screen.getByText("crumb")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Elsewhere" })).toBeNull();
    const button = screen.getByRole("button", { name: "Give feedback" });
    expect(attached[0]).toBe(button);

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();
  });
});
