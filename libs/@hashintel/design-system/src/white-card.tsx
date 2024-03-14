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
      {/**
       * @todo: refactor this to use `next/link` when a relative URL is passed
       * into as the `href`, to avoid a flashing white screen when the user
       * clicks on the entity's type.
       *
       * @see https://app.asana.com/0/1203179076056209/1203468350364504/f
       */}
      {onClick ?? href ? (
        <CardActionArea
          {...(onClick ? { onClick } : { href })}
          LinkComponent={LinkComponent}
          disableRipple
          disableTouchRipple
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
