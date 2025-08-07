import type { BaseUrl, Entity } from "@blockprotocol/type-system";
import { AsteriskRegularIcon, LinkTypeIcon } from "@hashintel/design-system";
import type { SxProps, Theme } from "@mui/material";
import { Box, Typography } from "@mui/material";
import type { ReactElement } from "react";

export const EntityOrTypeIcon = ({
  entity,
  fill,
  fontSize,
  icon,
  isLink,
  sx,
}: {
  entity: Entity | null;
  fill?: string | ((theme: Theme) => string);
  fontSize: number;
  icon?: string | ReactElement | null;
  isLink: boolean;
  sx?: SxProps<Theme>;
}) => {
  if (!icon) {
    if (isLink) {
      return (
        <LinkTypeIcon
          sx={[
            { stroke: fill ?? "inherit", fontSize },
            ...(Array.isArray(sx) ? sx : [sx]),
          ]}
        />
      );
    }
    return (
      <AsteriskRegularIcon
        sx={[
          { fill: fill ?? "inherit", fontSize },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      />
    );
  }

  /**
   * @todo H-1978 remove hardcoded ReactElement overrides when system types have icons assigned to schema
   */
  if (typeof icon !== "string") {
    return icon;
  }

  if (
    icon.startsWith("http://") ||
    icon.startsWith("https://") ||
    icon.startsWith("/")
  ) {
    const iconUrl = icon.startsWith("/")
      ? new URL(icon, window.location.origin).href
      : icon;

    return (
      <Box
        sx={[
          {
            backgroundColor: fill ?? "inherit",
            webkitMask: `url(${iconUrl}) no-repeat center / contain`,
            mask: `url(${iconUrl}) no-repeat center / contain`,
            width: fontSize,
            height: fontSize,
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      />
    );
  }

  /**
   * Pages at least can have an emoji set for the 'icon' property, overriding the type's icon
   */
  const emojiIcon =
    (entity?.properties[
      "https://hash.ai/@h/types/property-type/icon/" as BaseUrl
    ] as string | undefined) ?? icon;

  return (
    <Typography
      fontSize={fontSize}
      sx={[{ lineHeight: 1 }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {emojiIcon}
    </Typography>
  );
};
