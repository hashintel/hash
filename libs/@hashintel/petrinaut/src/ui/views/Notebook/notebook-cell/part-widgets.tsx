import { useRef } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { useIsReadOnly } from "../../../../react/state/use-is-read-only";
import { useDraftField } from "../../../hooks/use-draft-field";
import { CodeEditor } from "../../../monaco/code-editor";
import { focusLands } from "../../../worksheet/focus-flow";
import { fieldLabelStyle, fieldRowStyle, fieldValueStyle } from "./part-styles";

import type { CodeEditorProps } from "../../../monaco/code-editor";
import type { BodyPartContext } from "./cell-body-parts";

const CODE_LINE_HEIGHT = 18;

const CellCodeBlock: React.FC<{
  code: string;
  path: string;
  onChange: (code: string) => void;
}> = ({ code, path, onChange }) => {
  const isReadOnly = useIsReadOnly();
  const editorRef = useRef<
    Parameters<NonNullable<CodeEditorProps["onMount"]>>[0] | null
  >(null);
  const lineCount = code.split("\n").length;
  const height = Math.min(Math.max(lineCount, 3), 24) * CODE_LINE_HEIGHT + 16;

  return (
    <CodeEditor
      path={path}
      language="typescript"
      value={code}
      height={height}
      onMount={(editorInstance) => {
        editorRef.current = editorInstance;
      }}
      onChange={(value) => {
        // Only user edits commit: models are shared by URI and reset
        // programmatically around mount and mode switches, and writing those
        // resets back would wipe the code they carry.
        if (value !== undefined && editorRef.current?.hasTextFocus()) {
          onChange(value);
        }
      }}
      options={{
        readOnly: isReadOnly,
        lineNumbers: "on",
        scrollbar: { alwaysConsumeMouseWheel: false },
      }}
    />
  );
};

const widgetCellStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  paddingX: "0.5",
  borderRadius: "sm",
});

/**
 * Focusable widget surfaces, in engage order. Monaco's own surface varies by
 * version: a textarea in older builds, an EditContext div in newer ones.
 */
const WIDGET_SELECTOR =
  '.native-edit-context, textarea, input, select, [contenteditable="true"], [tabindex="0"]';

/**
 * Enter on a part either activates or engages its widget: one-shot controls
 * (buttons, checkboxes) act immediately, editable ones (inputs, selects,
 * code editors) take focus so every key belongs to them until Escape.
 */
const activateOrEngage = (container: HTMLElement) => {
  for (const candidate of container.querySelectorAll<HTMLElement>(
    `${WIDGET_SELECTOR}, button`,
  )) {
    if (
      candidate instanceof HTMLButtonElement ||
      (candidate instanceof HTMLInputElement && candidate.type === "checkbox")
    ) {
      candidate.click();
      return;
    }
    if (focusLands(candidate)) {
      return;
    }
  }
};

/**
 * A part with widgets inside — a code editor, inputs, selects. The widgets
 * are their own keyboard world: Enter on the part engages the first one,
 * every key then belongs to the widget, Tab cycles the part's widgets, and
 * Escape hands focus back to the part — the grid "interaction mode" pattern
 * from the ARIA Authoring Practices. Widgets carry `tabIndex={-1}` so each
 * cell list stays a single roving tab stop.
 *
 * With a `column`, the part is one cell of a multi-cell line rather than a
 * full-width line: horizontal arrows walk the line's cells too, and the
 * focus flow targets the cell by its `data-part-column`. `className` styles
 * a full-width part only.
 */
export const WidgetPart: React.FC<{
  parts: BodyPartContext;
  partId: string;
  column?: number;
  className?: string;
  children: React.ReactNode;
}> = ({ parts, partId, column, className, children }) => {
  const focus = parts.focusFor(partId, column);
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- each cell part is a roving focus stop.
    <div
      data-cell-part={focus.stopId}
      data-part-column={column}
      role="group"
      tabIndex={focus.tabIndex}
      className={column === undefined ? className : widgetCellStyle}
      onFocus={(event) => {
        if (event.target === event.currentTarget) {
          focus.onFocus();
        }
      }}
      onKeyDown={(event) => {
        const part = event.currentTarget;
        if (event.target !== part) {
          // Keys bubbling out of an engaged widget: Escape disengages, Tab
          // cycles the part's widgets, everything else stays the widget's.
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            part.focus();
          } else if (event.key === "Tab") {
            const widgets = [
              ...part.querySelectorAll<HTMLElement>(WIDGET_SELECTOR),
            ];
            const at = widgets.indexOf(event.target as HTMLElement);
            const next = widgets[at + (event.shiftKey ? -1 : 1)];
            if (at !== -1 && next) {
              event.preventDefault();
              event.stopPropagation();
              next.focus();
            }
          }
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          activateOrEngage(part);
        } else if (
          event.key === "ArrowDown" ||
          event.key === "ArrowUp" ||
          (column !== undefined &&
            (event.key === "ArrowLeft" || event.key === "ArrowRight"))
        ) {
          focus.onNavigate(event);
        }
      }}
    >
      {children}
    </div>
  );
};

const inlineInputStyle = css({
  fontFamily: "mono",
  fontSize: "xs",
  color: "neutral.s115",
  backgroundColor: "[transparent]",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "[transparent]",
  borderRadius: "sm",
  paddingX: "1",
  _hover: { borderColor: "neutral.s40" },
  _focus: {
    borderColor: "blue.s70",
    outline: "[none]",
    backgroundColor: "neutral.s00",
  },
});

/**
 * Inline draft text input for one field of a cell: edits stay local until
 * blur or Enter commits them, Escape reverts to the net's value, and drafts
 * failing `isValid` revert instead of committing.
 */
export const PartTextField: React.FC<{
  sourceId: string;
  value: string;
  onCommit: (value: string) => void;
  isValid?: (draft: string) => boolean;
  "aria-label": string;
}> = ({ sourceId, value, onCommit, isValid, "aria-label": ariaLabel }) => {
  const isReadOnly = useIsReadOnly();
  const draft = useDraftField({ sourceId, sourceValue: value });
  // Enter and Escape hand focus back to the part, which blurs the input
  // before their own state settles — the blur must not commit again (Enter)
  // or commit the draft the user just discarded (Escape).
  const skipBlurCommitRef = useRef(false);

  const commit = () => {
    if (isReadOnly || draft.value === value) {
      return;
    }
    if (isValid?.(draft.value) ?? true) {
      onCommit(draft.value);
    } else {
      draft.setValue(value);
    }
  };

  return (
    <input
      tabIndex={-1}
      className={inlineInputStyle}
      style={{
        width: `${Math.min(Math.max(draft.value.length + 2, 6), 48)}ch`,
      }}
      aria-label={ariaLabel}
      readOnly={isReadOnly}
      value={draft.value}
      onChange={(event) => draft.setValue(event.target.value)}
      onBlur={() => {
        if (skipBlurCommitRef.current) {
          skipBlurCommitRef.current = false;
          return;
        }
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          skipBlurCommitRef.current = true;
          event.currentTarget.closest<HTMLElement>("[data-cell-part]")?.focus();
        } else if (event.key === "Escape") {
          draft.setValue(value);
          skipBlurCommitRef.current = true;
        }
      }}
    />
  );
};

const inlineSelectStyle = css({
  fontFamily: "mono",
  fontSize: "xs",
  color: "neutral.s115",
  backgroundColor: "[transparent]",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.s40",
  borderRadius: "sm",
  paddingX: "0.5",
  _focus: { borderColor: "blue.s70", outline: "[none]" },
});

/** Inline enum/reference select for one field of a cell. */
export const PartSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  "aria-label": string;
}> = ({ value, onChange, options, "aria-label": ariaLabel }) => {
  const isReadOnly = useIsReadOnly();
  return (
    <select
      tabIndex={-1}
      className={inlineSelectStyle}
      aria-label={ariaLabel}
      disabled={isReadOnly}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
};

/** A code block as a focus-flow part; edits commit through `onChange`. */
export const BodyCodeBlock: React.FC<{
  parts: BodyPartContext;
  partId: string;
  code: string;
  path: string;
  onChange: (code: string) => void;
}> = ({ parts, partId, code, path, onChange }) => (
  <WidgetPart parts={parts} partId={partId}>
    <CellCodeBlock code={code} path={path} onChange={onChange} />
  </WidgetPart>
);

/** A labelled line of a body, as one full-width part of the focus flow. */
export const FieldRow: React.FC<{
  label: string;
  parts: BodyPartContext;
  partId: string;
  children: React.ReactNode;
}> = ({ label, parts, partId, children }) => (
  <WidgetPart parts={parts} partId={partId} className={fieldRowStyle}>
    <span className={fieldLabelStyle}>{label}</span>
    <span className={fieldValueStyle}>{children}</span>
  </WidgetPart>
);
