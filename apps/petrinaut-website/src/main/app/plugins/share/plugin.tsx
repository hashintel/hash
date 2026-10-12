import {
  definePetrinautPlugin,
  type PluginHook,
} from "@hashintel/petrinaut/ui/plugin";

import { navigationStateToSharedSearch } from "../../../../examples/navigation-search";
import { ShareSnapshotButton } from "../../../../sharing/share-snapshot-button";

const createSharePlugin = definePetrinautPlugin({
  id: "website.share",
  name: "Share",
  description:
    "A top-bar dropdown with a link that carries a read-only snapshot of the net, and a download of the net as a file.",
  author: "HASH",
  access: { document: "read", editor: "read" },
  topBarItems: { share: { place: "top-bar-end" } },
});

/** Reads the net, its title and the view when the dropdown opens, so it subscribes to nothing. */
const useSharePlugin: PluginHook<typeof createSharePlugin> = (api) => ({
  topBarItems: {
    share: (
      <ShareSnapshotButton
        getSnapshot={() => ({
          title: api.document.title.get(),
          definition: api.document.net.get(),
        })}
        getSearch={() =>
          navigationStateToSharedSearch(api.editor.navigation.get())
        }
      />
    ),
  },
});

/** **Share** in the top bar: a dropdown with a `/share` snapshot link, Copy and Download. */
export const sharePlugin = createSharePlugin(useSharePlugin);
