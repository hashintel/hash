import { use } from "react";

import { Toggle } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { PetrinautOptimizationContext } from "../../../../../../react/optimization-context";

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
});

const labelStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
});

export const ExperimentOptimizationToggle = ({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) => {
  const optimization = use(PetrinautOptimizationContext);

  if (!optimization) {
    return null;
  }

  return (
    <div className={rowStyle}>
      <span className={labelStyle}>Optimization</span>
      <Toggle
        aria-label="Optimization"
        value={enabled}
        onChange={onChange}
        size="sm"
      />
    </div>
  );
};
