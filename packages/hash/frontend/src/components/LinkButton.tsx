// eslint-disable-next-line no-restricted-imports
import { Box, Button, ButtonProps } from "@mui/material";
import Link, { LinkProps } from "next/link";
import { VoidFunctionComponent } from "react";

type LinkButtonProps = ButtonProps &
  LinkProps & {
    noLinkStyle?: boolean;
  };

export const LinkButton: VoidFunctionComponent<LinkButtonProps> = ({
  href,
  noLinkStyle,
  ...rest
}) => {
  return (
    <Link href={href} passHref>
      <Box
        component="a"
        sx={{ ":hover": { borderBottom: noLinkStyle ? "0px" : "unset" } }}
      >
        <Button {...rest} />
      </Box>
    </Link>
  );
};
