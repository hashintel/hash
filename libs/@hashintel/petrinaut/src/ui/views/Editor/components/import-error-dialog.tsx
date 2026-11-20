import { Banner, Button, Dialog } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

const errorMessageStyle = css({
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

export const ImportErrorDialog = ({
  message,
  onClose,
  onCreateEmpty,
}: {
  message: string;
  onClose: () => void;
  onCreateEmpty: () => void;
}) => (
  <Dialog onClose={onClose} size="sm">
    <Dialog.Header
      title="Import Error"
      description="The selected file could not be imported."
    />
    <Dialog.Body>
      <Banner tone="error" icon={false}>
        <Banner.Description className={errorMessageStyle}>
          {message}
        </Banner.Description>
      </Banner>
    </Dialog.Body>
    <Dialog.Footer
      actions={
        <>
          <Button variant="subtle" tone="neutral" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="solid"
            tone="neutral"
            onClick={() => {
              onCreateEmpty();
              onClose();
            }}
          >
            Create empty net
          </Button>
        </>
      }
    />
  </Dialog>
);
