import type { SvgIconProps } from "@mui/material";
import { Box, Typography } from "@mui/material";
import type { LoginFlow } from "@ory/client";
import { isUiNodeInputAttributes } from "@ory/integrations/ui";
import type { AxiosError } from "axios";
import type { FunctionComponent } from "react";

import { AppleIcon } from "../../shared/icons/apple-icon";
import { GitHubIcon } from "../../shared/icons/github-icon";
import { GitLabIcon } from "../../shared/icons/gitlab-icon";
import { GoogleIcon } from "../../shared/icons/google-icon";
import { MicrosoftIcon } from "../../shared/icons/microsoft-icon";
import { Button } from "../../shared/ui";
import { mustGetCsrfTokenFromFlow, oryKratosClient } from "./ory-kratos";

const providerIcons: Record<string, FunctionComponent<SvgIconProps>> = {
  google: GoogleIcon,
  apple: AppleIcon,
  microsoft: MicrosoftIcon,
  github: GitHubIcon,
  gitlab: GitLabIcon,
};

const ssoButtonSx = {
  borderRadius: 2,
  border: "1px solid",
  borderColor: "gray.30",
  color: "gray.90",
  fontWeight: 500,
  px: 2,
  py: 1,
  minWidth: 0,
  "& .MuiButton-startIcon": {
    display: "flex",
    alignItems: "center",
  },
  "&:hover": {
    borderColor: "gray.50",
    background: "gray.10",
  },
} as const;

type FlowErrorHandler = (err: AxiosError) => void | Promise<void>;

export const SsoProviderButtons: FunctionComponent<{
  flow: LoginFlow;
  onFlowError: FlowErrorHandler;
}> = ({ flow, onFlowError }) => {
  const oidcNodes = flow.ui.nodes.filter(({ group }) => group === "oidc");

  if (oidcNodes.length === 0) {
    return null;
  }

  const handleProviderClick = (provider: string) => {
    const csrf_token = mustGetCsrfTokenFromFlow(flow);
    oryKratosClient
      .updateLoginFlow({
        flow: flow.id,
        updateLoginFlowBody: {
          method: "oidc",
          provider,
          csrf_token,
        },
      })
      .catch((err: AxiosError) => {
        const data = err.response?.data as
          | { redirect_browser_to?: string }
          | undefined;
        if (err.response?.status === 422 && data?.redirect_browser_to) {
          window.location.href = data.redirect_browser_to;
          return;
        }
        onFlowError(err);
      })
      .catch(() => {
        // Swallow unhandled rejections from onFlowError (which may
        // return Promise.reject for unrecognized errors)
      });
  };

  return (
    <Box sx={{ mt: 4, maxWidth: 350 }}>
      <Typography
        sx={{
          color: "gray.70",
          fontSize: 14,
          mb: 2,
        }}
      >
        If you use SSO, or have previously linked your account to another
        service, sign in with them below
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1,
        }}
      >
        {oidcNodes.map((node) => {
          const attrs = node.attributes;
          if (!isUiNodeInputAttributes(attrs)) {
            return null;
          }
          const providerId = attrs.value as string;
          const providerName =
            providerId.charAt(0).toUpperCase() + providerId.slice(1);
          const Icon = providerIcons[providerId];
          return (
            <Button
              key={providerId}
              type="button"
              variant="tertiary"
              size="small"
              sx={ssoButtonSx}
              startIcon={
                Icon ? <Icon sx={{ width: 20, height: 20 }} /> : undefined
              }
              onClick={() => handleProviderClick(providerId)}
            >
              {providerName}
            </Button>
          );
        })}
      </Box>
    </Box>
  );
};
