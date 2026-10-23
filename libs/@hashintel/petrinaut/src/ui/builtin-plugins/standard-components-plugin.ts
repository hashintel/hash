/**
 * @layerRoot ui.builtin-plugins
 * @role Plugins the package ships for hosts to pass to the editor: the standard component library and the Code view
 */

import {
  standardComponentLibrary,
  standardComponentLibraryId,
} from "@hashintel/petrinaut-core";

import { definePetrinautPlugin } from "../plugins/define-petrinaut-plugin";

/**
 * Offers the standard component library in the Components panel: sources,
 * sinks, stages, servers and routers of untyped tokens. A host passes it to
 * `<Petrinaut plugins>`; a document that uses one of its components keeps a
 * copy of the subnet, so the document stays complete without the plugin.
 */
export const standardComponentsPlugin = definePetrinautPlugin(
  {
    id: standardComponentLibraryId,
    name: standardComponentLibrary.name,
    description: standardComponentLibrary.description,
    author: "HASH",
    componentLibrary: { name: standardComponentLibrary.name },
  },
  { componentLibrary: standardComponentLibrary.components },
);
