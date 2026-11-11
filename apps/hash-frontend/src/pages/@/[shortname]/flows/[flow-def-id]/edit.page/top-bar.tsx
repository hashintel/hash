import { useState } from "react";

import { Button, Chip, Dialog, EllipsisMenu } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useSnackbar } from "../../../../../../components/hooks/use-snackbar";
import { RenameInput } from "./shared/rename-input";
import { RunFlow } from "./top-bar/run-flow";

import type { FlowSaveStatus } from "./use-autosaved-flow-editor";
import type { FlowEditorState } from "@local/hash-isomorphic-utils/flows/flow-editor";
import type { FlowInputValues } from "@local/hash-isomorphic-utils/flows/types";

const topBar = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "4",
  flexShrink: "0",
  height: "16",
  px: "4",
  borderBottomWidth: "1px",
  borderBottomStyle: "solid",
  borderBottomColor: "bd.subtle",
});
const barGroup = css({ display: "flex", alignItems: "center", gap: "2" });
const titleGroup = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minWidth: "0",
});
const dialogText = css({ textStyle: "sm" });

const SaveStatus = ({
  status,
  onRetry,
}: {
  status: FlowSaveStatus;
  onRetry: () => void;
}) => {
  switch (status) {
    case "saving":
      return (
        <Chip size="xs" variant="ghost" prefix={{ loading: true }}>
          Saving…
        </Chip>
      );
    case "saved":
      return (
        <Chip size="xs" variant="ghost" prefix={{ iconName: "check" }}>
          Saved
        </Chip>
      );
    case "failed":
      return (
        <Chip
          size="xs"
          variant="ghost"
          color="red"
          prefix={{ iconName: "error" }}
          onClick={onRetry}
        >
          Couldn't save. Try again
        </Chip>
      );
  }
};

const ArchiveFlowDialog = ({
  name,
  onArchive,
  onClose,
  editsRefused,
}: {
  name: string;
  onArchive: () => Promise<void>;
  onClose: () => void;
  editsRefused: boolean;
}) => {
  const { triggerSnackbar } = useSnackbar();
  const [archiving, setArchiving] = useState(false);

  const archive = async () => {
    setArchiving(true);

    try {
      await onArchive();
    } catch (error) {
      triggerSnackbar.error(`Couldn't archive the flow: ${String(error)}`);
      setArchiving(false);
    }
  };

  return (
    <Dialog
      size="xs"
      onClose={onClose}
      shouldCloseOn={archiving ? "none" : "closeButtonAndOverlay"}
    >
      <Dialog.Header title="Archive flow" />
      <Dialog.Body>
        <p className={dialogText}>
          “{name}” will no longer be listed, and its schedules will be paused.
          Its past runs stay readable.
          {editsRefused &&
            " Its latest edits can't be saved, so they'll be dropped."}
        </p>
      </Dialog.Body>
      <Dialog.Footer
        actions={
          <>
            <Button variant="subtle" disabled={archiving} onClick={onClose}>
              Cancel
            </Button>
            <Button
              tone="error"
              loading={archiving}
              onClick={() => {
                void archive();
              }}
            >
              Archive flow
            </Button>
          </>
        }
      />
    </Dialog>
  );
};

const LeaveFlowDialog = ({
  onLeave,
  onClose,
}: {
  onLeave: () => void;
  onClose: () => void;
}) => (
  <Dialog size="xs" onClose={onClose}>
    <Dialog.Header title="Leave without saving?" />
    <Dialog.Body>
      <p className={dialogText}>
        Your latest edits couldn't be saved, so they'll be lost.
      </p>
    </Dialog.Body>
    <Dialog.Footer
      actions={
        <>
          <Button variant="subtle" onClick={onClose}>
            Stay
          </Button>
          <Button tone="error" onClick={onLeave}>
            Leave
          </Button>
        </>
      }
    />
  </Dialog>
);

/**
 * The flow editor's top bar: back to the flows page, the flow's name, whether its edits are saved, Run, and its menu.
 */
export const TopBar = ({
  editorKey,
  editorState,
  onRename,
  saveStatus,
  saveRefusedReason,
  onRetrySave,
  onRun,
  onArchive,
  onLeave,
  onLeaveWithoutSaving,
}: {
  /**
   * Changes when the flow is reloaded after changing elsewhere, closing a run form filled in for the flow as it was.
   * The rest of the bar keeps its state, e.g. the leave confirmation for a leave that the reload interrupted.
   */
  editorKey: number;
  editorState: FlowEditorState;
  onRename: (name: string) => void;
  saveStatus: FlowSaveStatus;
  /** Why the API refused the latest edits, if it did. */
  saveRefusedReason: string | null;
  onRetrySave: () => void;
  /**
   * Saves any edits not saved yet, then starts a run with these inputs and opens it. Throws, saying why, if the edits
   * couldn't be saved or the run didn't start.
   */
  onRun: (flowInputs: FlowInputValues) => Promise<void>;
  /** Archives the flow and leaves the editor. */
  onArchive: () => Promise<void>;
  /**
   * Saves any edits not saved yet, then leaves the editor for the flows page. Resolves to whether it left, which it
   * doesn't if the edits couldn't be saved.
   */
  onLeave: () => Promise<boolean>;
  /** Leaves the editor for the flows page, dropping any edits not saved yet. */
  onLeaveWithoutSaving: () => void;
}) => {
  const { name } = editorState.flowDefinition;
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const leave = async () => {
    if (saveStatus === "failed") {
      setLeaveDialogOpen(true);
      return;
    }

    setLeaving(true);

    if (!(await onLeave())) {
      setLeaving(false);
      setLeaveDialogOpen(true);
    }
  };

  return (
    <div className={topBar}>
      <div className={titleGroup}>
        <Button
          variant="subtle"
          size="xs"
          iconName="arrowLeft"
          tooltip="Back to flows"
          loading={leaving}
          onClick={() => {
            void leave();
          }}
        />
        <RenameInput
          value={name}
          placeholder="Untitled flow"
          ariaLabel="Flow name"
          onRename={onRename}
        />
      </div>
      <div className={barGroup}>
        <SaveStatus status={saveStatus} onRetry={onRetrySave} />
        <RunFlow
          key={editorKey}
          editorState={editorState}
          saveRefusedReason={saveRefusedReason}
          onRun={onRun}
        />
        <EllipsisMenu
          iconName="ellipsisVertical"
          size="md"
          items={[
            {
              id: "archive",
              text: "Archive",
              tone: "error",
              onClick: () => setArchiveDialogOpen(true),
            },
          ]}
        />
      </div>
      {archiveDialogOpen && (
        <ArchiveFlowDialog
          name={name}
          onArchive={onArchive}
          onClose={() => setArchiveDialogOpen(false)}
          editsRefused={saveRefusedReason !== null}
        />
      )}
      {leaveDialogOpen && (
        <LeaveFlowDialog
          onLeave={onLeaveWithoutSaving}
          onClose={() => setLeaveDialogOpen(false)}
        />
      )}
    </div>
  );
};
