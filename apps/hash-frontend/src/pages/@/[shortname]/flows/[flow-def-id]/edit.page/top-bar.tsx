import { useRef, useState } from "react";

import {
  Button,
  Chip,
  Dialog,
  EllipsisMenu,
  TextInput,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useSnackbar } from "../../../../../../components/hooks/use-snackbar";

import type { FlowSaveStatus } from "./use-autosaved-flow-editor";

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
const flowName = css({ fontWeight: "medium", minWidth: "0" });
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

/**
 * The flow's name, editable when clicked. Escape, or leaving it blank or unchanged, keeps the name the flow has, which
 * a reload after a conflict may have changed meanwhile.
 */
const FlowName = ({
  name,
  onRename,
}: {
  name: string;
  onRename: (name: string) => void;
}) => {
  const [editing, setEditing] = useState<{
    from: string;
    typed: string;
  } | null>(null);
  const cancelledRef = useRef(false);

  return (
    <TextInput
      variant="subtle"
      size="sm"
      width="fitContent"
      showEditIcon
      aria-label="Flow name"
      placeholder="Untitled flow"
      className={flowName}
      value={editing?.typed ?? name}
      onFocus={() => setEditing({ from: name, typed: name })}
      onChange={(typed) =>
        setEditing((current) => current && { ...current, typed })
      }
      onKeyDown={(event) => {
        if (
          (event.key !== "Enter" && event.key !== "Escape") ||
          event.nativeEvent.isComposing
        ) {
          return;
        }

        cancelledRef.current = event.key === "Escape";

        if (event.currentTarget instanceof HTMLElement) {
          event.currentTarget.blur();
        }
      }}
      onBlur={() => {
        const renamed = editing?.typed.trim();

        if (!cancelledRef.current && renamed && renamed !== editing?.from) {
          onRename(renamed);
        }

        cancelledRef.current = false;
        setEditing(null);
      }}
    />
  );
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
 * The flow editor's top bar: back to the flows page, the flow's name, whether its edits are saved, and its menu.
 */
export const TopBar = ({
  name,
  onRename,
  saveStatus,
  editsRefused,
  onRetrySave,
  onArchive,
  onLeave,
  onLeaveWithoutSaving,
}: {
  name: string;
  onRename: (name: string) => void;
  saveStatus: FlowSaveStatus;
  /** Whether the API refused the latest edits. */
  editsRefused: boolean;
  onRetrySave: () => void;
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
        <FlowName name={name} onRename={onRename} />
      </div>
      <div className={barGroup}>
        <SaveStatus status={saveStatus} onRetry={onRetrySave} />
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
          editsRefused={editsRefused}
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
