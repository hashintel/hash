import { useEffect, useState } from "react";

import {
  definePetrinautPlugin,
  type DocChangeEvent,
  type PluginHook,
} from "../plugin";
import {
  DocumentView,
  type ChangesAs,
} from "./document-view-plugin/document-view";
import { ExpansionControls } from "./document-view-plugin/expansion-controls";
import { openTo, toggleRow } from "./document-view-plugin/outline/rows";

const DocumentViewPlugin = definePetrinautPlugin({
  id: "hash.document",
  name: "Document view",
  description:
    "Show what the document's handle holds, and the changes it reports, in a tab of the bottom panel.",
  author: "HASH",
  access: { document: "read" },
  settings: {
    showDocument: {
      type: "boolean",
      default: false,
      label: "Show document view",
      description:
        "Add a Document data tab to the bottom panel, with the document's content and its latest changes.",
    },
  },
  bottomPanelViews: {
    document: {
      title: "Document data",
      tooltip:
        "The net as the document's handle holds it, and the patches of each change since the tab appeared.",
    },
  },
});

/** How many changes are kept: the view shows what just happened, not a log. */
const changeLimit = 50;

const useDocumentViewPlugin: PluginHook<typeof DocumentViewPlugin> = (api) => {
  const shown = api.settings.get("showDocument");
  const { handle } = api.document;
  const [expansion, setExpansion] = useState(() => openTo(1));
  // Kept here, latest first, where they outlive the tab's turns out of view.
  const [changes, setChanges] = useState<readonly DocChangeEvent[]>([]);
  const [changesAs, setChangesAs] = useState<ChangesAs>("formatted");

  useEffect(() => {
    if (!shown) {
      return undefined;
    }
    return handle.subscribe((change) =>
      setChanges((earlier) => [change, ...earlier].slice(0, changeLimit)),
    );
  }, [handle, shown]);

  return {
    bottomPanelViews: {
      document: {
        when: shown,
        content: (
          <DocumentView
            handle={handle}
            changes={changes}
            changesAs={changesAs}
            onChangesAs={setChangesAs}
            expansion={expansion}
            onToggle={(path) => setExpansion(toggleRow(expansion, path))}
          />
        ),
        headerAction: (
          <ExpansionControls
            onExpandAll={() => setExpansion(openTo(Infinity))}
            onCollapseAll={() => setExpansion(openTo(0))}
          />
        ),
      },
    },
  };
};

/**
 * Shows what the document's handle holds, and the changes it reports, in a
 * tab of the bottom panel, once switched on in User settings.
 */
export const documentViewPlugin = DocumentViewPlugin(useDocumentViewPlugin);
