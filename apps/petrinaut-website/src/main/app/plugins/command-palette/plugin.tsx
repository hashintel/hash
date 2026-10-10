import { MdKeyboardCommandKey } from "react-icons/md";

import { definePetrinautPlugin } from "@hashintel/petrinaut/ui";

import { CommandPalette, toggleCommandId } from "./plugin/command-palette";

/** The ⌘K palette over the editor's commands, with a top-bar button. */
export const commandPalettePlugin = definePetrinautPlugin({
  id: "website.command-palette",
  name: "Command palette",
  description:
    "Press ⌘K or Ctrl+K, or the top-bar button, to search and run commands.",
  author: "HASH",
  buttons: {
    toggle: {
      label: "Command palette",
      place: "top-bar-end",
      tooltip: "Command palette (⌘K / Ctrl+K)",
    },
  },
})({
  root: <CommandPalette />,
  buttons: {
    toggle: {
      icon: <MdKeyboardCommandKey size={16} />,
      command: toggleCommandId,
    },
  },
});
