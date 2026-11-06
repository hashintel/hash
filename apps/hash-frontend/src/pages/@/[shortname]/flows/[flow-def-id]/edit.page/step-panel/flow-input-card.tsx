import { upperFirst } from "lodash";
import { useRef, useState } from "react";

import {
  Chip,
  EllipsisMenu,
  Form,
  Select,
  TextInput,
  Toggle,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { CollapseButton } from "../shared/collapse-button";
import { getNameLabel } from "../shared/name-label";
import { flowInputTypes } from "./input-sources";
import { StepChips } from "./shared/step-chips";
import { getKindLabel } from "./shared/value-display";

import type { FlowEditor } from "@local/hash-isomorphic-utils/flows/flow-editor";
import type {
  FlowInputDefinition,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";

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
const labelInput = css({ fontWeight: "medium", minWidth: "0" });
const spacer = css({ flex: "1" });
const collapsedType = css({ textStyle: "xs", color: "fg.subtle" });
const notUsed = css({ textStyle: "sm", color: "fg.subtle" });

type FlowInputType = Pick<FlowInputDefinition, "payloadKind" | "array">;

const getTypeKey = ({ payloadKind, array }: FlowInputType) =>
  `${payloadKind}${array ? "[]" : ""}`;

const getTypeLabel = (type: FlowInputType) => upperFirst(getKindLabel(type));

/**
 * The input's label, edited in place. Escape, or leaving it blank or unchanged, keeps the label it has. Only the label
 * changes: steps refer to the input by its name.
 */
const LabelInput = ({
  label,
  autoFocus,
  onRename,
}: {
  label: string;
  autoFocus: boolean;
  onRename: (label: string) => void;
}) => {
  const [typed, setTyped] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  return (
    <TextInput
      variant="subtle"
      size="sm"
      width="fitContent"
      showEditIcon
      autoFocus={autoFocus}
      aria-label="Input name"
      className={labelInput}
      value={typed ?? label}
      onFocus={(event) => {
        setTyped(label);
        event.target.select();
      }}
      onChange={setTyped}
      onKeyDown={(event) => {
        if (
          (event.key !== "Enter" && event.key !== "Escape") ||
          event.nativeEvent.isComposing
        ) {
          return;
        }

        cancelledRef.current = event.key === "Escape";

        if (event.currentTarget instanceof HTMLElement) {
          event.currentTarget.blur();
        }
      }}
      onBlur={() => {
        const renamed = typed?.trim();

        if (!cancelledRef.current && renamed && renamed !== label) {
          onRename(renamed);
        }

        cancelledRef.current = false;
        setTyped(null);
      }}
    />
  );
};

/**
 * A flow input on Start, as a card: its label, type and whether it's required, which can all be changed, and the steps
 * that use it. Collapsed, it shows its type beside its label.
 */
export const FlowInputCard = ({
  editor,
  input,
  usedBy,
  autoFocus,
}: {
  editor: FlowEditor;
  input: FlowInputDefinition;
  usedBy: StepDefinition<string>[];
  /** Whether its label is ready to type in, as for an input just added. */
  autoFocus: boolean;
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const { name, payloadKind, array, required } = input;
  const label = input.label ?? getNameLabel(name);
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
        <LabelInput
          label={label}
          autoFocus={autoFocus}
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
          <Form.Field layout="inline" as="legend" label="Used by">
            {usedBy.length === 0 ? (
              <span className={notUsed}>Not used yet</span>
            ) : (
              <StepChips steps={usedBy} />
            )}
          </Form.Field>
        </Form.Section>
      )}
    </section>
  );
};
