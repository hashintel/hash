import { useState } from "react";

import { StaticHashIcon } from "@hashintel/ds-icons/static";
import {
  definePetrinautPlugin,
  type PluginHook,
} from "@hashintel/petrinaut/ui/plugin";

import { CommandPalette } from "./plugin/command-palette";

import type { ComponentProps } from "react";

const MdKeyboardCommandKey = (
  props: Omit<ComponentProps<typeof StaticHashIcon>, "name">,
) => <StaticHashIcon {...props} name="command" />;

const CommandPalettePlugin = definePetrinautPlugin({
  id: "website.command-palette",
  name: "Command palette",
  description:
    "Press ⌘K or Ctrl+K, or the top-bar button, to search and run commands.",
  author: "HASH",
  commands: {
    toggle: {
      label: "Toggle the command palette",
      category: "Editor",
      keywords: ["palette", "commands", "search"],
      shortcut: "mod+k",
    },
  },
  buttons: {
    toggle: {
      label: "Command palette",
      place: "top-bar-end",
      tooltip: "Command palette (⌘K / Ctrl+K)",
    },
  },
  root: true,
});

const useCommandPalettePlugin: PluginHook<typeof CommandPalettePlugin> = () => {
  const [isOpen, setOpen] = useState(false);
  const toggle = () => setOpen((open) => !open);

  return {
    commands: { toggle: { run: toggle } },
    buttons: {
      toggle: {
        icon: <MdKeyboardCommandKey size={16} />,
        command: "toggle",
      },
    },
    root: isOpen ? <CommandPalette onClose={() => setOpen(false)} /> : null,
    overlay: isOpen,
  };
};

/** The ⌘K palette over the editor's commands, with a top-bar button. */
export const commandPalettePlugin = CommandPalettePlugin(
  useCommandPalettePlugin,
);
