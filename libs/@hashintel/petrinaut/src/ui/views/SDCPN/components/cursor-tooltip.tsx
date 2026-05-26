import { use, useEffect, useRef, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { EditorContext } from "../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../react/state/sdcpn-context";

const tooltipStyle = css({
  position: "fixed",
  pointerEvents: "none",
  zIndex: 9999,
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
  const { editionMode, componentSubnetId } = use(EditorContext);
  const {
    petriNetDefinition: { subnets },
  } = use(SDCPNContext);

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
  } else if (editionMode === "add-component" && componentSubnetId) {
    const subnet = (subnets ?? []).find(({ id }) => id === componentSubnetId);
    label = subnet ? `Instantiate ${subnet.name}` : null;
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
