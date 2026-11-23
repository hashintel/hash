import { Button } from "@hashintel/ds-components";

import { useIsReadOnly } from "../../../../../react/editing/use-is-read-only";
import { UI_MESSAGES } from "../../../../constants/ui-messages";

/**
 * The delete button in the header of a properties panel. `label` says what
 * it deletes, as its tooltip and its accessible name.
 */
export const DeleteItemButton: React.FC<{
  label: string;
  onDelete: () => void;
  size?: "xs" | "sm";
}> = ({ label, onDelete, size = "sm" }) => {
  const isReadOnly = useIsReadOnly();

  return (
    <Button
      aria-label={label}
      size={size}
      variant="ghost"
      tone="error"
      iconName="trash"
      onClick={onDelete}
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : label}
    />
  );
};
