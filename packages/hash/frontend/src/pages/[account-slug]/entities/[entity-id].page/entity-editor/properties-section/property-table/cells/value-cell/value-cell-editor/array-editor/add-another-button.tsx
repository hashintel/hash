import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { Button, FontAwesomeIcon } from "@hashintel/hash-design-system";

export const AddAnotherButton = ({ onClick }: { onClick: () => void }) => {
  return (
    <Button
      onClick={onClick}
      size="small"
      variant="tertiary_quiet"
      fullWidth
      startIcon={<FontAwesomeIcon icon={faPlus} />}
      sx={{ justifyContent: "flex-start" }}
    >
      Add Another Value
    </Button>
  );
};
