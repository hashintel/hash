import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  definePetrinautPlugin,
  type PluginHook,
} from "@hashintel/petrinaut/ui";

import { saveNetInStorage } from "../main/app/local-storage-demo/use-local-storage-sdcpns";
import { navigationStateToSharedSearch } from "./navigation-search";

const copyFailedStyle = css({
  color: "red.s100",
  fontSize: "xs",
  whiteSpace: "nowrap",
});

const createLocalCopyPlugin = definePetrinautPlugin({
  id: "website.local-copy",
  name: "Local copy",
  description:
    "A top-bar button that saves an editable copy of a read-only document in this browser and opens it.",
  author: "HASH",
  access: { document: "read", editor: "read" },
  topBarItems: { makeLocalCopy: { place: "top-bar-end" } },
});

/** Saves the net under its title plus "(copy)", then opens it at `/local/$netId` with the current view. */
const useLocalCopyPlugin: PluginHook<typeof createLocalCopyPlugin> = (api) => {
  const navigate = useNavigate();
  const [copyFailed, setCopyFailed] = useState(false);

  const makeLocalCopy = () => {
    try {
      const net = saveNetInStorage(window.localStorage, {
        petriNetDefinition: api.document.net.get(),
        title: `${api.document.title.get()} (copy)`,
      });
      void navigate({
        to: "/local/$netId",
        params: { netId: net.id },
        search: navigationStateToSharedSearch(api.editor.navigation.get()),
      });
    } catch {
      setCopyFailed(true);
    }
  };

  return {
    topBarItems: {
      makeLocalCopy: (
        <>
          {copyFailed ? (
            <span className={copyFailedStyle} role="alert">
              Couldn't save: browser storage is full or blocked
            </span>
          ) : null}
          <Button size="sm" variant="subtle" onClick={makeLocalCopy}>
            Make a local copy
          </Button>
        </>
      ),
    },
  };
};

/** "Make a local copy" in the top bar of a read-only document. */
export const localCopyPlugin = createLocalCopyPlugin(useLocalCopyPlugin);
