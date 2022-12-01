import {
  Card,
  CardActionArea,
  cardActionAreaClasses,
  CardActionAreaProps,
  CardContent,
  CardContentProps,
} from "@mui/material";
import { FunctionComponent, ReactNode } from "react";
import { Link } from "../../../shared/ui/link";

const WhiteCardActionArea: FunctionComponent<
  { children: ReactNode } & CardActionAreaProps
> = ({ children, ...props }) => (
  <CardActionArea
    {...props}
    disableRipple
    disableTouchRipple
    sx={[
      {
        [`&:hover .${cardActionAreaClasses.focusHighlight}`]: {
          opacity: 0,
        },
      },
      ...(Array.isArray(props.sx) ? props.sx : [props.sx]),
    ]}
  >
    {children}
  </CardActionArea>
);

export const WhiteCard = ({
  onClick,
  href,
  children,
}: {
  onClick?: CardActionAreaProps["onClick"];
  href?: string;
  children: CardContentProps["children"];
}) => {
  const cardContent = (
    <CardContent
      sx={{
        p: "0 !important",
        background: "white",
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
          overflow: "visible",
        }),
        onClick
          ? (theme) => ({
              "&:hover": {
                boxShadow: theme.boxShadows.md,
              },
            })
          : {},
      ]}
    >
      {onClick ? (
        <WhiteCardActionArea onClick={onClick}>
          {cardContent}
        </WhiteCardActionArea>
      ) : href ? (
        <Link href={href} sx={{ textDecoration: "none" }}>
          <WhiteCardActionArea>{cardContent}</WhiteCardActionArea>
        </Link>
      ) : (
        cardContent
      )}
    </Card>
  );
};
