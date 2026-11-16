import { upperFirst } from "lodash";
import { useState } from "react";

import {
  Chip,
  EllipsisMenu,
  Form,
  Select,
  Toggle,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { CollapseButton } from "../shared/collapse-button";
import { RenameInput } from "../shared/rename-input";
import { getFlowInputLabel, getKindLabel } from "../shared/value-display";
import { flowInputTypes } from "./input-sources";
import { UsedInButton, UsedInRows } from "./shared/used-in";

import type { ValueUse } from "../shared/value-uses";
import type { FlowEditor } from "@local/hash-isomorphic-utils/flows/flow-editor";
import type { FlowInputDefinition } from "@local/hash-isomorphic-utils/flows/types";

const card = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  p: "3",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "lg",
});
const titleRow = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  minWidth: "0",
});
const spacer = css({ flex: "1" });
const collapsedType = css({ textStyle: "xs", color: "fg.subtle" });
/*
 * "Used in" sits under the fields' values, with no label of its own, pulled out by its padding so its words and its
 * rows' tiles line up with the values. The selector outranks the section's rule placing each child across every column.
 */
const usedIn = css({
  '[data-part="form-section"] > &': { gridColumn: "[2 / -1]" },
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "1",
  marginTop: "3",
  marginLeft: "-1.5",
});

type FlowInputType = Pick<FlowInputDefinition, "payloadKind" | "array">;

const getTypeKey = ({ payloadKind, array }: FlowInputType) =>
  `${payloadKind}${array ? "[]" : ""}`;

const getTypeLabel = (type: FlowInputType) => upperFirst(getKindLabel(type));

/**
 * A flow input on Start, as a card: its label, type and whether it's required, which can all be changed, and the steps
 * that use it. Collapsed, it shows its type beside its label. Renaming changes only the label: steps refer to the input
 * by its name.
 */
export const FlowInputCard = ({
  editor,
  input,
  valueUses,
  autoFocus,
  onSelectStep,
}: {
  editor: FlowEditor;
  input: FlowInputDefinition;
  valueUses: ValueUse[];
  /** Whether its label is ready to type in, as for an input just added. */
  autoFocus: boolean;
  onSelectStep: (stepId: string) => void;
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [usesOpen, setUsesOpen] = useState(false);

  const { name, payloadKind, array, required } = input;
  const label = getFlowInputLabel(input);
  const type = { payloadKind, array };
  /* An input of a type that can't be typed in, e.g. one added from a step's input, keeps it until it's changed. */
  const types = flowInputTypes.some(
    (option) => getTypeKey(option) === getTypeKey(type),
  )
    ? flowInputTypes
    : [...flowInputTypes, type];

  return (
    <section className={card} aria-label={label}>
      <div className={titleRow}>
        <CollapseButton
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
        />
        <RenameInput
          value={label}
          autoFocus={autoFocus}
          ariaLabel="Input name"
          onRename={(renamed) =>
            editor.updateFlowInput(name, { label: renamed })
          }
        />
        {required && <Chip size="xs">Required</Chip>}
        <span className={spacer} />
        {collapsed && (
          <span className={collapsedType}>{getTypeLabel(type)}</span>
        )}
        <EllipsisMenu
          variant="ghost"
          size="xxs"
          items={[
            {
              id: "remove",
              text: "Remove input",
              icon: "trash",
              tone: "error",
              onClick: () => editor.removeFlowInput(name),
            },
          ]}
        />
      </div>
      {!collapsed && (
        <Form.Section>
          <Form.Field layout="inline" label="Type">
            <Select
              size="sm"
              required
              items={types.map((option) => ({
                value: getTypeKey(option),
                text: getTypeLabel(option),
              }))}
              value={getTypeKey(type)}
              onChange={(key) => {
                const picked = types.find(
                  (option) => getTypeKey(option) === key,
                );

                if (picked) {
                  editor.updateFlowInput(name, picked);
                }
              }}
            />
          </Form.Field>
          <Form.Field layout="inline" label="Required">
            <Toggle
              size="sm"
              value={required}
              onChange={(checked) =>
                editor.updateFlowInput(name, { required: checked })
              }
            />
          </Form.Field>
          {valueUses.length > 0 && (
            <div className={usedIn}>
              <UsedInButton
                valueUses={valueUses}
                open={usesOpen}
                onToggle={() => setUsesOpen(!usesOpen)}
              />
              {usesOpen && (
                <UsedInRows valueUses={valueUses} onSelectStep={onSelectStep} />
              )}
            </div>
          )}
        </Form.Section>
      )}
    </section>
  );
};
