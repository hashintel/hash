import { useState } from "react";

import { Button, Dialog } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useSnackbar } from "../../../../../../../components/hooks/use-snackbar";

const dialogText = css({ textStyle: "sm" });

/** Asks to confirm archiving a flow, and archives it. Archiving that fails says why and leaves the dialog open. */
export const ArchiveFlowDialog = ({
  name,
  onArchive,
  onClose,
  editsRefused = false,
}: {
  name: string;
  onArchive: () => Promise<void>;
  onClose: () => void;
  /** Whether the API refused the flow's latest edits, which archiving drops. */
  editsRefused?: boolean;
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
