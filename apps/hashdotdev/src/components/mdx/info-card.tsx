import type { PaperProps } from "@mui/material";
import { Paper, Typography } from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";
import { Children, isValidElement } from "react";

export type InfoCardVariant = "info" | "warning";

type PaperVariant = "aqua" | "teal";

const mapInfoCardVariantToPaperVariant = (
  infoCardVariant: InfoCardVariant,
): PaperVariant => {
  if (infoCardVariant === "warning") {
    return "aqua";
  }
  return "teal";
};

type InfoCardProps = {
  variant?: "info" | "warning";
  title?: ReactNode;
  children?: ReactNode;
  sx?: PaperProps["sx"];
};

export const InfoCard: FunctionComponent<InfoCardProps> = ({
  variant = "info",
  title,
  children,
  sx = [],
}) => {
  const paperVariant = mapInfoCardVariantToPaperVariant(variant);

  const ensureChildIsWrappedInTypography = (
    child: ReactNode,
    index: number,
  ) => {
    return (
      <Typography
        key={index}
        sx={{
          marginTop: 1,
          color: ({ palette }) => palette[paperVariant][70],
          fontSize: 15,
          lineHeight: 1.5,
          "& a": ({ palette }) => ({
            color: palette[paperVariant][70],
            borderColor: palette[paperVariant][70],
            ":hover": {
              color: palette[paperVariant][80],
              borderColor: palette[paperVariant][80],
            },
            ":focus-visible": {
              outlineColor: palette[paperVariant][70],
            },
          }),
        }}
      >
        {isValidElement(child) ? child.props.children : child}
      </Typography>
    );
  };

  return (
    <Paper
      variant={paperVariant}
      sx={[
        {
          marginBottom: 3,
          padding: {
            xs: 2,
            sm: 3,
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Typography
        variant="hashLargeText"
        sx={{
          fontWeight: 600,
          color: ({ palette }) => palette[paperVariant][70],
          fontSize: 15,
        }}
      >
        {title}
      </Typography>
      {Children.toArray(children).map((child, index) =>
        ensureChildIsWrappedInTypography(child, index),
      )}
    </Paper>
  );
};
