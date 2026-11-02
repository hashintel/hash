import { useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { DslEditor, type DslRevealedLines } from "../../monaco/dsl-editor";

import type { DslDiagnostic } from "@hashintel/petrinaut-core";

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
 * The net as DSL text in an editor under a toolbar. Clean, the text follows
 * the net and the lines of the selected entity are highlighted and scrolled
 * into view; edited, the diagnostics mark the text and Apply writes it back.
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
  revealed: DslRevealedLines;
  status: DslViewStatus;
  onChange: (text: string) => void;
  onApply: () => void;
  onDiscard: () => void;
}) => {
  const [copied, setCopied] = useState(false);

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
      <DslEditor
        value={text}
        onChange={onChange}
        diagnostics={diagnostics}
        revealed={revealed}
        readOnly={status.kind === "readOnly"}
        onSave={onApply}
      />
    </div>
  );
};
