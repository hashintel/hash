import { useState } from "react";

import {
  definePetrinautPlugin,
  type PluginHook,
} from "@hashintel/petrinaut/ui";

import { WalkthroughDialog } from "./plugin/walkthrough-dialog";
import { walkthroughSteps } from "./plugin/walkthrough-steps";

const createWalkthroughPlugin = definePetrinautPlugin({
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
      description: "Show the welcome guide the next time Petrinaut opens.",
    },
  },
});

const useWalkthroughPlugin: PluginHook<typeof createWalkthroughPlugin> = (
  api,
) => {
  // Read once: changing the setting takes effect the next time the editor opens.
  const [open, setOpen] = useState(() => api.settings.get("showOnInit"));
  const close = () => {
    setOpen(false);
    api.settings.set("showOnInit", false);
  };

  return {
    root: open && (
      <WalkthroughDialog steps={walkthroughSteps} onClose={close} />
    ),
    overlay: open,
  };
};

/** The welcome guide over the editor as it opens; dismissing it turns its setting off. */
export const walkthroughPlugin = createWalkthroughPlugin(useWalkthroughPlugin);
