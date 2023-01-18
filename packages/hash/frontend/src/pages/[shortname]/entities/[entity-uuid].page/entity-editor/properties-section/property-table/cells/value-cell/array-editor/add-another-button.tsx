import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { Button, FontAwesomeIcon } from "@local/design-system";

export const AddAnotherButton = ({
  onClick,
  title,
}: {
  onClick: () => void;
  title: string;
}) => {
  return (
    <Button
      onClick={onClick}
      size="small"
      variant="tertiary_quiet"
      fullWidth
      startIcon={<FontAwesomeIcon icon={faPlus} />}
      sx={{ justifyContent: "flex-start", borderRadius: 0 }}
    >
      {title}
    </Button>
  );
};
