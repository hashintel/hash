import { HashInlineIcon } from "@hashintel/design-system";

import { Button } from "../../../../../../../../../shared/ui";

const faPlus = { icon: "plus" } as const;

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
      startIcon={<HashInlineIcon icon={faPlus} />}
      sx={{
        justifyContent: "flex-start",
        borderRadius: 0,
        fontSize: 13,
        color: ({ palette }) => palette.gray[60],
      }}
    >
      {title}
    </Button>
  );
};
