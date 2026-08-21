import { Fragment } from "react";
import { createPortal } from "react-dom";

import { BlockContextProvider } from "./block-context-provider";

import type { ReactNode } from "react";

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
  return (
    <BlockContextProvider key={draftId}>
      {portals.map(([target, { key, reactNode }]) => {
        return <Fragment key={key}>{createPortal(reactNode, target)}</Fragment>;
      })}
    </BlockContextProvider>
  );
};

export type BlockPortal = { id: string; key: string; reactNode: ReactNode };

export type RenderPortal = (
  reactNode: ReactNode | null,
  node: HTMLElement | null,
  id?: string,
) => void;
