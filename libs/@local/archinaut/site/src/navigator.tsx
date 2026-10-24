/**
 * The architecture map: the whole model drawn once, navigated by selecting,
 * focusing and opening pages. The view state lives here and outlives the
 * panel closing, so the map comes back as it was left; the node of the page
 * beside the map is selected whenever that page changes from outside the
 * map. Keys act while focus is inside the map, which a click anywhere in
 * it gives.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import mapModel from "virtual:archinaut-map";

import { indexGraph, regionOf } from "./navigator/model/graph";
import { nodeOfSlug, pageSlugOf } from "./navigator/model/pages";
import { Details } from "./navigator/ui/details";
import {
  NavigatorContext,
  type Transition,
} from "./navigator/ui/navigator-context";
import { Scene } from "./navigator/ui/scene";
import { Toolbar } from "./navigator/ui/toolbar";
import {
  exitFocus,
  focusOn,
  initialViewState,
  reveal,
  select,
  type ViewState,
} from "./navigator/view-state";
import { pagesBySlug } from "./pages";
import "./navigator/navigator.css";

const index = indexGraph(mapModel);

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.tagName === "INPUT" || target.tagName === "TEXTAREA");

export interface NavigatorProps {
  /** Whether the map is showing; it takes focus when it opens. */
  open: boolean;
  /** The slug of the page beside the map. */
  currentSlug: string;
  onOpen: (slug: string) => void;
  onClose: () => void;
}

export const Navigator = ({
  open,
  currentSlug,
  onOpen,
  onClose,
}: NavigatorProps) => {
  const current = nodeOfSlug(index, currentSlug);
  const [state, setState] = useState<ViewState>(() =>
    current === null
      ? initialViewState
      : reveal(initialViewState, current, regionOf(index, current)),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  /** The slug the map itself just opened, which needs no revealing. */
  const [opened, setOpened] = useState<string | null>(null);

  // A new page beside the map means a new place to show on it, unless the
  // map opened that page: then the reader is already looking at it.
  const [previousCurrent, setPreviousCurrent] = useState(current);
  if (current !== previousCurrent) {
    setPreviousCurrent(current);
    if (current !== null && pageSlugOf(current) !== opened) {
      setState(reveal(state, current, regionOf(index, current)));
    }
  }

  useEffect(() => {
    if (open) {
      rootRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  const update = (transition: Transition): void =>
    setState((value) => transition(value));

  const openPage = (slug: string): void => {
    setOpened(slug);
    onOpen(slug);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (isTyping(event.target)) {
      return;
    }
    const handled = (): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (
      event.key === "/" ||
      ((event.metaKey || event.ctrlKey) && event.key === "k")
    ) {
      handled();
      document.getElementById("nav-search")?.focus();
    } else if (event.key === "Escape") {
      handled();
      if (state.mode === "focus") {
        setState(exitFocus(state));
      } else if (state.selected !== null) {
        setState(select(state, null));
      } else {
        onClose();
      }
    } else if (event.key === "Enter" && state.selected !== null) {
      const slug = pageSlugOf(state.selected);
      if (slug !== null && pagesBySlug.has(slug)) {
        handled();
        openPage(slug);
      }
    } else if (
      (event.key === "f" || event.key === "F") &&
      state.selected !== null
    ) {
      handled();
      setState(focusOn(state, state.selected));
    }
  };

  return (
    <NavigatorContext
      value={{
        index,
        pages: pagesBySlug,
        current,
        state,
        update,
        open: openPage,
        close: onClose,
      }}
    >
      <div
        ref={rootRef}
        className="nav-app"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <Toolbar />
        <Scene>
          <Details />
        </Scene>
      </div>
    </NavigatorContext>
  );
};
