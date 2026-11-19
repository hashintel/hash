import { resizeExampleRecipe } from "./resize-example.recipe";

/**
 * Drag-resizable frame for demos whose point is how content adapts to the
 * container's size (Breadcrumbs collapsing, OverflowRow overflowing). The
 * native handle in the bottom-right corner does the resizing. In docs Stages,
 * tag it `data-harness` so the shown code keeps only the content.
 */
export const ResizeExample = ({
  resize,
  width,
  minWidth,
  children,
}: {
  /** Which directions the drag handle allows. */
  resize?: "horizontal" | "vertical" | "both";
  /** The frame's starting width in pixels. */
  width?: number;
  /** How narrow the frame can be dragged, in pixels. */
  minWidth?: number;
  children: React.ReactNode;
}) => (
  <div className={resizeExampleRecipe({ resize })} style={{ width, minWidth }}>
    {children}
  </div>
);
