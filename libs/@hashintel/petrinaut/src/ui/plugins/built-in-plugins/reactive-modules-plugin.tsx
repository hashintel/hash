import { use, useState } from "react";

import { useCommand } from "../../../react/commands/command-registry";
import { loadOnce } from "../../lib/load-once";
import { definePetrinautPlugin } from "../plugin";
import { PluginContributionBoundary } from "../plugin-boundary";

import type { ReactiveModulesPanel } from "../../views/Editor/panels/reactive-modules-panel";

const pluginId = "petrinaut.reactive-modules";

type PanelModule = { ReactiveModulesPanel: typeof ReactiveModulesPanel };

/**
 * The window and the export behind it load only when the window is first
 * shown; most sessions never open it. This module stays small because the
 * editor imports every built-in plugin eagerly.
 */
const loadReactiveModulesPanel = loadOnce(
  (): Promise<PanelModule> =>
    import("../../views/Editor/panels/reactive-modules-panel"),
);

const LoadedReactiveModulesPanel = ({
  panel,
  onClose,
}: {
  panel: Promise<PanelModule>;
  onClose: () => void;
}) => {
  const { ReactiveModulesPanel: Panel } = use(panel);
  return <Panel onClose={onClose} />;
};

/**
 * Owns the window's open state and its palette command. The command sits
 * outside the window's boundary, so a failed load or render closes only the
 * window; running the command again clears the failure and retries.
 *
 * The panel's import is held here, in a component that has committed, so the
 * window reads one promise until it settles. Asking the loader in the
 * window's own render would start a new import on every retry render after a
 * failure, because a component that suspends before it commits keeps no
 * state. A show after a failed load asks for a new import.
 */
const ReactiveModulesWindow = () => {
  const [panel, setPanel] = useState<Promise<PanelModule> | null>(null);
  const [showRequests, setShowRequests] = useState(0);

  useCommand({
    id: `${pluginId}.show`,
    label: "Show Zeroth Reactive Modules",
    category: "Editor",
    keywords: ["zeroth", "reactive", "module", "export", "compile", "ir"],
    run: () => {
      setPanel(loadReactiveModulesPanel());
      setShowRequests((count) => count + 1);
    },
  });

  return panel ? (
    <PluginContributionBoundary
      pluginId={pluginId}
      contributionId={`${pluginId}.window`}
      place="component"
      resetKey={showRequests}
    >
      <LoadedReactiveModulesPanel
        panel={panel}
        onClose={() => setPanel(null)}
      />
    </PluginContributionBoundary>
  ) : null;
};

/**
 * The Zeroth Reactive Modules window: the current net compiled to the Petri
 * net IR, opened from the palette.
 */
export const reactiveModulesPlugin = definePetrinautPlugin({
  id: pluginId,
  name: "Zeroth Reactive Modules",
  component: ReactiveModulesWindow,
});
