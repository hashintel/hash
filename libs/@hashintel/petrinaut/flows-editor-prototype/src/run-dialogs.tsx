import { useState } from "react";

import {
  Banner,
  Button,
  Dialog,
  NumberInput,
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
          multiple
          searchable
          items={items}
          value={Array.isArray(value) ? value : []}
          onChange={(next) => onChange(next)}
          placeholder={`Choose ${findEntityType(typeBaseUrl)?.pluralTitle.toLowerCase() ?? "entities"}`}
        />
      ) : (
        <Select
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
        <NumberInput
          value={typeof value === "number" ? value : null}
          onChange={(next) => onChange(next ?? null)}
          width="fullWidth"
        />
      );
    case "Boolean":
      return (
        <Select
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

/** The manual run form, generated from the Start inputs. */
export const RunDialog = () => {
  const { document, setUi } = useEditor();
  const [values, setValues] = useState<Record<string, Value>>({});
  const [started, setStarted] = useState(false);
  const close = () => setUi((ui) => ({ ...ui, runOpen: false }));
  const missing = document.inputs.filter(
    (input) => input.required && !isFilled(values[input.name]),
  );

  return (
    <Dialog size="sm" onClose={close} aria-label={`Run ${document.name}`}>
      <Dialog.Header title={`Run ${document.name}`} />
      <Dialog.Body>
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "4",
          })}
        >
          {document.inputs.length === 0 ? (
            <span
              className={css({ textStyle: "sm", color: "neutral.fg.muted" })}
            >
              This flow takes no inputs.
            </span>
          ) : null}
          {document.inputs.map((input) => (
            <label
              key={input.name}
              className={css({
                display: "flex",
                flexDirection: "column",
                gap: "1",
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
                  setValues((current) => ({ ...current, [input.name]: value }))
                }
              />
            </label>
          ))}
          {started ? (
            <Banner tone="neutral" variant="soft" icon>
              <Banner.Title>No backend in this preview</Banner.Title>
              <Banner.Description>
                A run would start now with these inputs. The run view isn’t
                linked from this prototype yet.
              </Banner.Description>
            </Banner>
          ) : null}
        </div>
      </Dialog.Body>
      <Dialog.Footer
        actions={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="solid"
              iconName="play"
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
          </>
        }
      />
    </Dialog>
  );
};
