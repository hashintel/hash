import { useState } from "react";

import { Banner, Button, Dialog } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

const dialogBody = css({ display: "flex", flexDirection: "column", gap: "3" });
const dialogText = css({ textStyle: "sm" });

/**
 * Asks to confirm deleting a trigger, and deletes it. Deleting can't be undone, but the runs it started stay readable.
 * Deleting that fails says why and leaves the dialog open.
 */
export const DeleteTriggerDialog = ({
  text,
  onDelete,
  onClose,
}: {
  /** The trigger's name, or else when it runs. */
  text: string;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) => {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteTrigger = async () => {
    setDeleting(true);
    setError(null);

    try {
      await onDelete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setDeleting(false);
    }
  };

  return (
    <Dialog
      size="xs"
      onClose={onClose}
      shouldCloseOn={deleting ? "none" : "closeButtonAndOverlay"}
    >
      <Dialog.Header title="Delete this trigger?" />
      <Dialog.Body>
        <div className={dialogBody}>
          <p className={dialogText}>
            “{text}” stops running. Its past runs stay readable.
          </p>
          {error !== null && (
            <Banner tone="error">
              <Banner.Title>The trigger wasn't deleted</Banner.Title>
              <Banner.Description>{error}</Banner.Description>
            </Banner>
          )}
        </div>
      </Dialog.Body>
      <Dialog.Footer
        actions={
          <>
            <Button variant="subtle" disabled={deleting} onClick={onClose}>
              Cancel
            </Button>
            <Button
              loading={deleting}
              onClick={() => {
                void deleteTrigger();
              }}
            >
              Delete
            </Button>
          </>
        }
      />
    </Dialog>
  );
};
