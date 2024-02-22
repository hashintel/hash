import { Image } from "@local/hash-isomorphic-utils/system-types/image";
import { Box, Stack, SxProps, Theme } from "@mui/material";

const linkSxProperties: SxProps<Theme> = {
  cursor: "pointer",
  transition: ({ transitions }) => transitions.create("opacity"),
  "&:hover": {
    opacity: 0.9,
  },
};

export const Avatar = ({
  avatar,
  href,
  name,
  size = 32,
}: {
  avatar?: Image | null;
  href?: string;
  name: string;
  size?: number;
}) => {
  const commonSxProperties: SxProps<Theme> = {
    borderRadius: "50%",
    height: size,
    width: size,
  };

  if (avatar) {
    return (
      <Stack
        component={href ? "a" : "span"}
        justifyContent="center"
        href={href}
        sx={{
          ...(href ? linkSxProperties : {}),
        }}
        target={href ? "_blank" : undefined}
      >
        <Box
          component="img"
          src={
            avatar.properties[
              "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/"
            ]
          }
          alt={`${name}'s avatar`}
          sx={commonSxProperties}
        />
      </Stack>
    );
  }

  return (
    <Box
      component={href ? "a" : "span"}
      href={href}
      sx={({ palette }) => ({
        background: palette.blue[70],
        color: palette.common.white,
        fontSize: size * 0.55,
        fontWeight: 500,
        lineHeight: `${size}px`,
        textAlign: "center",
        textDecoration: "none",
        ...commonSxProperties,
        ...(href ? linkSxProperties : {}),
      })}
      target={href ? "_blank" : undefined}
    >
      {name[0]}
    </Box>
  );
};
