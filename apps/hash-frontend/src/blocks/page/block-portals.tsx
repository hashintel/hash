import { EntityRootType, Subgraph } from "@blockprotocol/graph/temporal";
import { Fragment, ReactNode, useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { v4 as uuid } from "uuid";

import { BlockContext, BlockContextType } from "./block-context";

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
  const [blockSubgraph, setBlockSubgraph] = useState<
    Subgraph<EntityRootType> | undefined
  >();

  const context = useMemo<BlockContextType>(
    () => ({
      id: draftId,
      error,
      setError,
      blockSubgraph,
      setBlockSubgraph,
    }),
    [draftId, error, setError, blockSubgraph, setBlockSubgraph],
  );

  return (
    <BlockContext.Provider key={draftId} value={context}>
      {portals.map(([target, { key, reactNode }]) => {
        return <Fragment key={key}>{createPortal(reactNode, target)}</Fragment>;
      })}
    </BlockContext.Provider>
  );
};

export type BlockPortal = { id: string; key: string; reactNode: ReactNode };

type PortalSet = Map<HTMLElement, BlockPortal>;

export type RenderPortal = (
  reactNode: ReactNode | null,
  node: HTMLElement | null,
  id?: string,
) => void;

const blankPortals = new Map();

/**
 * In order to integrate with Prosemirror, we want to be able to render to any
 * arbitrary DOM node whilst staying within our single React root. React-dom
 * includes a feature called portals for this, but they return elements that
 * need to be returned by a React component, so we need to provide a function
 * that can be called from within prosemirror that will update a piece of state
 * which we can map to portals.
 */
export const usePortals = () => {
  const [portals, setPortals] = useState<PortalSet>(blankPortals);
  /**
   * Call this to render a piece of JSX to a given DOM node in a portal
   *
   * renderPortal(jsx, node)
   *
   * To clear, pass null for jsx
   */
  const renderPortal = useCallback<RenderPortal>((reactNode, node, id = "") => {
    if (node) {
      setPortals((prevPortals) => {
        const nextPortals = new Map(prevPortals);

        if (reactNode) {
          const key = nextPortals.get(node)?.key ?? uuid();

          nextPortals.set(node, { id, key, reactNode });
        } else {
          nextPortals.delete(node);
        }

        return nextPortals;
      });
    }
  }, []);

  const clearPortals = useCallback(() => {
    setPortals(blankPortals);
  }, []);

  // Group the portals by the block they belong to
  const groupedPortals = Array.from(portals.entries()).reduce(
    (obj, portal) => {
      const id = portal[1].id;

      return { ...obj, [id]: [...(obj[id] ?? []), portal] };
    },
    {} as {
      [id: string]: [HTMLElement, BlockPortal][];
    },
  );

  const renderedPortals = Object.keys(groupedPortals).map((draftId) => {
    return (
      <BlockPortals
        key={draftId}
        draftId={draftId}
        portals={groupedPortals[draftId]!}
      />
    );
  });

  return [renderedPortals, renderPortal, clearPortals] as const;
};
