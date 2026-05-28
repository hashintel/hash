import { XMarkRegularIcon } from "@hashintel/design-system";

import { Button } from "../../../../shared/ui";

import type { FunctionComponent } from "react";

type ClearFiltersButtonProps = {
  onClear: () => void;
};

export const ClearFiltersButton: FunctionComponent<ClearFiltersButtonProps> = ({
  onClear,
}) => (
  <Button
    variant="tertiary_quiet"
    size="xs"
    onClick={onClear}
    startIcon={<XMarkRegularIcon />}
    sx={{ background: "transparent" }}
  >
    Clear
  </Button>
);
