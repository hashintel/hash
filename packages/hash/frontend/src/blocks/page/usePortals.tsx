import React, {
  Fragment,
  ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ReplacePortals } from "./tsUtils";
import { v4 as uuid } from "uuid";
import { createPortal } from "react-dom";

type PortalSet = Map<HTMLElement, { key: string; reactNode: ReactNode }>;

/**
 * In order to integrate with Prosemirror, we want to be able to render to any arbitrary DOM node whilst staying within
 * our single React root. React-dom includes a feature called portals for this, but they return elements that need to be
 * returned by a React component, so we need to provide a function that can be called from within prosemirror that will
 * update a piece of state which we can map to portals. A further complication is we don't want to re-render immediately
 * every time a request is made to update a portal, as individual prosemirror nodes will make their requests one at a
 * time, so we should defer all re-renders to the end of the current tick. Finally, in theory, the same JSX could be
 * moved to a different DOM node, so the API needs to support changing the DOM target of a given portal.
 */
export const usePortals = () => {
  const [portals, setPortals] = useState<PortalSet>(new Map());

  const portalQueue = useRef<((set: PortalSet) => void)[]>([]);
  const portalQueueTimeout = useRef<ReturnType<typeof setImmediate> | null>(
    null
  );

  /**
   * Call this to render a piece of JSX to a given DOM node, or to move it from a previous DOM node to a new one.
   *
   * replacePortal(previousDomNode, nextDomNode, jsx)
   *
   * To clear, pass null for both nextNode and jsx
   */
  const replacePortal = useCallback<ReplacePortals>(
    (existingNode, nextNode, reactNode) => {
      if (portalQueueTimeout.current !== null) {
        clearImmediate(portalQueueTimeout.current);
      }

      portalQueue.current.push((nextPortals) => {
        if (existingNode && existingNode !== nextNode) {
          nextPortals.delete(existingNode);
        }

        if (nextNode && reactNode) {
          const key = nextPortals.get(nextNode)?.key ?? uuid();

          nextPortals.set(nextNode, { key, reactNode });
        }
      });

      portalQueueTimeout.current = setImmediate(() => {
        const queue = portalQueue.current;
        portalQueue.current = [];

        setPortals((portals) => {
          const nextPortals = new Map(portals);

          for (const cb of queue) {
            cb(nextPortals);
          }

          return nextPortals;
        });
      });
    },
    []
  );

  useLayoutEffect(() => {
    return () => {
      if (portalQueueTimeout.current !== null) {
        clearImmediate(portalQueueTimeout.current);
      }
    };
  }, []);

  const clearPortals = useCallback(() => setPortals(new Map()), []);

  const renderedPortals = Array.from(portals.entries()).map(
    ([target, { key, reactNode }]) => (
      <Fragment key={key}>{createPortal(reactNode, target)}</Fragment>
    )
  );

  return [renderedPortals, replacePortal, clearPortals] as const;
};
