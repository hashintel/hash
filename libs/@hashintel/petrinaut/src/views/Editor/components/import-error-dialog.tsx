import { css } from "@hashintel/ds-helpers/css";

import { Button } from "../../../components/button";
import { Dialog, type DialogRootProps } from "../../../components/dialog";

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
  onOpenChange: DialogRootProps["onOpenChange"];
  errorMessage: string;
  onCreateEmpty: () => void;
}) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Content>
      <Dialog.Card>
        <Dialog.Header description="The selected file could not be imported.">
          Import Error
        </Dialog.Header>
        <Dialog.Body>
          <p className={errorTextStyle}>{errorMessage}</p>
        </Dialog.Body>
      </Dialog.Card>
      <Dialog.Footer>
        <Dialog.CloseTrigger asChild>
          <Button variant="subtle" tone="neutral" onClick={() => {}}>
            Close
          </Button>
        </Dialog.CloseTrigger>
        <Dialog.CloseTrigger asChild>
          <Button variant="solid" tone="neutral" onClick={onCreateEmpty}>
            Create empty net
          </Button>
        </Dialog.CloseTrigger>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
);
