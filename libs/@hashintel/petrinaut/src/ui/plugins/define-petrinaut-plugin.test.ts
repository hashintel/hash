import { describe, expect, it } from "vitest";

import {
  definePetrinautPlugin,
  pluginCommandId,
  pluginRuntime,
  pluginService,
  type PetrinautPluginManifest,
  type PluginHook,
} from "./define-petrinaut-plugin";

const noop = () => {};

const PalettePlugin = definePetrinautPlugin({
  id: "test.palette",
  name: "Palette",
  buttons: { toggle: { label: "Toggle", place: "top-bar-end" } },
});

const CommandsPlugin = definePetrinautPlugin({
  id: "test.commands",
  name: "Commands",
  commands: { open: { label: "Open" } },
  buttons: { open: { label: "Open", place: "top-bar-end" } },
});

const RootPlugin = definePetrinautPlugin({
  id: "test.root",
  name: "Root",
  root: true,
});

const AssistantPlugin = definePetrinautPlugin({
  id: "test.assistant",
  name: "Assistant",
  assistant: true,
});

const NoticePlugin = definePetrinautPlugin({
  id: "test.notice",
  name: "Notice",
  readOnlyAction: { label: "Make a copy" },
});

const EditorPlugin = definePetrinautPlugin({
  id: "test.editor",
  name: "Editor",
  access: { document: "read", editor: "read" },
  settings: {
    mode: { type: "enum", options: ["a", "b"], default: "a", label: "Mode" },
  },
  provides: pluginService<{ ready: boolean }>(),
});

describe("definePetrinautPlugin", () => {
  it("exposes the manifest and gives each plugin a new host key", () => {
    const contributions = {
      buttons: { toggle: { icon: null, onClick: noop } },
    };
    const first = PalettePlugin(contributions);
    const second = PalettePlugin(contributions);

    expect(PalettePlugin.manifest.id).toBe("test.palette");
    expect(first[pluginRuntime].hostKey).not.toBe(
      second[pluginRuntime].hostKey,
    );
    expect(first[pluginRuntime].hook(undefined as never)).toBe(contributions);
  });

  it("types the api and the contributions from the manifest", () => {
    const useEditorPlugin: PluginHook<typeof EditorPlugin> = (api) => {
      const mode: "a" | "b" = api.settings.get("mode");
      // @ts-expect-error A value outside an enum's options.
      api.settings.set("mode", "c");
      // @ts-expect-error A reader has no edits.
      void api.document.edit;
      // @ts-expect-error An undeclared family is absent.
      void api.experiments;
      const editorMode: "edit" | "simulate" | "actual" =
        api.editor.navigation.get().mode;
      // @ts-expect-error A reader cannot navigate.
      void api.editor.navigate;
      void editorMode;

      return { provides: { ready: mode === "a" } };
    };

    // @ts-expect-error A declared button the contributions leave out.
    PalettePlugin({});
    PalettePlugin({
      buttons: { toggle: { icon: null, onClick: noop } },
      // @ts-expect-error A contribution the manifest does not declare.
      provides: 1,
    });
    // @ts-expect-error The service has the declared type.
    EditorPlugin({ provides: { ready: "yes" } });
    PalettePlugin({
      buttons: { toggle: { icon: null, onClick: noop } },
      // @ts-expect-error A root the manifest does not declare.
      root: null,
    });
    PalettePlugin({
      buttons: { toggle: { icon: null, onClick: noop } },
      // @ts-expect-error An overlay without a declared root.
      overlay: true,
    });
    // @ts-expect-error A declared root the contributions leave out.
    RootPlugin({});
    RootPlugin({ root: null, overlay: false });

    expect(EditorPlugin(useEditorPlugin).manifest.access).toEqual({
      document: "read",
      editor: "read",
    });
  });

  it("types a button's command by the manifest's command keys", () => {
    const open = () => {};
    const plugin = CommandsPlugin({
      commands: { open: { run: open } },
      buttons: { open: { icon: null, command: "open" } },
    });
    // @ts-expect-error A declared command the contributions leave out.
    CommandsPlugin({ buttons: { open: { icon: null, onClick: noop } } });
    CommandsPlugin({
      commands: { open: { run: open } },
      // @ts-expect-error A command the manifest does not declare.
      buttons: { open: { icon: null, command: "close" } },
    });
    // @ts-expect-error A plugin without commands has no button commands.
    PalettePlugin({ buttons: { toggle: { icon: null, command: "x" } } });

    expect(pluginCommandId(plugin.manifest.id, "open")).toBe(
      "test.commands.open",
    );
  });

  it("requires the read-only action's run exactly when the manifest declares the action", () => {
    const run = () => {};
    const useNoticePlugin: PluginHook<typeof NoticePlugin> = () => ({
      readOnlyAction: { run },
    });
    const plugin = NoticePlugin(useNoticePlugin);
    // @ts-expect-error A declared read-only action the contributions leave out.
    NoticePlugin({});
    PalettePlugin({
      buttons: { toggle: { icon: null, onClick: noop } },
      // @ts-expect-error A read-only action the manifest does not declare.
      readOnlyAction: { run },
    });
    // @ts-expect-error The hook gives what the action does, not its label.
    NoticePlugin({ readOnlyAction: { label: "Copy" } });
    definePetrinautPlugin({
      id: "test.unlabelled",
      name: "Unlabelled",
      // @ts-expect-error The manifest gives the action's label.
      readOnlyAction: {},
    });

    expect(plugin[pluginRuntime].hook(undefined as never)).toEqual({
      readOnlyAction: { run },
    });
  });

  it("requires the assistant's content exactly when the manifest declares an assistant", () => {
    const content = "Transcript";
    const plugin = AssistantPlugin({ assistant: { content } });
    // @ts-expect-error A declared assistant the contributions leave out.
    AssistantPlugin({});
    // @ts-expect-error An assistant without its content.
    AssistantPlugin({ assistant: {} });
    PalettePlugin({
      buttons: { toggle: { icon: null, onClick: noop } },
      // @ts-expect-error An assistant the manifest does not declare.
      assistant: { content },
    });

    expect(plugin[pluginRuntime].hook(undefined as never)).toEqual({
      assistant: { content },
    });
  });

  it("returns the plugin directly when given the implementation", () => {
    const contributions = { buttons: { help: { icon: null, onClick: noop } } };
    const manifest = {
      id: "test.direct",
      name: "Direct",
      buttons: { help: { label: "Help", place: "top-bar-end" } },
    } as const;
    const first = definePetrinautPlugin(manifest, contributions);
    const second = definePetrinautPlugin(manifest, contributions);
    const id: "test.direct" = first.manifest.id;

    expect(id).toBe("test.direct");
    expect(first.manifest).toBe(manifest);
    expect(first[pluginRuntime].hook(undefined as never)).toBe(contributions);
    expect(first[pluginRuntime].hostKey).not.toBe(
      second[pluginRuntime].hostKey,
    );
  });

  it("types an inline hook's api and the contributions in the direct form", () => {
    definePetrinautPlugin(
      {
        id: "test.direct-editor",
        name: "Direct editor",
        access: { document: "read", editor: "read" },
        settings: {
          mode: {
            type: "enum",
            options: ["a", "b"],
            default: "a",
            label: "Mode",
          },
        },
        provides: pluginService<{ ready: boolean }>(),
      },
      (api) => {
        const mode: "a" | "b" = api.settings.get("mode");
        // @ts-expect-error A value outside an enum's options.
        api.settings.set("mode", "c");
        // @ts-expect-error A reader has no edits.
        void api.document.edit;
        // @ts-expect-error An undeclared family is absent.
        void api.experiments;

        return { provides: { ready: mode === "a" } };
      },
    );

    const help = {
      id: "test.direct-help",
      name: "Help",
      commands: { open: { label: "Open" } },
      buttons: { help: { label: "Help", place: "top-bar-end" } },
    } as const;
    const open = { run: () => {} };
    definePetrinautPlugin(help, (api) => ({
      commands: {
        open: { run: () => api.notifications.add({ message: "Open" }) },
      },
      buttons: { help: { icon: null, command: "open" } },
    }));
    definePetrinautPlugin(
      {
        id: "test.direct-status",
        name: "Status",
        provides: pluginService<{ status: "idle" | "busy" }>(),
      },
      (api) => {
        void api.notifications;
        return { provides: { status: "idle" } };
      },
    );
    // @ts-expect-error A declared button the contributions leave out.
    definePetrinautPlugin(help, { commands: { open } });
    definePetrinautPlugin(help, {
      commands: { open },
      buttons: { help: { icon: null, onClick: noop } },
      // @ts-expect-error A contribution the manifest does not declare.
      provides: 1,
    });
    definePetrinautPlugin(help, {
      commands: { open },
      // @ts-expect-error A command the manifest does not declare.
      buttons: { help: { icon: null, command: "close" } },
    });
    definePetrinautPlugin(
      { id: "test.direct-root", name: "Root", root: true },
      // @ts-expect-error The hook returns a contribution the manifest does not declare.
      () => ({ root: null, provides: 1 }),
    );
  });

  it("rejects a manifest key it does not know, at any depth", () => {
    definePetrinautPlugin({
      id: "test.typos",
      name: "Typos",
      // @ts-expect-error A misspelt manifest key.
      comands: { open: { label: "Open" } },
    });
    definePetrinautPlugin({
      id: "test.typos",
      name: "Typos",
      // @ts-expect-error A misspelt access family.
      access: { documnt: "read" },
    });
    definePetrinautPlugin({
      id: "test.typos",
      name: "Typos",
      buttons: {
        // @ts-expect-error A misspelt button key.
        help: { label: "Help", place: "top-bar-end", tooltp: "Help" },
      },
    });
    definePetrinautPlugin({
      id: "test.typos",
      name: "Typos",
      commands: {
        // @ts-expect-error A misspelt command key.
        open: { label: "Open", shortcuts: "mod+o" },
      },
    });
    definePetrinautPlugin({
      id: "test.typos",
      name: "Typos",
      settings: {
        // @ts-expect-error A misspelt setting key.
        on: { type: "boolean", default: true, label: "On", sectoin: "labs" },
      },
    });
    definePetrinautPlugin({
      id: "test.typos",
      name: "Typos",
      // @ts-expect-error A misspelt top-bar item key.
      topBarItems: { status: { place: "top-bar-end", lable: "Status" } },
    });
  });

  it("reserves the editor's command ids", () => {
    expect(() =>
      // @ts-expect-error An id starting "petrinaut." is reserved.
      definePetrinautPlugin({ id: "petrinaut.edit", name: "Edit" }),
    ).toThrow('Plugin id "petrinaut.edit" is reserved.');
    expect(() =>
      definePetrinautPlugin({
        id: "test.dots",
        name: "Dots",
        // @ts-expect-error A command key with a dot.
        commands: { "a.b": { label: "A" } },
      }),
    ).toThrow('Plugin "test.dots" command "a.b" contains a dot.');
    expect(() =>
      definePetrinautPlugin({
        id: "test.colons",
        name: "Colons",
        // @ts-expect-error A view key with a colon.
        views: { "a:b": { label: "A" } },
      }),
    ).toThrow('Plugin "test.colons" view "a:b" contains a colon.');
  });

  it("keeps an enum setting's default among its options", () => {
    expect(() =>
      definePetrinautPlugin({
        id: "test.enum",
        name: "Enum",
        settings: {
          mode: {
            type: "enum",
            options: ["a", "b"],
            // @ts-expect-error A default outside the options.
            default: "c",
            label: "Mode",
          },
        },
      }),
    ).toThrow('Plugin "test.enum" setting "mode" defaults to "c"');
    expect(() =>
      definePetrinautPlugin({
        id: "test.enum",
        name: "Enum",
        settings: {
          // @ts-expect-error Empty options.
          mode: { type: "enum", options: [], default: "a", label: "Mode" },
        },
      }),
    ).toThrow('Plugin "test.enum" setting "mode" defaults to "a"');
  });

  it("refuses a manifest widened to its base type", () => {
    const widened: PetrinautPluginManifest = {
      id: "test.widened",
      name: "Widened",
      access: { document: "read" },
    };
    const kept = {
      id: "test.kept",
      name: "Kept",
      access: { document: "read" },
    } as const satisfies PetrinautPluginManifest;

    // @ts-expect-error The manifest has lost its literal keys.
    definePetrinautPlugin(widened);
    definePetrinautPlugin(kept)((api) => {
      void api.document.net;

      return {};
    });
  });

  it("takes a service type only from pluginService", () => {
    definePetrinautPlugin({
      id: "test.service",
      name: "Service",
      // @ts-expect-error An object that is not a service type.
      provides: {},
    });
  });

  it("requires an action on every button", () => {
    // @ts-expect-error A button with no onClick, command or ref.
    PalettePlugin({ buttons: { toggle: { icon: null } } });
    PalettePlugin({ buttons: { toggle: { icon: null, ref: noop } } });
    CommandsPlugin({
      commands: { open: { run: noop } },
      buttons: { open: { icon: null, command: "open" } },
    });
  });

  it("types settings from the manifest, and gives none without them", () => {
    const PlainPlugin = definePetrinautPlugin({
      id: "test.plain",
      name: "Plain",
    });
    const usePlainPlugin: PluginHook<typeof PlainPlugin> = (api) => {
      // @ts-expect-error A plugin without settings has no settings api.
      void api.settings;

      return {};
    };
    const useEditorPlugin: PluginHook<typeof EditorPlugin> = (api) => {
      // @ts-expect-error A setting the manifest does not declare.
      api.settings.get("unknown");

      return { provides: { ready: true } };
    };

    void usePlainPlugin;
    void useEditorPlugin;
  });
});
