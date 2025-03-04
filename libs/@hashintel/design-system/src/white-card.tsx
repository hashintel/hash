import type {
  CardActionAreaProps,
  CardContentProps,
  SxProps,
  Theme,
} from "@mui/material";
import {
  Card,
  CardActionArea,
  cardActionAreaClasses,
  CardContent,
} from "@mui/material";
import type { ElementType } from "react";

export const WhiteCard = ({
  onClick,
  onMouseEnter,
  onMouseLeave,
  href,
  LinkComponent,
  children,
  actionSx = [],
  sx = [],
}: {
  onClick?: CardActionAreaProps["onClick"];
  onMouseEnter?: CardActionAreaProps["onMouseEnter"];
  onMouseLeave?: CardActionAreaProps["onMouseLeave"];
  href?: string;
  LinkComponent?: ElementType;
  children: CardContentProps["children"];
  actionSx?: SxProps<Theme>;
  sx?: SxProps<Theme>;
}) => {
  const cardContent = (
    <CardContent
      sx={{
        p: "0 !important",
      }}
    >
      {children}
    </CardContent>
  );

  return (
    <Card
      sx={[
        (theme) => ({
          boxShadow: theme.boxShadows.xs,
          overflow: "hidden",
          borderRadius: 1.5,
        }),
        onClick
          ? (theme) => ({
              "&:hover": {
                boxShadow: theme.boxShadows.md,
              },
            })
          : {},
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {(onClick ?? href) ? (
        <CardActionArea
          {...(href ? { href } : {})}
          LinkComponent={LinkComponent}
          disableRipple
          disableTouchRipple
          onClick={onClick}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          sx={[
            {
              [`&:hover .${cardActionAreaClasses.focusHighlight}`]: {
                opacity: 0,
              },
            },
            ...(Array.isArray(actionSx) ? actionSx : [actionSx]),
          ]}
        >
          {cardContent}
        </CardActionArea>
      ) : (
        cardContent
      )}
    </Card>
  );
};
