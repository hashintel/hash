import { use } from "react";

import { LoadingSpinner } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { isResolvingImports } from "@hashintel/petrinaut-core";

import { CompositionContext } from "../../react/state/composition-context";
import { useSDCPNState } from "../../react/state/sdcpn-context";

const overlayStyle = css({
  position: "absolute",
  inset: "0",
  zIndex: "overlay",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "2",
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s100",
  backgroundColor: "[rgba(255, 255, 255, 0.72)]",
  backdropFilter: "[blur(8px) saturate(140%)]",
});

/**
 * Covers the whole editor while an import of the document resolves: until
 * its library is there, the instances of its components cannot be drawn,
 * checked or run.
 */
export const ResolvingOverlay: React.FC = () => {
  const { imports } = use(CompositionContext);
  const resolving = useSDCPNState((document) =>
    isResolvingImports(document.petriNetDefinition, imports),
  );

  if (!resolving) {
    return null;
  }
  return (
    <div role="status" className={overlayStyle}>
      <LoadingSpinner size="md" />
      Resolving
    </div>
  );
};
