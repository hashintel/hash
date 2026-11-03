import { LoadingSpinner } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

export const VisualizerLoading = () => (
  <div
    role="status"
    aria-label="Loading visualizer"
    className={css({
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "full",
    })}
  >
    <LoadingSpinner size="sm" />
  </div>
);
