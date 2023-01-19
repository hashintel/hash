import { Box } from "@mui/material";
import { FunctionComponent, ReactNode } from "react";

import bgPattern from "../../assets/images/auth-bg-pattern.png";
import { HashIcon, LogoIcon } from "../../shared/icons";

export type AuthLayoutProps = {
  children: ReactNode;
  onClose?: () => void;
  showTopLogo?: boolean;
  loading?: boolean;
};

export const AuthLayout: FunctionComponent<AuthLayoutProps> = ({
  children,
  onClose,
  showTopLogo,
  loading,
}) => {
  if (loading) {
    return (
      <div
        style={{
          alignItems: "center",
          bottom: "0",
          display: "flex",
          justifyContent: "center",
          left: "0",
          position: "fixed",
          right: "0",
          top: "0",
          zIndex: "10",
        }}
      >
        <HashIcon
          style={{ marginLeft: "0.25rem", width: "12rem", height: "12rem" }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: "#ffffff",
        bottom: "0",
        left: "0",
        position: "fixed",
        right: "0",
        top: "0",
      }}
    >
      <div
        style={{
          borderWidth: "4px",
          height: "100vh",
          overflowY: "scroll",
          position: "relative",
          zIndex: "10",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            paddingBottom: "2.5rem",
            paddingTop: "2.5rem",
            visibility: showTopLogo ? undefined : "hidden",
          }}
        >
          <LogoIcon />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            paddingBottom: "2.5rem",
            paddingTop: "6rem",
          }}
        >
          {children}
        </div>
      </div>

      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0 }}>
        <img alt="" src={bgPattern.src} style={{ height: "100vh" }} />
      </div>
      {onClose && (
        <Box
          component="button"
          type="button"
          sx={{
            alignItems: "center",
            borderRadius: "9999px",
            display: "flex",
            fontSize: "1.875rem",
            height: "3rem",
            justifyContent: "center",
            lineHeight: 1,
            position: "absolute",
            right: "2rem",
            top: "2rem",
            width: "3rem",
            zIndex: "10",

            "&:hover, &:focus": {
              backgroundColor: "black",
              opacity: 0.1,
              outline: "none",
            },
          }}
          onClick={onClose}
        >
          &times;
        </Box>
      )}
    </div>
  );
};
