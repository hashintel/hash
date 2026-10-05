/**
 * The welcome guide as a Petrinaut plugin. It opens when the editor view
 * mounts, if its setting says so; dismissing it closes it and turns the
 * setting off, so it stays away until the user asks for it again under User
 * settings. While it is open the editor holds back its own first-run prompts.
 */

import { useState } from "react";

import {
  definePetrinautPlugin,
  definePluginManifest,
} from "@hashintel/petrinaut/ui";

import { WalkthroughDialog } from "./plugin/walkthrough-dialog";
import { walkthroughSteps } from "./walkthrough-steps";

export const walkthroughManifest = definePluginManifest({
  id: "website.walkthrough",
  name: "Welcome guide",
  description:
    "A short tour of the editor, simulations and the assistant, shown when the editor opens until it is dismissed.",
  author: "HASH",
  settings: {
    showOnInit: {
      type: "boolean",
      default: true,
      label: "Show welcome guide",
      description:
        "Show the getting-started guide when you next open Petrinaut.",
      section: "general",
    },
  },
});
export type WalkthroughManifest = typeof walkthroughManifest;

export const walkthroughPlugin = definePetrinautPlugin(
  walkthroughManifest,
  (api) => {
    // Seeded once: changing the setting mid-session takes effect at the next open.
    const [open, setOpen] = useState(() => api.settings.get("showOnInit"));
    const close = () => {
      setOpen(false);
      api.settings.set("showOnInit", false);
    };

    return {
      root: (
        <WalkthroughDialog
          steps={walkthroughSteps}
          open={open}
          onClose={close}
        />
      ),
      overlay: open,
    };
  },
);
