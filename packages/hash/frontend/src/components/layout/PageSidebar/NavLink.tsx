import { FC } from "react";
import { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { Typography, Box } from "@mui/material";
import { FontAwesomeSvgIcon } from "../../icons";

type NavLinkProps = {
  icon: IconDefinition;
  title: string;
  to: string;
};

// @todo setup MUILInk
export const NavLink: FC<NavLinkProps> = ({ icon, title, to }) => {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        padding: "9px 18px",
        mx: 0.5,
        "&:hover": {
          backgroundColor: ({ palette }) => palette.gray[20],
        },
      }}
    >
      <FontAwesomeSvgIcon
        sx={{
          mr: 1.5,
          color: ({ palette }) => palette.gray[50],
        }}
        icon={icon}
      />
      <Typography
        variant="smallTextLabels"
        sx={{
          color: ({ palette }) => palette.gray[70],
        }}
      >
        {title}
      </Typography>
    </Box>
  );
};
