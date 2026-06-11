import {
  faCheck,
  // faEnvelope,
} from "@fortawesome/free-solid-svg-icons";
import { Box, Typography } from "@mui/material";

import { FontAwesomeIcon } from "@hashintel/design-system";

import { PizzaSolidIcon } from "../../shared/icons/pizza-solid-icon";

import type { FunctionComponent, ReactNode } from "react";

const infoItems: {
  title: string;
  description: React.ReactNode;
  icon: ReactNode;
}[] = [
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
    description: (
      <>
        <code>@pizza</code> goes fast!
      </>
    ),
    icon: <PizzaSolidIcon />,
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
                code: {
                  fontFamily:
                    'Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  fontSize: "0.85em",
                  color: ({ palette }) => palette.blue[25],
                  background: "rgba(255, 255, 255, 0.1)",
                  borderRadius: "4px",
                  paddingX: 0.75,
                  paddingY: 0.25,
                },
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
