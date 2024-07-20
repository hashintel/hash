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
      fullWidth
      size={"small"}
      variant={"tertiary_quiet"}
      startIcon={<FontAwesomeIcon icon={faPlus} />}
      sx={{ justifyContent: "flex-start", borderRadius: 0 }}
      onClick={onClick}
    >
      {title}
    </Button>
  );
};
