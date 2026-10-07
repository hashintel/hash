import { describe, expect, it } from "vitest";

import {
  definePetrinautPlugin,
  pluginService,
  type PluginHook,
} from "./define-petrinaut-plugin";

const createPalettePlugin = definePetrinautPlugin({
  id: "test.palette",
  name: "Palette",
  buttons: { toggle: { label: "Toggle", place: "top-bar-end" } },
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

    expect(createEditorPlugin(useEditorPlugin).manifest.access).toEqual({
      document: "read",
    });
  });
});
