import { use, useRef, useState } from "react";

import {
  Button,
  HelpTooltip,
  Icon,
  NumberInput,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { getConstraintDocumentUri } from "@hashintel/petrinaut-core";

import { LanguageClientContext } from "../../../../../../../react/lsp/context";
import { useLspSession } from "../../../../../../../react/lsp/use-lsp-session";
import { Section } from "../../../../../../components/section";
import { CodeEditor } from "../../../../../../monaco/code-editor";
import {
  addConstraintDraft,
  type ConstraintDraftsState,
  removeConstraintDraft,
  updateConstraintDraftCode,
} from "./constraint-drafts";
import {
  type ConstraintDraft,
  describeConstraint,
  getConstraintErrorMessage,
} from "./constraint-lsp";

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

const groupStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "3",
  border: "[1px solid {colors.neutral.bd.subtle}]",
  borderRadius: "lg",
  backgroundColor: "neutral.s05",
  minWidth: "[0]",
});

const groupHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: "2",
});

const groupTitleStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.fg.body",
});

const groupActionsStyle = css({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "3",
});

const rowStyle = css({
  display: "grid",
  gridTemplateColumns: "[minmax(0, 1fr) auto]",
  alignItems: "start",
  gap: "[4px 8px]",
  minWidth: "[0]",
  borderRadius: "lg",
  _focusVisible: {
    outline: "[2px solid {colors.neutral.a25}]",
    outlineOffset: "[4px]",
  },
});

const removeButtonStyle = css({
  marginTop: "[3px]",
});

const diagnosticStyle = css({
  fontSize: "xs",
  lineHeight: "[16px]",
  color: "red.s100",
  whiteSpace: "pre-wrap",
  gridColumn: "[1 / -1]",
});

const emptyStyle = css({
  fontSize: "sm",
  color: "neutral.s80",
});

const thresholdStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
});

const thresholdFieldStyle = css({
  width: "[80px]",
});

const thresholdLabelStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  fontSize: "xs",
  color: "neutral.s100",
});

const hintStyle = css({
  fontSize: "xs",
  color: "neutral.s100",
});

const constraintGroups = [
  {
    space: "parameters",
    title: "Parameters",
    label: "Parameter constraints",
    description: "Checked before simulation.",
    addLabel: "Add parameter constraint",
  },
  {
    space: "state",
    title: "State",
    label: "State constraints",
    description: "Checked at every time step.",
    addLabel: "Add state constraint",
  },
] as const;

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
  onEditorMount: (
    rowId: string,
    instance: editor.IStandaloneCodeEditor,
  ) => void;
  disabled: boolean;
  onCodeChange: (rowId: string, code: string) => void;
  onRemove: (row: ConstraintDraft) => void;
}) => {
  const {
    diagnosticsByUri,
    initializeConstraintSession,
    updateConstraintSession,
    killConstraintSession,
  } = use(LanguageClientContext);
  useLspSession(
    {
      initialize: initializeConstraintSession,
      update: updateConstraintSession,
      kill: killConstraintSession,
    },
    {
      space: row.space,
      code: row.code,
      scenarioParameters: [...scenarioParameters],
    },
    JSON.stringify([row.space, row.code, scenarioParameters]),
    row.id,
  );
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
          ...(multiline
            ? {
                scrollbar: {
                  vertical: "auto",
                  horizontal: "hidden",
                  alwaysConsumeMouseWheel: false,
                },
              }
            : {}),
        }}
        onEscape={() => rowRef.current?.focus()}
        onChange={(code) => onCodeChange(row.id, code ?? "")}
        onMount={(instance) => {
          onEditorMount(row.id, instance);
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
      <Button
        size="xs"
        variant="ghost"
        tone="neutral"
        iconName="trash"
        className={removeButtonStyle}
        aria-label={`Remove ${label.toLowerCase()}`}
        disabled={disabled}
        onClick={() => onRemove(row)}
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
  onChange: (
    update: (drafts: ConstraintDraftsState) => ConstraintDraftsState,
  ) => void;
  /** Ambient as `scenario.*` in every row's language session. */
  scenarioParameters: readonly ScenarioParameter[];
  placeNames: readonly string[];
  disabled?: boolean;
}) => {
  // The row added last takes focus as its editor mounts; a UI detail the
  // drafts themselves do not carry.
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  const editorsRef = useRef(new Map<string, editor.IStandaloneCodeEditor>());
  const addButtonRefs = useRef<
    Record<ConstraintSpace, HTMLButtonElement | null>
  >({
    parameters: null,
    state: null,
  });
  const parameterName = scenarioParameters[0]?.identifier;
  const placeName = placeNames.find((name) => /^[A-Za-z_$][\w$]*$/.test(name));
  const placeholders: Record<ConstraintSpace, string> = {
    parameters: parameterName
      ? `scenario.${parameterName} > 0`
      : "parameters.rate > 0",
    state: `state.places.${placeName ?? "PlaceName"}.count <= 10`,
  };

  const removeRow = (row: ConstraintDraft) => {
    const rows = drafts.rows.filter(
      (candidate) => candidate.space === row.space,
    );
    const index = rows.findIndex((candidate) => candidate.id === row.id);
    const nextRow = rows[index + 1] ?? rows[index - 1];
    onChange((current) => removeConstraintDraft(current, row.id));
    if (nextRow) {
      editorsRef.current.get(nextRow.id)?.focus();
    } else {
      addButtonRefs.current[row.space]?.focus();
    }
  };

  const addRow = (space: ConstraintSpace) => {
    const id = crypto.randomUUID();
    setFocusRowId(id);
    onChange((current) => addConstraintDraft(current, { id, space, code: "" }));
  };

  const changeCode = (rowId: string, code: string) => {
    onChange((current) => updateConstraintDraftCode(current, rowId, code));
  };

  const registerEditor = (
    rowId: string,
    instance: editor.IStandaloneCodeEditor,
  ) => {
    editorsRef.current.set(rowId, instance);
    instance.onDidDispose(() => editorsRef.current.delete(rowId));
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
      ) : null}
      <div className={listStyle}>
        {constraintGroups.map((group) => {
          const rows = drafts.rows.filter((row) => row.space === group.space);
          return (
            <div
              key={group.space}
              role="group"
              aria-label={group.label}
              className={groupStyle}
            >
              <div className={groupHeaderStyle}>
                <div>
                  <div className={groupTitleStyle}>{group.title}</div>
                  <div className={hintStyle}>{group.description}</div>
                </div>
                <div className={groupActionsStyle}>
                  {group.space === "state" && rows.length > 0 ? (
                    <div className={thresholdStyle}>
                      <span className={thresholdLabelStyle}>
                        Pass threshold
                        <HelpTooltip content="Minimum share of runs that must satisfy each state condition at every time step." />
                      </span>
                      <div className={thresholdFieldStyle}>
                        <NumberInput
                          size="xs"
                          min={1}
                          max={99.9}
                          step={0.5}
                          hideStepper
                          suffix={{ text: "%", variant: "subtle" }}
                          aria-label="Pass threshold (percent)"
                          value={drafts.passThresholdPercent}
                          disabled={disabled}
                          onChange={(passThresholdPercent) =>
                            onChange((current) => ({
                              ...current,
                              passThresholdPercent,
                            }))
                          }
                        />
                      </div>
                    </div>
                  ) : null}
                  <Button
                    variant="ghost"
                    tone="neutral"
                    size="xs"
                    prefix={<Icon name="plus" size="xs" />}
                    ref={(element) => {
                      addButtonRefs.current[group.space] = element;
                    }}
                    aria-label={group.addLabel}
                    disabled={disabled}
                    onClick={() => addRow(group.space)}
                  >
                    Add
                  </Button>
                </div>
              </div>
              {rows.map((row) => (
                <ConstraintRow
                  key={row.id}
                  row={row}
                  label={describeConstraint(row, drafts.rows)}
                  scenarioParameters={scenarioParameters}
                  focusOnMount={row.id === focusRowId}
                  placeholder={placeholders[row.space]}
                  onEditorMount={registerEditor}
                  disabled={disabled}
                  onCodeChange={changeCode}
                  onRemove={removeRow}
                />
              ))}
            </div>
          );
        })}
      </div>
    </Section>
  );
};
