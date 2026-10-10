import { describe, expect, it } from "vitest";

import {
  definePetrinautPlugin,
  pluginCommandId,
  pluginService,
  type PluginHook,
} from "./define-petrinaut-plugin";

const createPalettePlugin = definePetrinautPlugin({
  id: "test.palette",
  name: "Palette",
  buttons: { toggle: { label: "Toggle", place: "top-bar-end" } },
});

const createCommandsPlugin = definePetrinautPlugin({
  id: "test.commands",
  name: "Commands",
  commands: { open: { label: "Open" } },
  buttons: { open: { label: "Open", place: "top-bar-end" } },
});

const createRootPlugin = definePetrinautPlugin({
  id: "test.root",
  name: "Root",
  root: true,
});

const createEditorPlugin = definePetrinautPlugin({
  id: "test.editor",
  name: "Editor",
  access: { document: "read" },
  settings: {
    mode: { type: "enum", options: ["a", "b"], default: "a", label: "Mode" },
  },
  provides: pluginService<{ ready: boolean }>(),
});

describe("definePetrinautPlugin", () => {
  it("exposes the manifest and gives each plugin a new host key", () => {
    const contributions = { buttons: { toggle: { icon: null } } };
    const first = createPalettePlugin(contributions);
    const second = createPalettePlugin(contributions);

    expect(createPalettePlugin.manifest.id).toBe("test.palette");
    expect(first.hostKey).not.toBe(second.hostKey);
    expect(first.hook(undefined as never)).toBe(contributions);
  });

  it("types the api and the contributions from the manifest", () => {
    const useEditorPlugin: PluginHook<typeof createEditorPlugin> = (api) => {
      const mode: "a" | "b" = api.settings.get("mode");
      // @ts-expect-error A value outside an enum's options.
      api.settings.set("mode", "c");
      // @ts-expect-error A reader has no edits.
      void api.document.edit;
      // @ts-expect-error An undeclared family is absent.
      void api.experiments;

      return { provides: { ready: mode === "a" } };
    };

    // @ts-expect-error A declared button the contributions leave out.
    createPalettePlugin({});
    // @ts-expect-error A contribution the manifest does not declare.
    createPalettePlugin({ buttons: { toggle: { icon: null } }, provides: 1 });
    // @ts-expect-error The service has the declared type.
    createEditorPlugin({ provides: { ready: "yes" } });
    // @ts-expect-error A root the manifest does not declare.
    createPalettePlugin({ buttons: { toggle: { icon: null } }, root: null });
    // @ts-expect-error An overlay without a declared root.
    createPalettePlugin({ buttons: { toggle: { icon: null } }, overlay: true });
    // @ts-expect-error A declared root the contributions leave out.
    createRootPlugin({});
    createRootPlugin({ root: null, overlay: false });

    expect(createEditorPlugin(useEditorPlugin).manifest.access).toEqual({
      document: "read",
    });
  });

  it("types a button's command by the manifest's command keys", () => {
    const open = () => {};
    const plugin = createCommandsPlugin({
      commands: { open: { run: open } },
      buttons: { open: { icon: null, command: "open" } },
    });
    // @ts-expect-error A declared command the contributions leave out.
    createCommandsPlugin({ buttons: { open: { icon: null } } });
    createCommandsPlugin({
      commands: { open: { run: open } },
      // @ts-expect-error A command the manifest does not declare.
      buttons: { open: { icon: null, command: "close" } },
    });
    // @ts-expect-error A plugin without commands has no button commands.
    createPalettePlugin({ buttons: { toggle: { icon: null, command: "x" } } });

    expect(pluginCommandId(plugin.manifest.id, "open")).toBe(
      "test.commands.open",
    );
  });
});
