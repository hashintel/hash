/**
 * The demo site's command palette as a plugin: the overlay with its ⌘K opener
 * renders inside the editor, and a top-bar button runs the palette's own
 * toggle command.
 */

import { MdKeyboardCommandKey } from "react-icons/md";

import { definePetrinautPlugin } from "@hashintel/petrinaut/ui";

import { CommandPalette, toggleCommandId } from "./plugin/command-palette";

export const commandPalettePlugin = definePetrinautPlugin(
  {
    id: "website.command-palette",
    name: "Command palette",
    description:
      "Press ⌘K or Ctrl+K, or the button at the end of the top bar, to search and run the editor's commands and the plugins' commands.",
    author: "HASH",
    buttons: {
      toggle: {
        label: "Command palette",
        place: "top-bar-end",
        tooltip: "Command palette (⌘K / Ctrl+K)",
      },
    },
  },
  () => ({
    root: <CommandPalette />,
    buttons: {
      toggle: {
        icon: <MdKeyboardCommandKey size={16} />,
        command: toggleCommandId,
      },
    },
  }),
);
