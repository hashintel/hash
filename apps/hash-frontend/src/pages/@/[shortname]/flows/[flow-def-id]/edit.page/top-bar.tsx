import { Stack, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useState } from "react";

import {
  BreadCrumbs,
  Button,
  Chip,
  Dialog,
  EllipsisMenu,
} from "@hashintel/ds-components";

import { useSnackbar } from "../../../../../../components/hooks/use-snackbar";

import type { FlowSaveStatus } from "./use-autosaved-flow-editor";

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
        <Typography sx={{ fontSize: 14 }}>
          “{name}” will no longer be listed, and its schedules will be paused.
          Its past runs stay readable.
          {editsRefused &&
            " Its latest edits can't be saved, so they'll be dropped."}
        </Typography>
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

/**
 * The flow editor's top bar: back to the flows page, the flow's name, whether its edits are saved, and its menu.
 */
export const TopBar = ({
  name,
  saveStatus,
  editsRefused,
  onRetrySave,
  onArchive,
}: {
  name: string;
  saveStatus: FlowSaveStatus;
  /** Whether the API refused the latest edits. */
  editsRefused: boolean;
  onRetrySave: () => void;
  /** Archives the flow and leaves the editor. */
  onArchive: () => Promise<void>;
}) => {
  const router = useRouter();
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);

  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      gap={2}
      sx={{
        flexShrink: 0,
        height: 64,
        px: 2,
        borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
      }}
    >
      <Stack direction="row" alignItems="center" gap={1} sx={{ minWidth: 0 }}>
        {/* BreadCrumbs has no back button of its own yet (a design system gap logged in Notion), so it sits beside it. */}
        <Button
          variant="subtle"
          size="xs"
          iconName="arrowLeft"
          tooltip="Back to flows"
          onClick={() => {
            void router.push("/flows");
          }}
        />
        <BreadCrumbs>
          <BreadCrumbs.Item>{name}</BreadCrumbs.Item>
        </BreadCrumbs>
      </Stack>
      <Stack direction="row" alignItems="center" gap={1}>
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
      </Stack>
      {archiveDialogOpen && (
        <ArchiveFlowDialog
          name={name}
          onArchive={onArchive}
          onClose={() => setArchiveDialogOpen(false)}
          editsRefused={editsRefused}
        />
      )}
    </Stack>
  );
};
