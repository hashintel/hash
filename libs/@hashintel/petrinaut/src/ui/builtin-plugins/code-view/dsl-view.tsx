import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { CodeEditor } from "../../monaco/code-editor";
import { dslLanguageId, registerDslLanguage } from "./dsl-language";

import type { DslDiagnostic } from "@hashintel/petrinaut-core";
import type { editor } from "monaco-editor";
import type * as Monaco from "monaco-editor/esm/vs/editor/editor.api.js";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
  minWidth: "[0]",
  backgroundColor: "neutral.s00",
});

const toolbarStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flexShrink: "0",
  paddingX: "3",
  paddingY: "2",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.s30",
  fontSize: "sm",
  color: "neutral.s100",
});

const toolbarSpaceStyle = css({
  width: "[var(--edit-view-selector-width)]",
  flexShrink: "0",
});

const toolbarHintStyle = css({
  flex: "[1]",
  minWidth: "[0]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const toolbarWarningStyle = css({
  color: "[#b45309]",
});

const editorStyle = css({
  flex: "[1]",
  minHeight: "[0]",
  "& > div": { height: "full", border: "none", borderRadius: "[0]" },
});

/** The lines of the entity the editor's selection names. */
export type RevealedLines = { startLine: number; endLine: number } | null;

/** What the text is to the net right now, which the toolbar tells. */
export type DslViewStatus =
  | { kind: "clean" }
  | { kind: "readOnly"; reason: string }
  | {
      kind: "editing";
      errors: number;
      /** The net changed since the draft began: applying overwrites that change. */
      stale: boolean;
      canApply: boolean;
    };

type MountedEditor = {
  instance: editor.IStandaloneCodeEditor;
  monaco: typeof Monaco;
};

const markerOwner = "petrinaut-dsl";

const toMarker = (
  monaco: typeof Monaco,
  diagnostic: DslDiagnostic,
): editor.IMarkerData => ({
  severity:
    diagnostic.severity === "error"
      ? monaco.MarkerSeverity.Error
      : monaco.MarkerSeverity.Warning,
  message: diagnostic.message,
  startLineNumber: diagnostic.range.startLine,
  startColumn: diagnostic.range.startColumn,
  endLineNumber: diagnostic.range.endLine,
  endColumn: diagnostic.range.endColumn,
});

const statusText = (status: DslViewStatus): string => {
  switch (status.kind) {
    case "clean":
      return "Edit the text and apply it to the net. Select an item on the canvas to find it here.";
    case "readOnly":
      return status.reason;
    case "editing":
      if (status.errors > 0) {
        return `${status.errors} ${status.errors === 1 ? "error" : "errors"} to fix before applying.`;
      }
      if (status.stale) {
        return "The net changed since you started editing. Applying replaces that change.";
      }
      return "Unsaved changes. Apply with ⌘S or Ctrl+S.";
  }
};

/**
 * The net as DSL text in a Monaco editor. Clean, the text follows the net
 * and the lines of the selected entity are highlighted and scrolled into
 * view; edited, the diagnostics mark the text and Apply writes it back.
 */
export const DslView = ({
  text,
  diagnostics,
  revealed,
  status,
  onChange,
  onApply,
  onDiscard,
}: {
  text: string;
  diagnostics: readonly DslDiagnostic[];
  revealed: RevealedLines;
  status: DslViewStatus;
  onChange: (text: string) => void;
  onApply: () => void;
  onDiscard: () => void;
}) => {
  const [mounted, setMounted] = useState<MountedEditor | null>(null);
  const [copied, setCopied] = useState(false);

  // Monaco is imperative: the highlight and the scroll are applied to the
  // editor instance whenever the selection's lines change.
  useEffect(() => {
    if (mounted === null || revealed === null) {
      return;
    }
    const decorations = mounted.instance.createDecorationsCollection([
      {
        range: {
          startLineNumber: revealed.startLine,
          startColumn: 1,
          endLineNumber: revealed.endLine,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          className: "petrinaut-dsl-selected-line",
          linesDecorationsClassName: "petrinaut-dsl-selected-gutter",
        },
      },
    ]);
    mounted.instance.revealLinesInCenterIfOutsideViewport(
      revealed.startLine,
      revealed.endLine,
    );
    return () => decorations.clear();
  }, [mounted, revealed]);

  useEffect(() => {
    const model = mounted?.instance.getModel() ?? null;
    if (mounted === null || model === null) {
      return;
    }
    mounted.monaco.editor.setModelMarkers(
      model,
      markerOwner,
      diagnostics.map((diagnostic) => toMarker(mounted.monaco, diagnostic)),
    );
    return () => mounted.monaco.editor.setModelMarkers(model, markerOwner, []);
  }, [mounted, diagnostics]);

  // While the editor has focus the code editor leaves its model alone, so a
  // text applied or discarded from the keyboard would stay on screen as the
  // draft it was. Clean, the model is made to read the net's text, keeping
  // the scroll position.
  useEffect(() => {
    const model = mounted?.instance.getModel() ?? null;
    if (
      mounted === null ||
      model === null ||
      status.kind === "editing" ||
      model.getValue() === text
    ) {
      return;
    }
    const viewState = mounted.instance.saveViewState();
    model.setValue(text);
    if (viewState !== null) {
      mounted.instance.restoreViewState(viewState);
    }
  }, [mounted, status.kind, text]);

  // The editor's save shortcut applies the text. Monaco keeps the action
  // for the editor's life; it reads the handler committed last.
  const onApplyRef = useRef(onApply);
  useLayoutEffect(() => {
    onApplyRef.current = onApply;
  });
  useEffect(() => {
    if (mounted === null) {
      return;
    }
    const { KeyMod, KeyCode } = mounted.monaco;
    // oxlint-disable-next-line no-bitwise -- a keybinding is the modifier's and the key's flags together
    const save = KeyMod.CtrlCmd | KeyCode.KeyS;
    const action = mounted.instance.addAction({
      id: "petrinaut-dsl.apply",
      label: "Apply the text to the net",
      keybindings: [save],
      run: () => onApplyRef.current(),
    });
    return () => action.dispose();
  }, [mounted]);

  const readOnly = status.kind === "readOnly";
  const mount = (
    instance: editor.IStandaloneCodeEditor,
    monaco: typeof Monaco,
  ): void => setMounted({ instance, monaco });

  return (
    <div className={containerStyle}>
      <div className={toolbarStyle}>
        <div aria-hidden className={toolbarSpaceStyle} />
        <span
          className={`${toolbarHintStyle} ${
            status.kind === "editing" && (status.errors > 0 || status.stale)
              ? toolbarWarningStyle
              : ""
          }`}
        >
          {statusText(status)}
        </span>
        {status.kind === "editing" ? (
          <>
            <Button size="xs" variant="ghost" onClick={onDiscard}>
              Discard
            </Button>
            <Button
              size="xs"
              variant="subtle"
              iconName="check"
              disabled={!status.canApply}
              tooltip={
                status.canApply
                  ? "Write the text to the net (⌘S / Ctrl+S)"
                  : "Fix the errors first"
              }
              onClick={onApply}
            >
              Apply
            </Button>
          </>
        ) : null}
        <Button
          size="xs"
          variant="ghost"
          iconName={copied ? "check" : "copy"}
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div className={editorStyle}>
        <style>{`
          .petrinaut-dsl-selected-line { background: rgba(59, 130, 246, 0.10); }
          .petrinaut-dsl-selected-gutter { background: rgba(59, 130, 246, 0.6); width: 3px !important; margin-left: 3px; }
        `}</style>
        <CodeEditor
          language={dslLanguageId}
          value={text}
          height="100%"
          beforeMount={registerDslLanguage}
          onMount={mount}
          onChange={(value) => onChange(value ?? "")}
          options={{
            readOnly,
            domReadOnly: readOnly,
            lineNumbers: "on",
            lineNumbersMinChars: 3,
            folding: true,
            renderLineHighlight: readOnly ? "none" : "line",
            wordWrap: "on",
          }}
        />
      </div>
    </div>
  );
};
