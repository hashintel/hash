/**
 * The map's frame: a panel under the header that slides down and pushes
 * the page below it. Mounted on first open and kept, so the map's chunk
 * loads once and its state survives closing; inert while closed so
 * nothing behind it loses focus to it.
 */

import { Suspense, lazy, useState } from "react";

const Navigator = lazy(() =>
  import("../navigator").then((module) => ({ default: module.Navigator })),
);

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
      </div>
    </div>
  );
};
