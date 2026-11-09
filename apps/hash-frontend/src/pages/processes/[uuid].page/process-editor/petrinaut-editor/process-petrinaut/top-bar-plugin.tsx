import { definePetrinautPlugin } from "@hashintel/petrinaut/ui/plugin";

import { TopBarActions, TopBarBreadcrumbs } from "./top-bar-plugin/top-bar";

/** HASH's breadcrumbs, version picker and Save in the editor's top bar. */
export const topBarPlugin = definePetrinautPlugin({
  id: "hash.process-embed",
  name: "Process controls",
  description:
    "The Processes link, the process title, the version picker and Save, in the top bar.",
  author: "HASH",
  required: true,
  topBarItems: {
    breadcrumbs: { place: "top-bar-start" },
    actions: { place: "top-bar-end" },
  },
})({
  topBarItems: {
    breadcrumbs: <TopBarBreadcrumbs />,
    actions: <TopBarActions />,
  },
});
