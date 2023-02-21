import { styled } from "@mui/material";

import { CirclePlusIcon } from "../../../shared/icons/svg";

export const StyledPlusCircleIcon = styled(CirclePlusIcon)(({ theme }) =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- this file being deleted in https://github.com/hashintel/hash/pull/2035
  theme.unstable_sx({
    height: "12px",
  }),
);
