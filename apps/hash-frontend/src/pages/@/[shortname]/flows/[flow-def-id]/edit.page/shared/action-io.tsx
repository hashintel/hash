import { Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
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

/** What an action takes and gives, from its definition. */
export const ActionIo = ({
  actionDefinitionId,
  className,
}: {
  actionDefinitionId: FlowActionDefinitionId;
  className?: string;
}) => {
  const { inputs, outputs } = actionDefinitions[actionDefinitionId];

  return (
    <dl className={cx(ioList, className)}>
      <dt className={ioTerm}>Inputs</dt>
      <dd>{inputs.map(({ name }) => getNameLabel(name)).join(", ")}</dd>
      <dt className={ioTerm}>Outputs</dt>
      <dd>{outputs.map(({ name }) => getNameLabel(name)).join(", ")}</dd>
    </dl>
  );
};

/** Shows what an action takes and gives while `children` is hovered or focused. */
export const ActionIoTooltip = ({
  actionDefinitionId,
  className,
  children,
}: {
  actionDefinitionId: FlowActionDefinitionId;
  /** Applied to the element wrapping `children`. */
  className?: string;
  children: ReactNode;
}) => (
  <Tooltip
    position="right"
    className={className}
    content={<ActionIo actionDefinitionId={actionDefinitionId} />}
  >
    {children}
  </Tooltip>
);
