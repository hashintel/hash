import { describe, expect, it } from "vitest";

import {
  definePetrinautPlugin,
  resolveInstalledPlugins,
  selectPluginEditViews,
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

  it("strips the placement from a subview before the panel renders it", () => {
    const [tab] = selectPluginSubViews([chrome], "bottom-panel");
    expect(tab).toEqual({
      id: "test.chrome.tab",
      title: "Tab",
      component: Empty,
    });
    expect(selectPluginSubViews([chrome], "left-sidebar")).toHaveLength(1);
  });

  it("collects edit views across plugins", () => {
    expect(
      selectPluginEditViews([chrome, other]).map((view) => view.id),
    ).toEqual(["test-view"]);
  });
});
