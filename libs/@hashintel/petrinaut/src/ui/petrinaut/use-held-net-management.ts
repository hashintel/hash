import { useState } from "react";

import { useStableCallback } from "../../react/shared/use-stable-callback";

import type { NetManagement } from "../../react/host/net-management-context";
import type { MinimalNetMetadata } from "@hashintel/petrinaut-core";

const sameNets = (
  held: readonly MinimalNetMetadata[],
  given: readonly MinimalNetMetadata[],
) =>
  held === given ||
  (held.length === given.length &&
    held.every((net, index) => {
      const other = given[index];
      return (
        other !== undefined &&
        net.netId === other.netId &&
        net.title === other.title &&
        net.lastUpdated === other.lastUpdated
      );
    }));

const noop = () => {};

/**
 * The host's net-management props as one value that changes only when what
 * they say changes.
 *
 * A host that keeps its nets in React state renders on every edit and hands
 * over a new list and new callbacks each time. This value reaches every
 * reader of the document through context, so a new one on each host render
 * re-renders the whole editor on each keystroke. The list is held for as long
 * as it says the same, and the callbacks keep one identity while calling the
 * host's latest.
 */
export const useHeldNetManagement = ({
  title,
  setTitle,
  existingNets,
  createNewNet,
  loadPetriNet,
}: NetManagement): NetManagement => {
  const [heldNets, setHeldNets] = useState(existingNets);
  if (!sameNets(heldNets, existingNets)) {
    setHeldNets(existingNets);
  }
  const heldSetTitle = useStableCallback(setTitle ?? noop);
  const heldCreateNewNet = useStableCallback(createNewNet);
  const heldLoadPetriNet = useStableCallback(loadPetriNet);
  const titleEditable = setTitle !== undefined;

  return {
    title,
    setTitle: titleEditable ? heldSetTitle : undefined,
    existingNets: heldNets,
    createNewNet: heldCreateNewNet,
    loadPetriNet: heldLoadPetriNet,
  };
};
