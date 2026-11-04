import { Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";

import { getNameLabel } from "./name-label";

import type { FlowActionDefinitionId } from "@local/hash-isomorphic-utils/flows/types";
import type { ReactNode } from "react";

const ioList = css({
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  columnGap: "2",
  rowGap: "0.5",
});
const ioTerm = css({ fontWeight: "medium" });

/** Shows what an action takes and gives, from its definition, while `children` is hovered. */
export const ActionIoTooltip = ({
  actionDefinitionId,
  className,
  children,
}: {
  actionDefinitionId: FlowActionDefinitionId;
  /** Applied to the element wrapping `children`. */
  className?: string;
  children: ReactNode;
}) => {
  const { inputs, outputs } = actionDefinitions[actionDefinitionId];

  return (
    <Tooltip
      position="right"
      className={className}
      content={
        <dl className={ioList}>
          <dt className={ioTerm}>Inputs</dt>
          <dd>{inputs.map(({ name }) => getNameLabel(name)).join(", ")}</dd>
          <dt className={ioTerm}>Outputs</dt>
          <dd>{outputs.map(({ name }) => getNameLabel(name)).join(", ")}</dd>
        </dl>
      }
    >
      {children}
    </Tooltip>
  );
};
