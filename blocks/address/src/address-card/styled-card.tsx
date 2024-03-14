import { Card } from "@mui/material";
import type { ReactNode } from "react";

export const StyledCard = ({
  children,
  isMobile,
}: {
  children: ReactNode;
  isMobile?: boolean;
}) => (
  <Card
    sx={({ palette }) => ({
      display: "flex",
      maxWidth: 800,
      width: 1,
      border: `1px solid ${palette.gray[20]}`,
      borderRadius: 2.5,
      boxShadow: "none",
      ...(isMobile
        ? {
            flexDirection: "column",
            width: 1,
          }
        : {}),
    })}
  >
    {children}
  </Card>
);
