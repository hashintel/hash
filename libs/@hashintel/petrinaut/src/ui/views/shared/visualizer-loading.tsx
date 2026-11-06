import { LoadingSpinner } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

export const VisualizerLoading = () => (
  <div
    role="status"
    aria-label="Loading visualizer"
    className={css({
      position: "absolute",
      right: "[10px]",
      bottom: "[10px]",
      zIndex: "[1]",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "[6px]",
      borderRadius: "[8px]",
      backgroundColor: "[rgba(255, 255, 255, 0.72)]",
      backdropFilter: "[blur(8px) saturate(140%)]",
      pointerEvents: "none",
    })}
  >
    <LoadingSpinner size="sm" />
  </div>
);
