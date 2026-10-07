import { definePetrinautPlugin } from "@hashintel/petrinaut";

import { EmbedActions, EmbedBreadcrumbs } from "./embed-chrome";

/** HASH's breadcrumbs, version picker and Save in the embed's top bar. */
export const embedChromePlugin = definePetrinautPlugin({
  id: "hash.process-embed",
  name: "Process controls",
  description:
    "The Processes link, the process title, the version picker and Save, in the top bar.",
  author: "HASH",
  topBarItems: {
    breadcrumbs: { place: "top-bar-start" },
    actions: { place: "top-bar-end" },
  },
})({
  topBarItems: {
    breadcrumbs: <EmbedBreadcrumbs />,
    actions: <EmbedActions />,
  },
});
