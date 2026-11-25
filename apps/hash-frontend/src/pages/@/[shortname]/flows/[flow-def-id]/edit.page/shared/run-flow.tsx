import { upperFirst } from "lodash";
import { useRef, useState } from "react";

import {
  Banner,
  Button,
  Dialog,
  Form,
  NumberInput,
  Popover,
  TextInput,
  Toggle,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { EntityInput } from "./run-flow/entity-input";
import {
  getFlowInputValues,
  getFormValuesFromRun,
  getInitialFormValues,
  withGivenValues,
} from "./run-form";
import { useRunBlocker } from "./use-run-blocker";
import { getFlowInputLabel, getKindLabel } from "./value-display";

import type { RunFormValue, RunFormValues } from "./run-form";
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

export const InputField = ({
  webId,
  input,
  value,
  onChange,
  inline = false,
}: {
  webId: WebId;
  input: FlowInputDefinition;
  /** Absent for an input the form can't take. */
  value: RunFormValue | undefined;
  onChange: (value: RunFormValue) => void;
  /** The label beside the input rather than above it, without the description. */
  inline?: boolean;
}) => (
  <Form.Field
    {...(inline ? { layout: "inline" } : {})}
    /* Not a label for an input the form can't take, as there's no input to label. */
    as={value ? "label" : "legend"}
    label={
      /* One span, as the label is a flex row, which would drop the space before "·". */
      <span>
        {getFlowInputLabel(input)}
        {!input.required && <span className={optionalMark}> · optional</span>}
      </span>
    }
    /* Inline, a description would sit on its own row above the label, apart from the input. */
    description={inline ? undefined : upperFirst(getKindLabel(input))}
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

/** What the run form takes, wherever it opens. */
type RunFormProps = {
  webId: WebId;
  name: string;
  inputs: FlowInputDefinition[];
  ranInputs: FlowInputValues | null;
  saveRefusedReason: string | null;
  onRun: (flowInputs: FlowInputValues) => Promise<void>;
  onClose: () => void;
};

/** The form for a run's inputs: a popover under the button that opens it, or a dialog where there's no such button. */
const RunFlowForm = ({
  triggerRef,
  webId,
  name,
  inputs,
  ranInputs,
  saveRefusedReason,
  givenValues,
  running,
  onValueChange,
  onRun,
  onClose,
}: RunFormProps & {
  /** The button the form opens under, or `null` for a dialog. */
  triggerRef: RefObject<HTMLButtonElement | null> | null;
  /** The values given in the form so far, kept while it's closed. */
  givenValues: RunFormValues;
  /** Whether a run is starting. */
  running: boolean;
  onValueChange: (inputName: string, value: RunFormValue) => void;
}) => {
  const [{ values: initialValues, changedInputLabels }] = useState(() =>
    ranInputs
      ? getFormValuesFromRun(inputs, ranInputs)
      : { values: getInitialFormValues(inputs), changedInputLabels: [] },
  );
  const values = withGivenValues(initialValues, givenValues);
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
    setRunError(null);

    try {
      /* The form stays open until the run has opened. */
      await onRun(flowInputs);
      onClose();
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error));
    }
  };

  const title = ranInputs ? "Re-run flow" : "Run flow";
  const description = `Saves your edits, then runs “${name}” in this web.`;
  /* A popover's buttons are small, and a dialog's the default size. */
  const buttonSize = triggerRef ? "sm" : undefined;

  const fields = (
    <>
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
              onChange={(value) => onValueChange(input.name, value)}
            />
          ))}
        </Form.Section>
      )}
    </>
  );

  const actions = (
    <>
      <Button
        variant="subtle"
        size={buttonSize}
        disabled={running}
        onClick={onClose}
      >
        Cancel
      </Button>
      <Button
        size={buttonSize}
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
  );

  if (!triggerRef) {
    return (
      <Dialog
        size="sm"
        onClose={onClose}
        shouldCloseOn={running ? "none" : "closeButtonAndOverlay"}
      >
        <Dialog.Header title={title} description={description} />
        <Dialog.Body>
          <div className={formBody}>{fields}</div>
        </Dialog.Body>
        <Dialog.Footer actions={actions} />
      </Dialog>
    );
  }

  return (
    <Popover
      triggerRef={triggerRef}
      position="bottom-end"
      onClose={running ? undefined : onClose}
    >
      <Popover.Container className={runForm}>
        <Popover.Header title={title} hideCloseButton />
        <Popover.Body>
          <div className={formBody}>
            <p className={formText}>{description}</p>
            {fields}
          </div>
        </Popover.Body>
        <Popover.Footer actions={actions} />
      </Popover.Container>
    </Popover>
  );
};

/** What running the flow takes, from Run, Re-run, or a run's menu in Logs. */
export type FlowRunner = {
  /** The web the flow is in, which the run is in too, and whose entities the form offers. */
  webId: WebId;
  editorState: FlowEditorState;
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
};

/** The run form's state that whatever opens it holds, as it outlasts the form. */
const useRunFormState = (onRun: FlowRunner["onRun"]) => {
  /* Here rather than in the form, so Run can't close the form, or start another run, while one is starting. */
  const [running, setRunning] = useState(false);
  /* Here rather than in the form, so a click on the canvas, which closes the form, doesn't lose what's been given. */
  const [givenValues, setGivenValues] = useState<RunFormValues>({});

  const run = async (flowInputs: FlowInputValues) => {
    setRunning(true);

    try {
      await onRun(flowInputs);
    } finally {
      setRunning(false);
    }
  };

  const setValue = (inputName: string, value: RunFormValue) =>
    setGivenValues((current) => ({ ...current, [inputName]: value }));

  return { running, givenValues, run, setValue };
};

/** The run form as a dialog, for a run's menu in Logs, where no button stays for the form to open under. */
export const RunFlowDialog = ({ onRun, ...formProps }: RunFormProps) => {
  const { running, givenValues, run, setValue } = useRunFormState(onRun);

  return (
    <RunFlowForm
      {...formProps}
      triggerRef={null}
      givenValues={givenValues}
      running={running}
      onValueChange={setValue}
      onRun={run}
    />
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
}: FlowRunner & {
  /** The inputs of the run to run again, if this re-runs one. */
  ranInputs?: FlowInputValues | null;
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [formOpen, setFormOpen] = useState(false);
  const { running, givenValues, run, setValue } = useRunFormState(onRun);
  const blocker = useRunBlocker(editorState);

  return (
    <>
      <Button
        ref={buttonRef}
        variant="subtle"
        size="sm"
        iconName={ranInputs ? "rotate" : "play"}
        pressed={formOpen}
        disabled={blocker !== null || running}
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
          givenValues={givenValues}
          running={running}
          onValueChange={setValue}
          onRun={run}
          onClose={() => setFormOpen(false)}
        />
      )}
    </>
  );
};
