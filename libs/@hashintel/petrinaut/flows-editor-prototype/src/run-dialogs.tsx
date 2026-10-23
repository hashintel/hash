import { useLayoutEffect, useState } from "react";

import {
  Banner,
  Button,
  Icon,
  NumberInput,
  Popover,
  Select,
  TextInput,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useEditor } from "./editor-context";
import { findEntityType, mockEntities } from "./mock-graph";
import { TypedValue } from "./typed-value";
import { mutedTextStyle } from "./ui";

import type { FlowInputDefinition } from "./engine";

type Value = unknown;

const labelStyle = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
});

const pickedStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  minWidth: "[0]",
  "& > svg": { flexShrink: 0, color: "neutral.fg.muted" },
  "& > span": { overflow: "hidden", textOverflow: "ellipsis" },
});

/**
 * One form control per flow input, chosen by its kind, as the legacy run modal does with `flow-input-field.tsx`:
 * pickers for entities, number fields for numbers.
 */
const InputControl = ({
  input,
  value,
  onChange,
}: {
  input: FlowInputDefinition;
  value: Value;
  onChange: (value: Value) => void;
}) => {
  const { document } = useEditor();
  switch (input.payloadKind) {
    case "EntityId": {
      const typeBaseUrl = document.inputEntityTypes[input.name];
      const items = mockEntities
        .filter(
          (entity) => !typeBaseUrl || entity.entityTypeBaseUrl === typeBaseUrl,
        )
        .map((entity) => ({ value: entity.entityId, text: entity.label }));
      return input.array ? (
        <Select
          size="sm"
          multiple
          searchable
          items={items}
          value={Array.isArray(value) ? value : []}
          onChange={(next) => onChange(next)}
          // One line: the entity icon, then the picks side by side (Figma J4 · B1).
          renderSelectedAll={(values: string[]) =>
            values.length === 0 ? null : (
              <span className={pickedStyle}>
                <Icon name="cube" size="xs" />
                <span>
                  {values
                    .map(
                      (id) =>
                        items.find((item) => item.value === id)?.text ?? id,
                    )
                    .join(", ")}
                </span>
              </span>
            )
          }
          placeholder={`Choose ${findEntityType(typeBaseUrl)?.pluralTitle.toLowerCase() ?? "entities"}`}
        />
      ) : (
        <Select
          size="sm"
          searchable
          items={items}
          value={typeof value === "string" ? value : null}
          onChange={(next) => onChange(next)}
          placeholder={`Choose ${findEntityType(typeBaseUrl)?.title.toLowerCase() ?? "an entity"}`}
        />
      );
    }
    case "Number":
      return (
        <div className={css({ width: "[70px]" })}>
          <NumberInput
            size="sm"
            value={typeof value === "number" ? value : null}
            aria-label={input.label ?? input.name}
            onChange={(next) => onChange(next ?? null)}
            width="fullWidth"
          />
        </div>
      );
    case "Boolean":
      return (
        <Select
          size="sm"
          items={[
            { value: "true", text: "Yes" },
            { value: "false", text: "No" },
          ]}
          value={value === "true" || value === "false" ? value : null}
          onChange={(next) => onChange(next)}
          placeholder="Choose"
        />
      );
    case "Date":
    case "DateTime":
    case "Duration":
    case "VersionedUrl":
      // Field kinds v2: picked or typed by type, never free text.
      return (
        <TypedValue
          kind={input.payloadKind}
          label={input.label ?? input.name}
          value={value ?? undefined}
          onChange={(next) => onChange(next ?? null)}
        />
      );
    default:
      return (
        <TextInput
          size="sm"
          value={typeof value === "string" ? value : ""}
          onChange={(next) => onChange(next)}
          placeholder={input.array ? "Separate values with commas" : undefined}
        />
      );
  }
};

const isFilled = (value: Value | undefined) =>
  Array.isArray(value)
    ? value.length > 0
    : value !== null && value !== undefined && value !== "";

/** The Run form is one DS popover surface, 326 px wide (Figma J4 · B1: x 1098 to 1424). */
const formStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "4",
  width: "[326px]",
  padding: "4",
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle.hover",
  borderRadius: "[10px]",
  boxShadow:
    "[0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)]",
});

/**
 * The manual run form, generated from the Start inputs: a DS popover under the Run button with its right edge on the
 * top bar's, as Figma J4 · B1 draws it (title, one field per input, Cancel and Run). Inputs start at their defaults.
 */
export const RunForm = ({
  anchor,
}: {
  anchor: React.RefObject<HTMLElement | null>;
}) => {
  const { document, setUi } = useEditor();
  const [values, setValues] = useState<Record<string, Value>>(() => ({
    ...document.inputDefaults,
  }));
  const [started, setStarted] = useState(false);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const button = anchor.current;
    const bar = button?.closest("header");
    if (button && bar) {
      const rect = button.getBoundingClientRect();
      // The top bar's content edge: its last group ends where the ⋮ button does.
      const right = (bar.lastElementChild ?? bar).getBoundingClientRect().right;
      setPoint({
        x: right - rect.left,
        y: rect.height,
      });
    }
  }, [anchor]);
  const close = () => setUi((ui) => ({ ...ui, runOpen: false }));
  const missing = document.inputs.filter(
    (input) => input.required && !isFilled(values[input.name]),
  );

  if (!point) {
    return null;
  }
  return (
    <Popover
      triggerRef={anchor}
      position="bottom-end"
      positionFromPoint={point}
      gapX={4}
      gapY={8}
      onClose={close}
    >
      <div
        role="dialog"
        aria-label={`Run ${document.name}`}
        className={formStyle}
      >
        <span
          className={css({
            textStyle: "sm",
            fontWeight: "semibold",
            color: "neutral.fg.heading",
          })}
        >
          Run {document.name}
        </span>
        {document.inputs.length === 0 ? (
          <span className={css({ textStyle: "sm", color: "neutral.fg.muted" })}>
            This flow takes no inputs.
          </span>
        ) : null}
        {document.inputs.map((input) => (
          <label
            key={input.name}
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "2",
            })}
          >
            <span className={labelStyle}>
              {input.label ?? input.name}
              {input.required ? null : (
                <span className={mutedTextStyle}> · optional</span>
              )}
            </span>
            <InputControl
              input={input}
              value={values[input.name] ?? null}
              onChange={(value) =>
                setValues((current) => ({
                  ...current,
                  [input.name]: value,
                }))
              }
            />
          </label>
        ))}
        {started ? (
          <Banner tone="neutral" variant="soft" icon>
            <Banner.Title>No backend in this preview</Banner.Title>
            <Banner.Description>
              A run would start now with these inputs. The run view isn’t linked
              from this prototype yet.
            </Banner.Description>
          </Banner>
        ) : null}
        <div
          className={css({
            display: "flex",
            justifyContent: "flex-end",
            gap: "2",
          })}
        >
          <Button variant="subtle" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="solid"
            size="sm"
            disabled={missing.length > 0}
            tooltip={
              missing.length > 0
                ? `Fill in ${missing.map((input) => input.label ?? input.name).join(", ")}`
                : undefined
            }
            onClick={() => setStarted(true)}
          >
            Run
          </Button>
        </div>
      </div>
    </Popover>
  );
};
