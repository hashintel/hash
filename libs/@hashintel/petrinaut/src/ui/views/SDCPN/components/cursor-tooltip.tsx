import { use, useEffect, useRef, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";
import { resolveComponent } from "@hashintel/petrinaut-core";

import { CompositionContext } from "../../../../react/document/composition-context";
import { usePetrinautDefinitionSelector } from "../../../../react/document/use-document";
import { useEditorFields } from "../../../../react/state/editor-context";

const tooltipStyle = css({
  position: "fixed",
  pointerEvents: "none",
  zIndex: "[9999]",
  paddingX: "2",
  paddingY: "1",
  borderRadius: "md",
  backgroundColor: "neutral.s120",
  color: "neutral.s00",
  fontSize: "xs",
  fontWeight: "medium",
  whiteSpace: "nowrap",
  opacity: "[0.9]",
});

const OFFSET_X = 14;
const OFFSET_Y = 18;

export const CursorTooltip: React.FC = () => {
  const { editionMode, componentToAdd } = useEditorFields(
    "editionMode",
    "componentToAdd",
  );
  const { libraries } = use(CompositionContext);
  // The name alone, so an edit of the net does not render the tooltip.
  const componentName = usePetrinautDefinitionSelector((definition) =>
    editionMode === "add-component" && componentToAdd
      ? resolveComponent(definition, componentToAdd, libraries)?.name
      : undefined,
  );

  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const rafRef = useRef(0);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setPosition({ x: event.clientX, y: event.clientY });
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  let label: string | null = null;

  if (editionMode === "add-place") {
    label = "Add Place";
  } else if (editionMode === "add-transition") {
    label = "Add Transition";
  } else if (componentName !== undefined) {
    label = `Instantiate ${componentName}`;
  }

  if (!label || !position) {
    return null;
  }

  return (
    <div
      className={tooltipStyle}
      style={{
        left: position.x + OFFSET_X,
        top: position.y + OFFSET_Y,
      }}
    >
      {label}
    </div>
  );
};
