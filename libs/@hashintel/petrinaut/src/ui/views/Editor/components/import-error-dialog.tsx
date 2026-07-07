import { Button, Dialog } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

const errorTextStyle = css({
  fontSize: "sm",
  color: "neutral.s90",
  lineHeight: "[1.5]",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

export const ImportErrorDialog = ({
  open,
  onOpenChange,
  errorMessage,
  onCreateEmpty,
}: {
  open: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  errorMessage: string;
  onCreateEmpty: () => void;
}) => {
  if (!open) {
    return null;
  }

  const close = () => onOpenChange({ open: false });

  return (
    <Dialog onClose={close} size="sm">
      <Dialog.Header
        title="Import Error"
        description="The selected file could not be imported."
      />
      <Dialog.Body>
        <p className={errorTextStyle}>{errorMessage}</p>
      </Dialog.Body>
      <Dialog.Footer
        actions={
          <>
            <Button variant="subtle" tone="neutral" onClick={close}>
              Close
            </Button>
            <Button
              variant="solid"
              tone="neutral"
              onClick={() => {
                onCreateEmpty();
                close();
              }}
            >
              Create empty net
            </Button>
          </>
        }
      />
    </Dialog>
  );
};
