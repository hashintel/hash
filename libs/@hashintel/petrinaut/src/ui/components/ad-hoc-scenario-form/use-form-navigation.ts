/**
 * Form-wide keyboard navigation between components ("zones"): each grid,
 * section header, place header, or lone cell registers itself as a zone and
 * keeps owning its internal arrow-key movement; when a vertical move runs off
 * the zone's edge, the zone asks the form to carry focus into the next or
 * previous zone in document order. Zones that cannot take focus (inside a
 * collapsed section) are skipped, so the walk always lands somewhere visible.
 */

import { createContext, use, useEffect, useId, useRef, useState } from "react";

export type NavigationEdge = "first" | "last";
export type NavigationDirection = "previous" | "next";

interface NavigationZoneHandle {
  /** The zone's root element, for document-order sorting. */
  element: HTMLElement;
  /**
   * Move focus into the zone at one edge ("first" entering downward, "last"
   * entering upward). Returns whether focus landed.
   */
  enter: (edge: NavigationEdge) => boolean;
}

export interface FormNavigation {
  register: (id: string, handle: NavigationZoneHandle) => void;
  unregister: (id: string) => void;
  /** Focus the requesting zone's neighbour. Returns whether focus moved. */
  exit: (id: string, direction: NavigationDirection) => boolean;
}

const NOOP_NAVIGATION: FormNavigation = {
  register: () => {},
  unregister: () => {},
  exit: () => false,
};

export const FormNavigationContext =
  createContext<FormNavigation>(NOOP_NAVIGATION);

/** Focuses an element, reporting whether focus actually landed on it. */
export function focusLands(element: HTMLElement | null | undefined): boolean {
  if (!element) {
    return false;
  }
  element.focus();
  return document.activeElement === element;
}

/** The form root's navigation registry, provided via FormNavigationContext. */
export function useFormNavigationRegistry(): FormNavigation {
  const zonesRef = useRef(new Map<string, NavigationZoneHandle>());

  const register = (id: string, handle: NavigationZoneHandle) => {
    zonesRef.current.set(id, handle);
  };
  const unregister = (id: string) => {
    zonesRef.current.delete(id);
  };
  const exit = (id: string, direction: NavigationDirection): boolean => {
    const from = zonesRef.current.get(id);
    if (!from) {
      return false;
    }
    const ordered = [...zonesRef.current.values()].sort((a, b) =>
      // eslint-disable-next-line no-bitwise -- compareDocumentPosition returns a bitmask
      a.element.compareDocumentPosition(b.element) &
      Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : 1,
    );
    const start = ordered.indexOf(from);
    const step = direction === "next" ? 1 : -1;
    const edge: NavigationEdge = direction === "next" ? "first" : "last";
    for (
      let index = start + step;
      index >= 0 && index < ordered.length;
      index += step
    ) {
      if (ordered[index]!.enter(edge)) {
        return true;
      }
    }
    return false;
  };

  return { register, unregister, exit };
}

/**
 * Keeps one zone registered while its root element is mounted. The element
 * lives in state (set from the ref callback), so registration is a plain
 * effect over (element, enter) and re-runs whenever either changes.
 */
function useZoneRegistration(enter: (edge: NavigationEdge) => boolean): {
  id: string;
  attach: (element: HTMLElement | null) => void;
} {
  const navigation = use(FormNavigationContext);
  const id = useId();
  const [element, setElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!element) {
      return undefined;
    }
    navigation.register(id, { element, enter });
    return () => navigation.unregister(id);
  }, [navigation, id, element, enter]);

  return { id, attach: setElement };
}

export interface NavigationZone {
  /** Attach to the zone's root element; registers while mounted. */
  attach: (element: HTMLElement | null) => void;
  /** Carry focus out of this zone. Returns whether focus moved. */
  exit: (direction: NavigationDirection) => boolean;
}

/** Registers a navigation zone entered through `enter`. */
export function useNavigationZone(
  enter: (edge: NavigationEdge) => boolean,
): NavigationZone {
  const navigation = use(FormNavigationContext);
  const { id, attach } = useZoneRegistration(enter);
  return {
    attach,
    exit: (direction) => navigation.exit(id, direction),
  };
}

export interface NavigationHeader {
  /** Attach to the header's focusable trigger. */
  attach: (element: HTMLButtonElement | null) => void;
  /**
   * Arrow handling for the trigger: Up/Down leave to the neighbouring zone,
   * Left/Right collapse/expand when handlers are given.
   */
  onHeaderKeyDown: React.KeyboardEventHandler;
}

/**
 * A single-element zone for a section or place header: focusable in the
 * form's vertical walk, with Left/Right driving its collapse state.
 */
export function useNavigationHeader(options: {
  collapse?: () => void;
  expand?: () => void;
}): NavigationHeader {
  const [element, setElement] = useState<HTMLButtonElement | null>(null);
  const zone = useNavigationZone(() => focusLands(element));

  const onHeaderKeyDown: React.KeyboardEventHandler = (event) => {
    const handled = (action: () => unknown) => {
      event.preventDefault();
      event.stopPropagation();
      action();
    };
    if (event.key === "ArrowUp") {
      handled(() => zone.exit("previous"));
    } else if (event.key === "ArrowDown") {
      handled(() => zone.exit("next"));
    } else if (event.key === "ArrowLeft" && options.collapse) {
      handled(options.collapse);
    } else if (event.key === "ArrowRight" && options.expand) {
      handled(options.expand);
    }
  };

  const attach = (target: HTMLButtonElement | null) => {
    setElement(target);
    zone.attach(target);
  };

  return { attach, onHeaderKeyDown };
}
