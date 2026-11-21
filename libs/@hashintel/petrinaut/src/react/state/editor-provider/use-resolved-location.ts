import { use, useEffect } from "react";

import { usePetrinautNavigation } from "../../navigation/navigation";
import { resolveNavigatedItems } from "../../navigation/resolve-navigated-ids";
import { SDCPNContext } from "../sdcpn-context";

/**
 * The location's Simulate resource and selection as the document holds them,
 * written back to the location where they differ from it.
 *
 * Resolved during render, so children never see an older link's ids. A hook
 * of its own, so the compiler takes the result as final: what the editor
 * builds from it then changes only when its part of the result does.
 */
export const useResolvedLocation = () => {
  const { navigate, state: location } = usePetrinautNavigation();
  const { getItemType, petriNetDefinition } = use(SDCPNContext);
  const { simulateResource, selection } = location;
  const { scenarios, metrics } = petriNetDefinition;
  const resolved = resolveNavigatedItems(
    { simulateResource, selection },
    { scenarios, metrics },
    getItemType,
  );

  useEffect(() => {
    const resourceChanged = resolved.simulateResource !== simulateResource;

    if (resourceChanged || resolved.selection !== selection) {
      // The checks above read the committed state, but the update is applied
      // to the host's freshest state, which an asynchronous host may already
      // have moved on from. Resolve again inside the updater so normalization
      // never writes back a selection the user has since replaced.
      navigate(
        (current) => ({
          ...current,
          ...resolveNavigatedItems(
            current,
            { scenarios, metrics },
            getItemType,
          ),
        }),
        {
          cause: "normalization",
          action: resourceChanged ? "simulation-resource" : "selection",
        },
      );
    }
  }, [
    getItemType,
    metrics,
    navigate,
    resolved,
    scenarios,
    selection,
    simulateResource,
  ]);

  return resolved;
};
