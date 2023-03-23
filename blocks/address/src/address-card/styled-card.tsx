import { Card } from "@mui/material";
import { ReactNode } from "react";

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
      width: "min-content",
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
