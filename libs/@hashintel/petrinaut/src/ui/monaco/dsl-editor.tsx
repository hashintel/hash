import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { CodeEditor } from "./code-editor";
import { dslLanguageId, registerDslLanguage } from "./dsl-language";

import type { DslDiagnostic } from "@hashintel/petrinaut-core";
import type { editor } from "monaco-editor";
import type * as Monaco from "monaco-editor/esm/vs/editor/editor.api.js";

const editorStyle = css({
  flex: "[1]",
  minHeight: "[0]",
  "& > div": { height: "full", border: "none", borderRadius: "[0]" },
});

/** The lines of an entity to highlight and scroll into view, 1-based and inclusive. */
export type DslRevealedLines = { startLine: number; endLine: number } | null;

export type DslEditorProps = {
  /**
   * The text. The model follows it even while the editor has focus, caret
   * and scroll kept, so a host that prints the text again after a save shows
   * the result at once.
   */
  value: string;
  onChange?: (text: string) => void;
  /** Shown as markers, each at its range. */
  diagnostics?: readonly DslDiagnostic[];
  revealed?: DslRevealedLines;
  readOnly?: boolean;
  /** Runs on the editor's save shortcut, ⌘S or Ctrl+S. */
  onSave?: () => void;
};

type MountedEditor = {
  instance: editor.IStandaloneCodeEditor;
  monaco: typeof Monaco;
};

const markerOwner = "petrinaut-dsl";
const noDiagnostics: readonly DslDiagnostic[] = [];

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

/**
 * The Petrinaut DSL in a Monaco editor: the language registered, the
 * diagnostics as markers, a span of lines revealed, and the save shortcut
 * routed to the host. A controlled editor: the text is the host's.
 */
export const DslEditor = ({
  value,
  onChange,
  diagnostics = noDiagnostics,
  revealed = null,
  readOnly = false,
  onSave,
}: DslEditorProps) => {
  const [mounted, setMounted] = useState<MountedEditor | null>(null);

  // Monaco is imperative: the highlight and the scroll are applied to the
  // editor instance whenever the revealed lines change.
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
  // text the host changed from the keyboard, applied or discarded, would stay
  // on screen as it was typed. The model is made to read `value` instead.
  useEffect(() => {
    const model = mounted?.instance.getModel() ?? null;
    if (mounted === null || model === null || model.getValue() === value) {
      return;
    }
    const viewState = mounted.instance.saveViewState();
    model.setValue(value);
    if (viewState !== null) {
      mounted.instance.restoreViewState(viewState);
    }
  }, [mounted, value]);

  // Monaco keeps the save action for the editor's life; it reads the
  // handler committed last.
  const onSaveRef = useRef(onSave);
  useLayoutEffect(() => {
    onSaveRef.current = onSave;
  });
  useEffect(() => {
    if (mounted === null) {
      return;
    }
    const { KeyMod, KeyCode } = mounted.monaco;
    // oxlint-disable-next-line no-bitwise -- a keybinding is the modifier's and the key's flags together
    const save = KeyMod.CtrlCmd | KeyCode.KeyS;
    const action = mounted.instance.addAction({
      id: "petrinaut-dsl.save",
      label: "Save the text",
      keybindings: [save],
      run: () => onSaveRef.current?.(),
    });
    return () => action.dispose();
  }, [mounted]);

  const mount = (
    instance: editor.IStandaloneCodeEditor,
    monaco: typeof Monaco,
  ): void => setMounted({ instance, monaco });

  return (
    <div className={editorStyle}>
      <style>{`
        .petrinaut-dsl-selected-line { background: rgba(59, 130, 246, 0.10); }
        .petrinaut-dsl-selected-gutter { background: rgba(59, 130, 246, 0.6); width: 3px !important; margin-left: 3px; }
      `}</style>
      <CodeEditor
        language={dslLanguageId}
        value={value}
        height="100%"
        beforeMount={registerDslLanguage}
        onMount={mount}
        onChange={(text) => onChange?.(text ?? "")}
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
  );
};
