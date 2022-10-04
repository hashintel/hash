import { experimental_sx, styled, Theme } from "@mui/material";
import { CirclePlusIcon } from "../../../shared/icons/svg";

export const StyledPlusCircleIcon = styled(CirclePlusIcon)(
  experimental_sx<Theme>({
    height: "12px",
  }),
);