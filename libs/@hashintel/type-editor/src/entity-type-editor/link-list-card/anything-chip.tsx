import { Chip } from "@hashintel/design-system";

import { TypeChipLabel } from "./type-chip-label";

export const AnythingChip = () => (
  <Chip
    color="blue"
    variant="outlined"
    label={<TypeChipLabel>Anything</TypeChipLabel>}
  />
);
