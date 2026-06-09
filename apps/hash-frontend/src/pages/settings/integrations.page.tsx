import { Box, Paper, Stack, Typography } from "@mui/material";
import DOMPurify from "dompurify";
import { useContext, useMemo } from "react";

import {
  allIntegrations,
  type Integration,
  type IntegrationIcon,
  integrationIcons,
} from "@hashintel/integrations-catalog";
import { apiOrigin } from "@local/hash-isomorphic-utils/environment";

import { useHashInstance } from "../../components/hooks/use-hash-instance";
import { extractWebId } from "../../lib/user-and-org";
import { Button } from "../../shared/ui/button";
import { getSettingsLayout } from "../shared/settings-layout";
import { WorkspaceContext } from "../shared/workspace-context";
import { UserConnectedIntegrations } from "./integrations/user-connected-integrations";
import { SettingsPageContainer } from "./shared/settings-page-container";

import type { EnabledIntegrations } from "../../graphql/api-types.gen";
import type { NextPageWithLayout } from "../../shared/layout";
import type { FunctionComponent, ReactNode } from "react";

const IntegrationIconTile = ({
  iconDetail,
  tileSize = 44,
}: {
  iconDetail: IntegrationIcon;
  tileSize?: number;
}) => {
  const {
    dark: Icon,
    iconToContainerRatio = 2,
    horizontalAlignment,
  } = iconDetail;

  return (
    <Stack
      sx={({ palette }) => ({
        alignItems: horizontalAlignment,
        justifyContent: "center",
        flexShrink: 0,
        height: tileSize,
        width: tileSize,
        borderRadius: 1.5,
        backgroundColor: "#1b242d",
        border: `1px solid ${palette.gray[90]}`,
        overflow: "hidden",
        // Drives `fill="currentColor"` in monochrome generic icons. Brand
        // icons paint their own fills so this is a no-op for them.
        color: palette.common.white,
      })}
    >
      <Icon sx={{ fontSize: tileSize / iconToContainerRatio, fill: "none" }} />
    </Stack>
  );
};

type IntegrationCardProps = {
  href?: string;
  name: string;
  description: ReactNode;
  iconDetail: IntegrationIcon;
  isConnectable?: boolean;
};

const IntegrationCard = ({
  href,
  name,
  description,
  iconDetail,
  isConnectable,
}: IntegrationCardProps) => {
  return (
    <Paper
      sx={{
        padding: ({ spacing }) => spacing(2.25, 3.5),
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={1}
      >
        <IntegrationIconTile iconDetail={iconDetail} />
        <Button
          openInNewTab={!isConnectable}
          variant={isConnectable ? "primary" : "tertiary"}
          size="xs"
          href={href}
        >
          {isConnectable ? "Connect" : "Contact us"}
        </Button>
      </Box>
      <Typography>
        <strong>{name}</strong>
      </Typography>
      <Typography sx={{ fontSize: 14 }}>{description}</Typography>
    </Paper>
  );
};

const enabledIntegrationKeyByName: Partial<
  Record<Integration["name"], keyof Omit<EnabledIntegrations, "__typename">>
> = {
  Linear: "linear",
};

const availabilityRank: Record<Integration["availability"], number> = {
  Available: 0,
  "Coming soon": 1,
  "On Request": 2,
};

const AddNewIntegrations: FunctionComponent = () => {
  const { activeWorkspace } = useContext(WorkspaceContext);
  const { enabledIntegrations } = useHashInstance();

  const cards = useMemo(() => {
    if (!activeWorkspace) {
      return null;
    }

    const isConnectable = (integration: Integration) => {
      const enabledKey = enabledIntegrationKeyByName[integration.name];
      return enabledKey ? enabledIntegrations[enabledKey] : false;
    };

    const sortedIntegrations = [...allIntegrations].sort((a, b) => {
      // Integrations the user can connect right now always sit at the top.
      const connectableDifference =
        Number(isConnectable(b)) - Number(isConnectable(a));

      if (connectableDifference !== 0) {
        return connectableDifference;
      }

      const rankDifference =
        availabilityRank[a.availability] - availabilityRank[b.availability];

      if (rankDifference !== 0) {
        return rankDifference;
      }

      return a.name.localeCompare(b.name);
    });

    return sortedIntegrations.map((integration) => {
      const iconDetail = integrationIcons[integration.name];

      const isEnabledForUser = isConnectable(integration);

      let href: string | undefined;

      if (isEnabledForUser && integration.name === "Linear") {
        href = `${apiOrigin}/oauth/linear?webId=${extractWebId(
          activeWorkspace,
        )}`;
      } else {
        href = "https://hash.ai/contact?topic=support&category=integrations";
      }

      return (
        <IntegrationCard
          key={integration.name}
          href={href}
          isConnectable={isEnabledForUser}
          name={integration.name}
          description={
            <span
              // The catalog stores short marketing descriptions as HTML so
              // a few entries can include light formatting (e.g. <strong>).
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(integration.summaryHtml, {
                  ALLOWED_TAGS: ["strong", "em", "br", "p", "div"],
                }),
              }}
            />
          }
          iconDetail={iconDetail}
        />
      );
    });
  }, [activeWorkspace, enabledIntegrations]);

  if (!activeWorkspace) {
    return <>Loading workspace...</>;
  }

  return (
    <Box>
      <Typography variant="mediumCaps" mb={2} component="div">
        Available integrations
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 2,
        }}
      >
        {cards}
      </Box>
    </Box>
  );
};

const IntegrationsPage: NextPageWithLayout = () => {
  return (
    <SettingsPageContainer
      heading="Integrations"
      subHeading="Connect HASH with the apps and services you use"
      disableContentWrapper
    >
      <Stack gap={6}>
        <AddNewIntegrations />
        <UserConnectedIntegrations />
      </Stack>
    </SettingsPageContainer>
  );
};

IntegrationsPage.getLayout = (page) => getSettingsLayout(page);

export default IntegrationsPage;
