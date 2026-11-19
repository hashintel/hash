import { upperFirst } from "lodash";
import { useRef, useState } from "react";

import {
  Banner,
  Button,
  Form,
  NumberInput,
  Popover,
  TextInput,
  Toggle,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { getFlowInputLabel, getKindLabel } from "../shared/value-display";
import { EntityInput } from "./run-flow/entity-input";
import {
  getFlowInputValues,
  getFormValuesFromRun,
  getInitialFormValues,
  getRunBlocker,
} from "./run-flow/run-form";

import type { RunFormValue, RunFormValues } from "./run-flow/run-form";
import type { WebId } from "@blockprotocol/type-system";
import type { FlowEditorState } from "@local/hash-isomorphic-utils/flows/flow-editor";
import type {
  FlowInputDefinition,
  FlowInputValues,
} from "@local/hash-isomorphic-utils/flows/types";
import type { RefObject } from "react";

const runForm = css({
  width: "[326px]",
  maxHeight: "[var(--available-height)]",
});
const formText = css({ textStyle: "sm", color: "fg.body" });
const formBody = css({ display: "flex", flexDirection: "column", gap: "4" });
const optionalMark = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.subtle",
});

const InputControl = ({
  webId,
  value,
  required,
  onChange,
}: {
  webId: WebId;
  value: RunFormValue;
  required: boolean;
  onChange: (value: RunFormValue) => void;
}) => {
  switch (value.kind) {
    case "Text":
      return (
        <TextInput
          value={value.value}
          required={required}
          onChange={(text) => onChange({ kind: "Text", value: text })}
        />
      );
    case "Number":
      return (
        <NumberInput
          value={value.value}
          min={-Number.MAX_VALUE}
          max={Number.MAX_VALUE}
          step="any"
          required={required}
          onChange={(number) => onChange({ kind: "Number", value: number })}
        />
      );
    case "Boolean":
      return (
        <Toggle
          value={value.value}
          onChange={(checked) => onChange({ kind: "Boolean", value: checked })}
        />
      );
    case "Date":
      return (
        <TextInput
          type="date"
          value={value.value}
          required={required}
          onChange={(date) => onChange({ kind: "Date", value: date })}
        />
      );
    case "EntityId":
      return (
        <EntityInput
          webId={webId}
          value={value}
          required={required}
          onChange={onChange}
        />
      );
  }
};

const InputField = ({
  webId,
  input,
  value,
  onChange,
}: {
  webId: WebId;
  input: FlowInputDefinition;
  /** Absent for an input the form can't take. */
  value: RunFormValue | undefined;
  onChange: (value: RunFormValue) => void;
}) => (
  <Form.Field
    /* Not a label for an input the form can't take, as there's no input to label. */
    as={value ? "label" : "legend"}
    label={
      /* One span, as the label is a flex row, which would drop the space before "·". */
      <span>
        {getFlowInputLabel(input)}
        {!input.required && <span className={optionalMark}> · optional</span>}
      </span>
    }
    description={upperFirst(getKindLabel(input))}
  >
    {value ? (
      <InputControl
        webId={webId}
        value={value}
        required={input.required}
        onChange={onChange}
      />
    ) : (
      <span className={formText}>
        Can't be given here yet, so the run goes without it
      </span>
    )}
  </Form.Field>
);

const RunFlowForm = ({
  triggerRef,
  webId,
  name,
  inputs,
  ranInputs,
  saveRefusedReason,
  onRun,
  onClose,
}: {
  triggerRef: RefObject<HTMLButtonElement | null>;
  webId: WebId;
  name: string;
  inputs: FlowInputDefinition[];
  ranInputs: FlowInputValues | null;
  saveRefusedReason: string | null;
  onRun: (flowInputs: FlowInputValues) => Promise<void>;
  onClose: () => void;
}) => {
  const [{ values: initialValues, changedInputLabels }] = useState(() =>
    ranInputs
      ? getFormValuesFromRun(inputs, ranInputs)
      : { values: getInitialFormValues(inputs), changedInputLabels: [] },
  );
  const [values, setValues] = useState(initialValues);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const { flowInputs, missingInputNames } = getFlowInputValues(inputs, values);
  /* Why the form can't run yet, or `null` if it can: the required inputs left blank. */
  const blocker =
    missingInputNames.length > 0
      ? `Fill in ${inputs
          .filter((input) => missingInputNames.includes(input.name))
          .map((input) => getFlowInputLabel(input))
          .join(", ")}`
      : null;

  const run = async () => {
    setRunning(true);
    setRunError(null);

    try {
      /* The form stays open until the run has opened. */
      await onRun(flowInputs);
      onClose();
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error));
      setRunning(false);
    }
  };

  const setValue = (inputName: string, value: RunFormValue) =>
    setValues((current): RunFormValues => ({ ...current, [inputName]: value }));

  return (
    <Popover
      triggerRef={triggerRef}
      position="bottom-end"
      onClose={running ? undefined : onClose}
    >
      <Popover.Container className={runForm}>
        <Popover.Header
          title={ranInputs ? "Re-run flow" : "Run flow"}
          hideCloseButton
        />
        <Popover.Body>
          <div className={formBody}>
            <p className={formText}>
              Saves your edits, then runs “{name}” in this web.
            </p>
            {runError !== null && (
              <Banner tone="error">
                <Banner.Title>The flow wasn't run</Banner.Title>
                <Banner.Description as="div">
                  <div>{runError}</div>
                  {saveRefusedReason?.split("\n").map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </Banner.Description>
              </Banner>
            )}
            {changedInputLabels.length > 0 && (
              <Banner tone="neutral">
                <Banner.Title>
                  The flow's inputs have changed since this run
                </Banner.Title>
                <Banner.Description>
                  Not filled in: {changedInputLabels.join(", ")}
                </Banner.Description>
              </Banner>
            )}
            {inputs.length === 0 ? (
              <p className={formText}>This flow has no inputs.</p>
            ) : (
              <Form.Section>
                {inputs.map((input) => (
                  <InputField
                    key={input.name}
                    webId={webId}
                    input={input}
                    value={values[input.name]}
                    onChange={(value) => setValue(input.name, value)}
                  />
                ))}
              </Form.Section>
            )}
          </div>
        </Popover.Body>
        <Popover.Footer
          actions={
            <>
              <Button
                variant="subtle"
                size="sm"
                disabled={running}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                iconName={ranInputs ? "rotate" : "play"}
                loading={running}
                disabled={blocker !== null}
                tooltip={blocker ?? undefined}
                onClick={() => {
                  void run();
                }}
              >
                {ranInputs ? "Re-run" : "Run"}
              </Button>
            </>
          }
        />
      </Popover.Container>
    </Popover>
  );
};

/**
 * Runs the flow: a button that opens a form for the flow's inputs under it, disabled while the flow can't be run, saying why.
 * Given a run's inputs, it re-runs the flow, and the form starts with them.
 */
export const RunFlow = ({
  webId,
  editorState,
  ranInputs = null,
  saveRefusedReason,
  onRun,
}: {
  /** The web the flow is in, which the run is in too, and whose entities the form offers. */
  webId: WebId;
  editorState: FlowEditorState;
  /** The inputs of the run to run again, if this re-runs one. */
  ranInputs?: FlowInputValues | null;
  /**
   * Why the API refused the latest edits, if it did. A prop rather than part of the error `onRun` throws, as the save
   * that sets it happens inside `onRun`, which only knows that it failed.
   */
  saveRefusedReason: string | null;
  /**
   * Saves any edits not saved yet, then starts a run with these inputs and opens it. Throws, saying why, if the edits
   * couldn't be saved or the run didn't start.
   */
  onRun: (flowInputs: FlowInputValues) => Promise<void>;
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [formOpen, setFormOpen] = useState(false);
  const blocker = getRunBlocker(editorState);

  return (
    <>
      <Button
        ref={buttonRef}
        variant="subtle"
        size="sm"
        iconName={ranInputs ? "rotate" : "play"}
        pressed={formOpen}
        disabled={blocker !== null}
        tooltip={blocker ?? undefined}
        onClick={() => setFormOpen((open) => !open)}
      >
        {ranInputs ? "Re-run" : "Run"}
      </Button>
      {formOpen && (
        <RunFlowForm
          triggerRef={buttonRef}
          webId={webId}
          name={editorState.flowDefinition.name}
          inputs={editorState.flowDefinition.inputs}
          ranInputs={ranInputs}
          saveRefusedReason={saveRefusedReason}
          onRun={onRun}
          onClose={() => setFormOpen(false)}
        />
      )}
    </>
  );
};
