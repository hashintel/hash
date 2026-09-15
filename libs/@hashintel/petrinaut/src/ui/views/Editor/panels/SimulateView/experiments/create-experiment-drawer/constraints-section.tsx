import { use, useRef, useState } from "react";

import { Button, Icon, NumberInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { LanguageClientContext } from "../../../../../../../react/lsp/context";
import { Section } from "../../../../../../components/section";
import { CodeEditor } from "../../../../../../monaco/code-editor";
import { getConstraintDocumentUri } from "../../../../../../monaco/editor-paths";
import {
  addConstraintDraft,
  type ConstraintDraftsState,
  hasStateConstraintDraft,
  removeConstraintDraft,
  updateConstraintDraftCode,
} from "./constraint-drafts";
import {
  type ConstraintDraft,
  describeConstraint,
  getConstraintErrorMessage,
} from "./constraint-lsp";
import { useConstraintLspSession } from "./constraints-section/use-constraint-lsp-session";

import type {
  ConstraintSpace,
  ScenarioParameter,
} from "@hashintel/petrinaut-core";
import type { editor } from "monaco-editor";

const listStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
});

const rowStyle = css({
  display: "grid",
  gap: "1",
  minWidth: "[0]",
  borderRadius: "lg",
  _focusVisible: {
    outline: "[2px solid {colors.neutral.a25}]",
    outlineOffset: "[4px]",
  },
});

const rowHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
});

const rowLabelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s100",
});

const diagnosticStyle = css({
  fontSize: "xs",
  lineHeight: "[16px]",
  color: "red.s100",
  whiteSpace: "pre-wrap",
});

const emptyStyle = css({
  fontSize: "sm",
  color: "neutral.s80",
});

const addRowStyle = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "2",
});

const thresholdStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  paddingTop: "2",
  borderTopWidth: "[1px]",
  borderTopStyle: "solid",
  borderTopColor: "neutral.bd.subtle",
});

const thresholdFieldStyle = css({
  display: "grid",
  gridTemplateColumns: "[minmax(0, 1fr) 120px]",
  alignItems: "center",
  gap: "2",
});

const thresholdLabelStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
});

const hintStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
});

const SECTION_TOOLTIP =
  "What the optimizer must respect when it drives this sweep. A parameter constraint rules out points before they compute; a state constraint is checked on every frame of every run and runs on the CPU.";

const ConstraintRow = ({
  row,
  label,
  scenarioParameters,
  focusOnMount,
  placeholder,
  onEditorMount,
  disabled,
  onCodeChange,
  onRemove,
}: {
  row: ConstraintDraft;
  label: string;
  scenarioParameters: readonly ScenarioParameter[];
  /** Whether the editor takes focus as it mounts: the row the user just added. */
  focusOnMount: boolean;
  placeholder: string;
  onEditorMount: (instance: editor.IStandaloneCodeEditor) => void;
  disabled: boolean;
  onCodeChange: (code: string) => void;
  onRemove: () => void;
}) => {
  useConstraintLspSession({
    sessionId: row.id,
    space: row.space,
    code: row.code,
    scenarioParameters,
  });
  const { diagnosticsByUri } = use(LanguageClientContext);
  const errorMessage = getConstraintErrorMessage(diagnosticsByUri, row.id);
  const multiline = row.space === "state";
  const rowRef = useRef<HTMLDivElement>(null);
  const [editorHeight, setEditorHeight] = useState(30);

  return (
    <div
      ref={rowRef}
      role="group"
      aria-label={label}
      tabIndex={-1}
      className={rowStyle}
    >
      <div className={rowHeaderStyle}>
        <span className={rowLabelStyle}>
          {row.space === "parameters" ? "Parameters" : "State"}
        </span>
        <Button
          size="xs"
          variant="ghost"
          tone="neutral"
          iconName="trash"
          aria-label={`Remove ${label.toLowerCase()}`}
          disabled={disabled}
          onClick={onRemove}
        />
      </div>
      <CodeEditor
        language="typescript"
        path={getConstraintDocumentUri(row.id)}
        singleLine={!multiline}
        hasError={errorMessage !== undefined}
        value={row.code}
        height={multiline ? `${editorHeight}px` : undefined}
        placeholder={placeholder}
        options={{
          ariaLabel: label,
          readOnly: disabled,
          tabFocusMode: true,
          lineHeight: 16,
          padding: { top: 6, bottom: 6 },
          lineDecorationsWidth: 8,
          lineNumbersMinChars: 0,
          folding: false,
          renderLineHighlight: "none",
          overviewRulerLanes: 0,
          overviewRulerBorder: false,
          wordWrap: multiline ? "on" : "off",
          scrollbar: {
            vertical: "auto",
            horizontal: "hidden",
            alwaysConsumeMouseWheel: false,
          },
        }}
        onEscape={() => rowRef.current?.focus()}
        onChange={(code) => onCodeChange(code ?? "")}
        onMount={(instance) => {
          onEditorMount(instance);
          if (multiline) {
            const resize = () =>
              setEditorHeight(
                Math.min(142, Math.max(30, instance.getContentHeight() + 2)),
              );
            resize();
            instance.onDidContentSizeChange(resize);
          }
          if (focusOnMount) {
            instance.focus();
          }
        }}
      />
      {errorMessage ? (
        <span className={diagnosticStyle} role="alert">
          {errorMessage}
        </span>
      ) : null}
    </div>
  );
};

export const ConstraintsSection = ({
  drafts,
  onChange,
  scenarioParameters,
  placeNames,
  disabled = false,
}: {
  drafts: ConstraintDraftsState;
  onChange: (drafts: ConstraintDraftsState) => void;
  /** Ambient as `scenario.*` in every row's language session. */
  scenarioParameters: readonly ScenarioParameter[];
  placeNames: readonly string[];
  disabled?: boolean;
}) => {
  // The row added last takes focus as its editor mounts; a UI detail the
  // drafts themselves do not carry.
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  const hasStateRow = hasStateConstraintDraft(drafts);
  const editorRefs = useRef(new Map<string, editor.IStandaloneCodeEditor>());
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const parameterName = scenarioParameters[0]?.identifier;
  const placeName = placeNames[0];
  const placeholders: Record<ConstraintSpace, string> = {
    parameters: parameterName
      ? `scenario.${parameterName} > 0`
      : "parameters.rate > 0",
    state: `return state.places[${JSON.stringify(placeName ?? "Queue")}].count <= 10;`,
  };

  const removeRow = (row: ConstraintDraft) => {
    const index = drafts.rows.findIndex((candidate) => candidate.id === row.id);
    const nextRow = drafts.rows[index + 1] ?? drafts.rows[index - 1];
    onChange(removeConstraintDraft(drafts, row.id));
    if (nextRow) {
      editorRefs.current.get(nextRow.id)?.focus();
    } else {
      addButtonRef.current?.focus();
    }
  };

  const addRow = (space: ConstraintSpace) => {
    const id = crypto.randomUUID();
    setFocusRowId(id);
    onChange(addConstraintDraft(drafts, { id, space, code: "" }));
  };

  return (
    <Section
      title="Constraints"
      tooltip={SECTION_TOOLTIP}
      collapsible
      defaultOpen
    >
      {drafts.rows.length === 0 ? (
        <span className={emptyStyle}>
          No constraints — the optimizer may try any point of the sweep.
        </span>
      ) : (
        <div className={listStyle}>
          {drafts.rows.map((row) => (
            <ConstraintRow
              key={row.id}
              row={row}
              label={describeConstraint(row, drafts.rows)}
              scenarioParameters={scenarioParameters}
              focusOnMount={row.id === focusRowId}
              placeholder={placeholders[row.space]}
              onEditorMount={(instance) => {
                editorRefs.current.set(row.id, instance);
                instance.onDidDispose(() => editorRefs.current.delete(row.id));
              }}
              disabled={disabled}
              onCodeChange={(code) =>
                onChange(updateConstraintDraftCode(drafts, row.id, code))
              }
              onRemove={() => removeRow(row)}
            />
          ))}
        </div>
      )}
      <div className={addRowStyle}>
        <Button
          variant="subtle"
          tone="neutral"
          size="sm"
          prefix={<Icon name="plus" size="sm" />}
          ref={addButtonRef}
          aria-label="Add parameter constraint"
          disabled={disabled}
          onClick={() => addRow("parameters")}
        >
          Parameter constraint
        </Button>
        <Button
          variant="subtle"
          tone="neutral"
          size="sm"
          prefix={<Icon name="plus" size="sm" />}
          aria-label="Add state constraint"
          disabled={disabled}
          onClick={() => addRow("state")}
        >
          State constraint
        </Button>
      </div>
      {hasStateRow ? (
        <div className={thresholdStyle}>
          <div className={thresholdFieldStyle}>
            <span className={thresholdLabelStyle}>Pass threshold</span>
            <NumberInput
              size="sm"
              min={1}
              max={99.9}
              step={0.5}
              hideStepper
              suffix={{ text: "%", variant: "subtle" }}
              aria-label="Pass threshold (percent)"
              value={drafts.passThresholdPercent}
              disabled={disabled}
              onChange={(passThresholdPercent) =>
                onChange({ ...drafts, passThresholdPercent })
              }
            />
          </div>
          <span className={hintStyle}>
            Minimum share of runs that must satisfy each state condition at
            every time step.
          </span>
        </div>
      ) : null}
    </Section>
  );
};
