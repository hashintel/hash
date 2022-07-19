import { Fragment, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BlockPortal } from "./usePortals";
import { BlockContext } from "./BlockContext";

export interface PortalProps {
  draftId: string;
  portals: [HTMLElement, BlockPortal][];
}

export const BlockPortals = ({ draftId, portals }: PortalProps) => {
  const [error, setError] = useState(false);

  const context = useMemo(
    () => ({
      id: draftId,
      error,
      setError,
    }),
    [draftId, error, setError],
  );

  return (
    <BlockContext.Provider key={draftId} value={context}>
      {portals.map(([target, { key, reactNode }]) => {
        return <Fragment key={key}>{createPortal(reactNode, target)}</Fragment>;
      })}
    </BlockContext.Provider>
  );
};
