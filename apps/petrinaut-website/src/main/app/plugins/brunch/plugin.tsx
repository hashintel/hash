import {
  definePetrinautPlugin,
  pluginService,
  usePluginService,
  type AccessApi,
  type PluginHook,
} from "@hashintel/petrinaut/ui/plugin";

import type { ReactNode } from "react";

const brunchAccess = {
  document: "read",
  experiments: "write",
  editor: "write",
} as const;

/** What Brunch's cards and controls reach inside the editor. */
export type BrunchEditorApi = AccessApi<typeof brunchAccess>;

const BrunchPlugin = definePetrinautPlugin({
  id: "website.brunch",
  name: "Brunch",
  description:
    "Gives the Brunch assistant's cards the open net, its experiments and the editor's navigation.",
  author: "HASH",
  // Brunch's cards render nothing without it, so the user cannot switch it off.
  required: true,
  access: brunchAccess,
  provides: pluginService<BrunchEditorApi>(),
});

/** Contributes nothing visible: it hands its `api` to Brunch's cards. */
const useBrunchPlugin: PluginHook<typeof BrunchPlugin> = (api) => ({
  provides: api,
});

/** Runs while Brunch is the assistant, so its cards read the editor through `api`. */
export const brunchPlugin = BrunchPlugin(useBrunchPlugin);

/**
 * Renders `children` with the Brunch plugin's `api`, or nothing until the
 * plugin runs in this editor.
 */
export const WithBrunchEditorApi = ({
  children,
}: {
  children: (api: BrunchEditorApi) => ReactNode;
}) => {
  const api = usePluginService(BrunchPlugin);
  return api === undefined ? null : children(api);
};
