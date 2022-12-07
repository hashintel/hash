import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { Button, FontAwesomeIcon } from "@hashintel/hash-design-system";

export const AddAnotherButton = ({
  onClick,
  title,
  disabled,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
}) => {
  return (
    <Button
      onClick={onClick}
      size="small"
      variant="tertiary_quiet"
      fullWidth
      startIcon={<FontAwesomeIcon icon={faPlus} />}
      sx={{ justifyContent: "flex-start", borderRadius: 0 }}
      disabled={disabled}
    >
      {title}
    </Button>
  );
};
