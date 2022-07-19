import React, { Fragment, ReactNode, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { v4 as uuid } from "uuid";

type PortalSet = Map<HTMLElement, { key: string; reactNode: ReactNode }>;

export type RenderPortal = (
  reactNode: React.ReactNode | null,
  node: HTMLElement | null,
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
  const renderPortal = useCallback<RenderPortal>((reactNode, node) => {
    if (node) {
      setPortals((prevPortals) => {
        const nextPortals = new Map(prevPortals);

        if (reactNode) {
          const key = nextPortals.get(node)?.key ?? uuid();

          nextPortals.set(node, { key, reactNode });
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

  const renderedPortals = Array.from(portals.entries()).map(
    ([target, { key, reactNode }]) => (
      <Fragment key={key}>{createPortal(reactNode, target)}</Fragment>
    ),
  );

  return [renderedPortals, renderPortal, clearPortals] as const;
};
