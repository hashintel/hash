import { use } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { LanguageClientContext } from "../../../../../../../react/lsp/context";
import { CodeEditor } from "../../../../../../monaco/code-editor";
import { getConstraintDocumentUri } from "../../../../../../monaco/editor-paths";
import {
  type ConstraintDraft,
  describeConstraint,
  getConstraintErrorMessage,
} from "./constraint-lsp";
import { useConstraintLspSession } from "./use-constraint-lsp-session";

import type {
  ConstraintSpace,
  ScenarioParameter,
} from "@hashintel/petrinaut-core";

const listStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
});

const rowStyle = css({
  display: "flex",
  alignItems: "flex-start",
  gap: "2",
  "& > :first-child": {
    flex: "[1]",
    minWidth: "0",
  },
});

// A grid, not a flex column: the single-line editor's own `flex: 1` would
// otherwise collapse its fixed height.
const editorColumnStyle = css({
  display: "grid",
  gap: "1",
});

const errorStyle = css({
  fontSize: "xs",
  color: "red.s100",
  whiteSpace: "pre-wrap",
});

const ADD_LABEL: Record<ConstraintSpace, string> = {
  parameters: "Add parameter constraint",
  state: "Add state constraint",
};

const ConstraintDraftRow = ({
  draft,
  index,
  space,
  scenarioParameters,
  onChange,
  onRemove,
}: {
  draft: ConstraintDraft;
  index: number;
  space: ConstraintSpace;
  scenarioParameters: ScenarioParameter[];
  onChange: (code: string) => void;
  onRemove: () => void;
}) => {
  useConstraintLspSession({
    sessionId: draft.id,
    space,
    code: draft.code,
    scenarioParameters,
  });
  const { diagnosticsByUri } = use(LanguageClientContext);
  const errorMessage = getConstraintErrorMessage(diagnosticsByUri, draft.id);
  const label = describeConstraint(space, index);
  const multiline = space === "state";

  return (
    <div role="group" aria-label={label} className={rowStyle}>
      <div className={editorColumnStyle}>
        <CodeEditor
          language="typescript"
          path={getConstraintDocumentUri(draft.id)}
          singleLine={!multiline}
          hasError={errorMessage !== undefined}
          value={draft.code}
          height={multiline ? "96px" : undefined}
          onChange={(code) => onChange(code ?? "")}
        />
        {errorMessage !== undefined ? (
          <span className={errorStyle}>{errorMessage}</span>
        ) : null}
      </div>
      <Button
        size="xs"
        variant="ghost"
        tone="neutral"
        aria-label={`Remove ${label.toLowerCase()}`}
        onClick={onRemove}
      >
        Remove
      </Button>
    </div>
  );
};

/**
 * One editable list of constraints in a space: an editor per row, a remove
 * button, and a quiet add button. Parameter constraints edit as one-line
 * expressions; state constraints as small code bodies. Every row runs its own
 * language session, keyed by the draft id, so it is type-checked as typed and
 * completes `scenario.*` against `scenarioParameters`.
 */
export const ConstraintDraftList = ({
  space,
  drafts,
  onChange,
  scenarioParameters,
}: {
  space: ConstraintSpace;
  drafts: ConstraintDraft[];
  onChange: (drafts: ConstraintDraft[]) => void;
  /** The study's scenario parameters, ambient as `scenario.*`. */
  scenarioParameters: ScenarioParameter[];
}) => (
  <div className={listStyle}>
    {drafts.map((draft, index) => (
      <ConstraintDraftRow
        key={draft.id}
        draft={draft}
        index={index}
        space={space}
        scenarioParameters={scenarioParameters}
        onChange={(code) =>
          onChange(
            drafts.map((candidate) =>
              candidate.id === draft.id ? { ...candidate, code } : candidate,
            ),
          )
        }
        onRemove={() =>
          onChange(drafts.filter((candidate) => candidate.id !== draft.id))
        }
      />
    ))}
    <div>
      <Button
        size="sm"
        variant="subtle"
        tone="neutral"
        onClick={() =>
          onChange([...drafts, { id: crypto.randomUUID(), code: "" }])
        }
      >
        {ADD_LABEL[space]}
      </Button>
    </div>
  </div>
);
