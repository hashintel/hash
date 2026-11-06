/**
 * The map's frame: a panel under the header that slides down and pushes
 * the page below it, with a handle on its lower edge to set how much of
 * the window it takes, remembered across visits. Mounted on first open
 * and kept, so the map's chunk loads once and its state survives closing;
 * inert while closed so nothing behind it loses focus to it.
 */

import {
  Suspense,
  lazy,
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

const Navigator = lazy(() =>
  import("../navigator").then((module) => ({ default: module.Navigator })),
);

const heightKey = "pnd:map-height";
const minimumHeight = 200;

const applyHeight = (height: number): void => {
  document.documentElement.style.setProperty(
    "--pnd-map-open-height",
    `${Math.round(height)}px`,
  );
};

/** The height the reader last chose, applied before the panel first opens. */
const useStoredHeight = (): void => {
  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(heightKey));
      if (stored >= minimumHeight) {
        applyHeight(stored);
      }
    } catch {
      // Storage may be unavailable; the default height stands.
    }
  }, []);
};

const ResizeHandle = () => {
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) {
      return;
    }
    const handle = event.currentTarget;
    const root = document.documentElement;
    const navHeight =
      parseFloat(getComputedStyle(root).getPropertyValue("--sl-nav-height")) ||
      0;
    const navPixels = navHeight * parseFloat(getComputedStyle(root).fontSize);
    handle.setPointerCapture(event.pointerId);
    root.toggleAttribute("data-map-resizing", true);
    let height = 0;
    const onMove = (move: PointerEvent): void => {
      height = Math.min(
        window.innerHeight - navPixels - 120,
        Math.max(minimumHeight, move.clientY - navPixels),
      );
      applyHeight(height);
    };
    const onUp = (): void => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      root.removeAttribute("data-map-resizing");
      try {
        if (height > 0) {
          localStorage.setItem(heightKey, String(Math.round(height)));
        }
      } catch {
        // Storage may be unavailable; the height holds for this visit.
      }
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  };
  return (
    <div
      className="pnd-map-resize"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize the map"
      onPointerDown={onPointerDown}
    />
  );
};

export const MapPanel = ({
  open,
  currentSlug,
  onOpen,
  onClose,
}: {
  open: boolean;
  currentSlug: string;
  onOpen: (slug: string) => void;
  onClose: () => void;
}) => {
  useStoredHeight();
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) {
    setMounted(true);
  }
  if (!mounted) {
    return null;
  }
  return (
    <div
      className="pnd-map"
      data-open={open ? "" : undefined}
      inert={!open}
      role="region"
      aria-label="Architecture map"
    >
      <div className="pnd-map-body">
        <Suspense
          fallback={<div className="pnd-map-loading">Loading the map…</div>}
        >
          <Navigator
            open={open}
            currentSlug={currentSlug}
            onOpen={onOpen}
            onClose={onClose}
          />
        </Suspense>
        <ResizeHandle />
      </div>
    </div>
  );
};
