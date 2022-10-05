import { faQuestionCircle } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { experimental_sx as sx, styled, Theme } from "@mui/material";
import { ComponentProps } from "react";

export const QuestionIcon = styled(
  (props: Omit<ComponentProps<typeof FontAwesomeIcon>, "icon">) => (
    <FontAwesomeIcon {...props} icon={faQuestionCircle} />
  ),
)(
  sx<Theme>((theme) => ({
    color: theme.palette.gray[40],
  })),
);
