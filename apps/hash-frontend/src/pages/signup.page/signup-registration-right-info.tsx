import {
  faCheck,
  faCircleInfo,
  // faEnvelope,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { Box, Typography } from "@mui/material";
import { FunctionComponent, ReactNode } from "react";

import { PizzaSolidIcon } from "../../shared/icons/pizza-solid-icon";

const infoItems: { title: string; description: string; icon: ReactNode }[] = [
  /** @todo: add this info item when email verification is supported */
  // {
  //   title: "Skip email verification",
  //   description: "Sign-up with Google or Apple",
  //   icon: <FontAwesomeIcon icon={faEnvelope} />,
  // },
  {
    // title: "Or sign up with email",
    title: "Sign up with email",
    description: "You’ll be done in seconds",
    icon: <FontAwesomeIcon icon={faCheck} />,
  },
  {
    title: "Reserve your username",
    description: "@pizza goes fast!",
    icon: <PizzaSolidIcon />,
  },
  {
    title: "Use your personal email",
    description:
      "Sign up with your home email address to stay in control, and add a work or school email address later",
    icon: <FontAwesomeIcon icon={faCircleInfo} />,
  },
];

export const SignupRegistrationRightInfo: FunctionComponent = () => {
  return (
    <Box
      sx={{
        borderRadius: "8px",
        background: "#001F41",
        paddingY: 4.5,
        paddingX: 5.25,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {infoItems.map(({ title, description, icon }) => (
        <Box
          key={title}
          sx={{
            display: "flex",
          }}
        >
          <Box
            sx={{
              marginTop: 1,
              display: "flex",
              flexShrink: 0,
              width: 50,
              svg: {
                fontSize: 20,
                color: ({ palette }) => palette.blue[70],
              },
            }}
          >
            {icon}
          </Box>
          <Box>
            <Typography
              sx={{
                color: ({ palette }) => palette.common.white,
                fontSize: 16,
                lineHeight: "130%",
              }}
            >
              {title}
            </Typography>
            <Typography
              sx={{
                color: ({ palette }) => palette.blue[40],
                fontSize: 14,
                lineHeight: "130%",
              }}
            >
              {description}
            </Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );
};
