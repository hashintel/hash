import { use, useState } from "react";

import { useCommand } from "../../../react/commands/command-registry";
import { definePetrinautPlugin } from "../plugin";
import { PluginContributionBoundary } from "../plugin-boundary";
import { loadOnce } from "./reactive-modules-plugin/load-once";

import type { ReactiveModulesPanel } from "../../views/Editor/panels/reactive-modules-panel";

const pluginId = "petrinaut.reactive-modules";

/**
 * The window and the compiler behind it load only when the window is first
 * shown; most sessions never open it. This module stays small because the
 * editor imports every built-in plugin eagerly.
 */
const loadReactiveModulesPanel = loadOnce(
  (): Promise<{ ReactiveModulesPanel: typeof ReactiveModulesPanel }> =>
    import("../../views/Editor/panels/reactive-modules-panel"),
);

const LoadedReactiveModulesPanel = ({ onClose }: { onClose: () => void }) => {
  const { ReactiveModulesPanel: Panel } = use(loadReactiveModulesPanel());
  return <Panel onClose={onClose} />;
};

/**
 * Owns the window's open state and its palette command. The command sits
 * outside the window's boundary, so a failed load or render closes only the
 * window; running the command again clears the failure and retries.
 */
const ReactiveModulesWindow = () => {
  const [isOpen, setOpen] = useState(false);
  const [showRequests, setShowRequests] = useState(0);

  useCommand({
    id: `${pluginId}.show`,
    label: "Show Zeroth Reactive Modules",
    category: "Editor",
    keywords: [
      "zeroth",
      "reactive",
      "module",
      "export",
      "compile",
      "python",
      "ir",
    ],
    run: () => {
      setOpen(true);
      setShowRequests((count) => count + 1);
    },
  });

  return isOpen ? (
    <PluginContributionBoundary
      pluginId={pluginId}
      contributionId={`${pluginId}.window`}
      place="component"
      resetKey={showRequests}
    >
      <LoadedReactiveModulesPanel onClose={() => setOpen(false)} />
    </PluginContributionBoundary>
  ) : null;
};

/**
 * The Zeroth Reactive Modules window: the current net compiled to the Petri
 * net IR and to a Zeroth reactive module, opened from the palette.
 */
export const reactiveModulesPlugin = definePetrinautPlugin({
  id: pluginId,
  name: "Zeroth Reactive Modules",
  component: ReactiveModulesWindow,
});
