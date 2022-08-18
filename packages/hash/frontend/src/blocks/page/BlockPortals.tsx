import { Fragment, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BlockPortal } from "./usePortals";
import { BlockContext } from "./BlockContext";

export interface PortalProps {
  draftId: string;
  portals: [HTMLElement, BlockPortal][];
}

/**
 * Creates portals to render the elements that make up a specific block on the page, and provides shared context to both.
 * The two elements rendered into portals are defined in BlockView (context controls) and ComponentView (block content).
 * @param draftId the draftId of the block these portals belong to
 * @param portals the pairings of nodes and elements needed to create the portals
 */
export const BlockPortals = ({ draftId, portals }: PortalProps) => {
  const [error, setError] = useState(false);
  const [showDataMappingUi, setShowDataMappingUi] = useState(false);

  const context = useMemo(
    () => ({
      id: draftId,
      error,
      setError,
      showDataMappingUi,
      setShowDataMappingUi,
    }),
    [draftId, error, setError, showDataMappingUi, setShowDataMappingUi],
  );

  return (
    <BlockContext.Provider key={draftId} value={context}>
      {portals.map(([target, { key, reactNode }]) => {
        return <Fragment key={key}>{createPortal(reactNode, target)}</Fragment>;
      })}
    </BlockContext.Provider>
  );
};
