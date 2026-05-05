import type { SvgIconProps } from "@mui/material";
import { Box, Typography } from "@mui/material";
import type { LoginFlow, RegistrationFlow } from "@ory/client";
import { isUiNodeInputAttributes } from "@ory/integrations/ui";
import type { AxiosError } from "axios";
import type { FunctionComponent } from "react";

import { AppleIcon } from "../../shared/icons/apple-icon";
import { GitHubIcon } from "../../shared/icons/github-icon";
import { GitLabIcon } from "../../shared/icons/gitlab-icon";
import { GoogleIcon } from "../../shared/icons/google-icon";
import { MicrosoftIcon } from "../../shared/icons/microsoft-icon";
import { Button } from "../../shared/ui";
import { providerDisplayNames } from "./format-kratos-message";
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

type SsoFlow =
  | { kind: "login"; flow: LoginFlow }
  | { kind: "registration"; flow: RegistrationFlow };

export const SsoProviderButtons: FunctionComponent<
  SsoFlow & { onFlowError: FlowErrorHandler }
> = ({ kind, flow, onFlowError }) => {
  const oidcNodes = flow.ui.nodes.filter(({ group }) => group === "oidc");

  if (oidcNodes.length === 0) {
    return null;
  }

  const handleProviderClick = (provider: string) => {
    const csrf_token = mustGetCsrfTokenFromFlow(flow);
    const updateFlow =
      kind === "login"
        ? oryKratosClient.updateLoginFlow({
            flow: flow.id,
            updateLoginFlowBody: { method: "oidc", provider, csrf_token },
          })
        : oryKratosClient.updateRegistrationFlow({
            flow: flow.id,
            updateRegistrationFlowBody: {
              method: "oidc",
              provider,
              csrf_token,
            },
          });

    void updateFlow
      .catch((err: AxiosError) => {
        const data = err.response?.data as
          | { redirect_browser_to?: string }
          | undefined;
        if (err.response?.status === 422 && data?.redirect_browser_to) {
          window.location.href = data.redirect_browser_to;
          return;
        }
        return onFlowError(err);
      })
      .catch(() => {
        // onFlowError already handles navigation/state — swallow any
        // rejection so it doesn't surface as an unhandled promise.
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
        {kind === "login"
          ? "If you use SSO, or have previously linked your account to another service, sign in with them below"
          : "Or sign up with"}
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
          const providerName = providerDisplayNames[providerId] ?? providerId;
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
