import { useState } from "react";

import { Button, Form } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ValueName } from "../shared/value-name";
import { UsedInButton, UsedInRows } from "./shared/used-in";

import type { ValueUse } from "../shared/value-uses";
import type { PayloadKind } from "@local/hash-isomorphic-utils/flows/types";

/* In "Used in"'s size and place. */
const notUsed = css({ px: "1.5", textStyle: "xs", color: "fg.subtle" });

/*
 * An output that isn't a flow output shows its star only while its row is hovered or focused, keeping its place so
 * "Used in" doesn't move. The row's root is `display: contents` in a `Form.Section`, which `:hover` and
 * `:focus-within` don't mind, as they match by the tree, not by boxes.
 */
const outputRow = css({
  "& [data-flow-output='false']": { opacity: "0" },
  "&:hover [data-flow-output]": { opacity: "1" },
  "&:focus-within [data-flow-output]": { opacity: "1" },
});
const flowOutputToggle = css({ display: "flex" });
/* The open rows' tiles line up under the output's name, past its type icon. */
const openRows = css({ display: "block", paddingLeft: "3" });

/**
 * A value a step gives: its name and type, then the steps that use it as "Used in", which opens a row per step.
 *
 * Given `flowOutput`, a star before "Used in" marks or unmarks the value as one of the flow's outputs, which show in
 * its runs' results.
 */
export const UsedByField = ({
  name,
  shape,
  valueUses,
  flowOutput,
  onSelectStep,
}: {
  name: string;
  shape: { payloadKind: PayloadKind; array: boolean } | null;
  valueUses: ValueUse[];
  flowOutput?: { marked: boolean; onToggle: () => void };
  onSelectStep: (stepId: string) => void;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <Form.Field
      className={outputRow}
      layout="inline"
      inputAlign="end"
      as="legend"
      label={<ValueName name={name} shape={shape} />}
      descriptionBottom={
        open &&
        valueUses.length > 0 && (
          <span className={openRows}>
            <UsedInRows valueUses={valueUses} onSelectStep={onSelectStep} />
          </span>
        )
      }
    >
      {flowOutput && (
        <span data-flow-output={flowOutput.marked} className={flowOutputToggle}>
          <Button
            variant="ghost"
            size="xs"
            iconName={flowOutput.marked ? "starFilled" : "star"}
            tooltip="Show in run results"
            aria-pressed={flowOutput.marked}
            onClick={flowOutput.onToggle}
          />
        </span>
      )}
      {valueUses.length === 0 ? (
        <span className={notUsed}>Not used yet</span>
      ) : (
        <UsedInButton
          valueUses={valueUses}
          open={open}
          onToggle={() => setOpen(!open)}
        />
      )}
    </Form.Field>
  );
};
