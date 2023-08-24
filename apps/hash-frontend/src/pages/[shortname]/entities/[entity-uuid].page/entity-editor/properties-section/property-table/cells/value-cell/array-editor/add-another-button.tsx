import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";

import { Button } from "../../../../../../../../../../shared/ui";

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
