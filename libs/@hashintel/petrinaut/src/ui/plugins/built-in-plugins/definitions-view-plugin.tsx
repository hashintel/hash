import { use } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { NotebookView } from "../../views/Notebook/notebook-view";
import { definePetrinautPlugin } from "../plugin";

// The Canvas / Definitions selector floats over this corner of the toolbar.
const editViewSelectorSpaceStyle = css({
  width: "[var(--edit-view-selector-width)]",
  flexShrink: "0",
});

const DefinitionsView = () => {
  const { petriNetId } = use(SDCPNContext);
  return (
    <NotebookView
      key={petriNetId ?? "no-net"}
      toolbarStart={<div aria-hidden className={editViewSelectorSpaceStyle} />}
    />
  );
};

/**
 * The Definitions view: the net as expandable cells beside the Canvas. Its
 * edit view keeps the `definitions` id that host URLs already carry.
 */
export const definitionsViewPlugin = definePetrinautPlugin({
  id: "petrinaut.definitions-view",
  name: "Definitions view",
  editViews: [
    { id: "definitions", label: "Definitions", component: DefinitionsView },
  ],
});
