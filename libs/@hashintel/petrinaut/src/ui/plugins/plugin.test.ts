import { describe, expect, it } from "vitest";

import {
  definePetrinautPlugin,
  resolveInstalledPlugins,
  selectPluginEditViews,
  selectPluginSettingsGroups,
  selectPluginSubViews,
  selectPluginToolbarItems,
} from "./plugin";

const Empty = () => null;

const chrome = definePetrinautPlugin({
  id: "test.chrome",
  buttons: [
    {
      id: "test.chrome.start",
      placement: "top-bar-start",
      label: "Start",
      icon: null,
    },
    {
      id: "test.chrome.viewport",
      placement: "viewport-controls",
      label: "Viewport",
      icon: null,
    },
  ],
  topBarItems: [
    { id: "test.chrome.crumb", placement: "top-bar-start", component: Empty },
  ],
  subViews: [
    {
      id: "test.chrome.tab",
      title: "Tab",
      placement: "bottom-panel",
      component: Empty,
    },
    {
      id: "test.chrome.section",
      title: "Section",
      placement: "left-sidebar",
      component: Empty,
    },
  ],
  editViews: [{ id: "test-view", label: "Test view", component: Empty }],
  settingsGroups: [
    {
      id: "test.chrome.labs",
      section: "labs",
      title: "Chrome",
      component: Empty,
    },
  ],
});

const other = definePetrinautPlugin({
  id: "test.other",
  buttons: [
    {
      id: "test.other.start",
      placement: "top-bar-start",
      label: "Other",
      icon: null,
    },
  ],
});

describe("resolveInstalledPlugins", () => {
  it("installs the built-ins before the host's plugins", () => {
    expect(
      resolveInstalledPlugins([chrome], [other]).map((plugin) => plugin.id),
    ).toEqual(["test.chrome", "test.other"]);
  });

  it("refuses a plugin id installed twice", () => {
    expect(() => resolveInstalledPlugins([chrome], [chrome])).toThrow(
      /"test.chrome" is installed twice/,
    );
  });

  it("refuses two contributions with one id at one place", () => {
    const clash = definePetrinautPlugin({
      id: "test.clash",
      subViews: [
        {
          id: "test.chrome.tab",
          title: "Clash",
          placement: "bottom-panel",
          component: Empty,
        },
      ],
    });
    expect(() => resolveInstalledPlugins([chrome], [clash])).toThrow(
      /"test.clash" contributes bottom-panel "test.chrome.tab", which plugin "test.chrome" already contributes/,
    );
  });

  it("allows one id at different places", () => {
    const elsewhere = definePetrinautPlugin({
      id: "test.elsewhere",
      subViews: [
        {
          id: "test.chrome.tab",
          title: "Sidebar",
          placement: "left-sidebar",
          component: Empty,
        },
      ],
    });
    expect(() => resolveInstalledPlugins([other], [elsewhere])).not.toThrow();
  });

  it("refuses an edit view that would hide the Canvas", () => {
    const canvas = definePetrinautPlugin({
      id: "test.canvas",
      editViews: [{ id: "canvas", label: "Canvas", component: Empty }],
    });
    expect(() => resolveInstalledPlugins([], [canvas])).toThrow(
      /edit view "canvas", which is a built-in edit view/,
    );
  });
});

describe("contribution selectors", () => {
  it("lists one placement's buttons, then its custom items, in plugin order", () => {
    const items = selectPluginToolbarItems([chrome, other], "top-bar-start");
    expect(
      items.map((item) =>
        item.kind === "button" ? item.button.id : item.item.id,
      ),
    ).toEqual(["test.chrome.start", "test.chrome.crumb", "test.other.start"]);
    expect(selectPluginToolbarItems([chrome, other], "top-bar-end")).toEqual(
      [],
    );
  });

  it("keeps a subview's own object and the plugin that contributed it", () => {
    const [tab] = selectPluginSubViews([chrome], "bottom-panel");
    expect(tab?.pluginId).toBe("test.chrome");
    expect(tab?.subView).toBe(chrome.subViews?.[0]);
    expect(selectPluginSubViews([chrome], "left-sidebar")).toHaveLength(1);
  });

  it("collects edit views across plugins", () => {
    expect(
      selectPluginEditViews([chrome, other]).map(
        ({ pluginId, view }) => `${pluginId}/${view.id}`,
      ),
    ).toEqual(["test.chrome/test-view"]);
  });

  it("lists one settings section's groups", () => {
    expect(
      selectPluginSettingsGroups([chrome, other], "labs").map(
        ({ group }) => group.id,
      ),
    ).toEqual(["test.chrome.labs"]);
  });
});
