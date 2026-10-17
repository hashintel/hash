import { use, useEffect, type ReactNode } from "react";

import { css } from "@hashintel/ds-helpers/css";
import { ErrorTrackerContext } from "@hashintel/petrinaut/react";
import {
  definePetrinautPlugin,
  pluginService,
  usePluginService,
  type AccessApi,
  type PluginHook,
} from "@hashintel/petrinaut/ui/plugin";

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
    "Gives the Brunch assistant's cards and Ledger tab the open net, its experiments and the editor's navigation.",
  author: "HASH",
  // Brunch's cards can't work without it, so the user cannot switch it off.
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

const missingPluginStyle = css({
  padding: "2",
  borderRadius: "md",
  backgroundColor: "red.a10",
  color: "neutral.s100",
  fontSize: "xs",
  lineHeight: "relaxed",
});

/**
 * Renders `children` with the Brunch plugin's `api`. The editor shows its view
 * only after every plugin has run, so a missing `api` means the host left the
 * plugin out or it failed: the card says so and the failure is reported,
 * rather than an approval waiting with nothing to answer it.
 */
export const WithBrunchEditorApi = ({
  children,
}: {
  children: (api: BrunchEditorApi) => ReactNode;
}) => {
  const api = usePluginService(BrunchPlugin);
  const { captureException } = use(ErrorTrackerContext);
  const missing = api === undefined;
  useEffect(() => {
    if (missing) {
      captureException(new Error("The Brunch editor plugin is not running"), {
        source: "brunch.editor-plugin",
      });
    }
  }, [missing, captureException]);

  return api === undefined ? (
    <p className={missingPluginStyle} role="alert">
      Brunch can’t show this card because its editor plugin isn’t running.
    </p>
  ) : (
    children(api)
  );
};
