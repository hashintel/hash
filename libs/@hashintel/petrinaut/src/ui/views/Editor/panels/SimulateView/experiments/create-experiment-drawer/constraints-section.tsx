/**
 * The Create Experiment drawer's Constraints section: one ordered list of
 * parameter and state rows, each with a kind chip, its own language session
 * and a reserved diagnostic line, a pass threshold in the header while a
 * state row exists, and two add buttons. Every row's height is fixed for its
 * kind and the diagnostic line is always there, so a diagnostic arriving
 * mid-typing moves nothing.
 */
import { use, useState } from "react";

import {
  Button,
  Chip,
  HelpTooltip,
  Icon,
  NumberInput,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { DEFAULT_OPTIMIZATION_CONSTRAINT_ALPHA } from "@hashintel/petrinaut-core/optimization";

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
import { constraintPolicyFor } from "./lower-constraint-drafts";

import type {
  ConstraintSpace,
  ScenarioParameter,
} from "@hashintel/petrinaut-core";

const listStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
});

// The chip column is fixed so every row's code starts on one line; the trash
// column holds the extra-small button's width.
const rowStyle = css({
  display: "grid",
  gridTemplateColumns: "[84px minmax(0, 1fr) 28px]",
  alignItems: "start",
  gap: "2",
});

const chipCellStyle = css({
  display: "flex",
  alignItems: "center",
  height: "[28px]",
});

// A grid, not a flex column: the single-line editor's own `flex: 1` would
// otherwise collapse its fixed height.
const editorColumnStyle = css({
  display: "grid",
  gap: "1",
  minWidth: "[0]",
});

// Always mounted: the row's diagnostic lands here without moving anything.
const diagnosticStyle = css({
  fontSize: "xs",
  lineHeight: "[16px]",
  minHeight: "[16px]",
  color: "red.s100",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const emptyStyle = css({
  fontSize: "sm",
  color: "neutral.s80",
});

const addRowStyle = css({
  display: "flex",
  gap: "2",
});

// The header's right side keeps one height whether or not the threshold is
// mounted, so adding the first state row never moves the title line.
const headerActionStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  height: "[28px]",
});

const thresholdLabelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s100",
  whiteSpace: "nowrap",
});

const thresholdInputStyle = css({
  width: "[88px]",
});

const SECTION_TOOLTIP =
  "What the optimizer must respect when it drives this sweep. A parameter constraint rules out points before they compute; a state constraint is checked on every frame of every run and runs on the CPU.";

const KIND_CHIP: Record<
  ConstraintSpace,
  { label: string; color: "grey" | "purple" }
> = {
  parameters: { label: "Parameters", color: "grey" },
  state: { label: "State", color: "purple" },
};

const PLACEHOLDER: Record<ConstraintSpace, string> = {
  parameters: "scenario.min_load < scenario.max_load",
  state: "return state.places.Queue.count <= 10;",
};

/** Three lines of a state constraint's body. */
const STATE_EDITOR_HEIGHT = "72px";

const ConstraintRow = ({
  row,
  label,
  scenarioParameters,
  focusOnMount,
  disabled,
  onCodeChange,
  onRemove,
}: {
  row: ConstraintDraft;
  label: string;
  scenarioParameters: readonly ScenarioParameter[];
  /** Whether the editor takes focus as it mounts: the row the user just added. */
  focusOnMount: boolean;
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
  const chip = KIND_CHIP[row.space];

  return (
    <div role="group" aria-label={label} className={rowStyle}>
      <span className={chipCellStyle}>
        <Chip size="xs" variant="soft" color={chip.color}>
          {chip.label}
        </Chip>
      </span>
      <div className={editorColumnStyle}>
        <CodeEditor
          language="typescript"
          path={getConstraintDocumentUri(row.id)}
          singleLine={!multiline}
          hasError={errorMessage !== undefined}
          value={row.code}
          height={multiline ? STATE_EDITOR_HEIGHT : undefined}
          placeholder={PLACEHOLDER[row.space]}
          options={{ ariaLabel: label, readOnly: disabled }}
          onChange={(code) => onCodeChange(code ?? "")}
          onMount={focusOnMount ? (editor) => editor.focus() : undefined}
        />
        <span className={diagnosticStyle} title={errorMessage}>
          {errorMessage ?? ""}
        </span>
      </div>
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
  );
};

export const ConstraintsSection = ({
  drafts,
  onChange,
  scenarioParameters,
  disabled = false,
}: {
  drafts: ConstraintDraftsState;
  onChange: (drafts: ConstraintDraftsState) => void;
  /** Ambient as `scenario.*` in every row's language session. */
  scenarioParameters: readonly ScenarioParameter[];
  disabled?: boolean;
}) => {
  // The row added last takes focus as its editor mounts; a UI detail the
  // drafts themselves do not carry.
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  const hasStateRow = hasStateConstraintDraft(drafts);
  const alpha =
    constraintPolicyFor(drafts.passThresholdPercent)?.alpha ??
    DEFAULT_OPTIMIZATION_CONSTRAINT_ALPHA;

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
      renderHeaderAction={() => (
        <div className={headerActionStyle}>
          {hasStateRow ? (
            <>
              <span className={thresholdLabelStyle}>Pass threshold</span>
              <NumberInput
                className={thresholdInputStyle}
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
              <HelpTooltip
                content={`A step is clear when every state constraint holds on at least this share of its runs · alpha ${alpha}`}
              />
            </>
          ) : null}
        </div>
      )}
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
              disabled={disabled}
              onCodeChange={(code) =>
                onChange(updateConstraintDraftCode(drafts, row.id, code))
              }
              onRemove={() => onChange(removeConstraintDraft(drafts, row.id))}
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
    </Section>
  );
};
