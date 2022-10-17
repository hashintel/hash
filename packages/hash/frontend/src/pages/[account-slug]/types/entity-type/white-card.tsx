import {
  Card,
  CardActionArea,
  cardActionAreaClasses,
  CardActionAreaProps,
  CardContent,
  CardContentProps,
} from "@mui/material";

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
      {onClick || href ? (
        <CardActionArea
          {...(onClick ? { onClick } : { href })}
          disableRipple
          disableTouchRipple
          sx={{
            [`&:hover .${cardActionAreaClasses.focusHighlight}`]: {
              opacity: 0,
            },
          }}
        >
          {cardContent}
        </CardActionArea>
      ) : (
        cardContent
      )}
    </Card>
  );
};
