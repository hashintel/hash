import { Box, Paper, Stack, Typography } from "@mui/material";
import slugify from "@sindresorhus/slugify";
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

/**
 * Renders an integration logo inside a dark, rounded tile, mirroring the
 * `IconTile` treatment used on hash.ai (`apps/hashdotai`). The catalog's
 * `dark` icon variants are designed to sit on a dark ground, and each entry
 * supplies an `iconToContainerRatio` and `horizontalAlignment` so the logo is
 * sized and positioned consistently within the tile.
 */
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
  buttonLabel: string;
  name: string;
  description: ReactNode;
  iconDetail: IntegrationIcon;
  buttonOpensInNewTab?: boolean;
};

const IntegrationCard = ({
  href,
  buttonLabel,
  name,
  description,
  iconDetail,
  buttonOpensInNewTab,
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
          openInNewTab={buttonOpensInNewTab ?? false}
          variant="tertiary"
          size="xs"
          href={href}
        >
          {buttonLabel}
        </Button>
      </Box>
      <Typography>
        <strong>{name}</strong>
      </Typography>
      <Typography sx={{ fontSize: 14 }}>{description}</Typography>
    </Paper>
  );
};

/**
 * Maps an integration entry from the public catalog to the optional
 * server-side `enabledIntegrations` flag (if any) which decides whether
 * a real `Connect` action is wired up.
 *
 * Keep keys in sync with `EnabledIntegrations` in
 * `libs/@local/hash-isomorphic-utils/src/graphql/type-defs/knowledge/hash-instance.typedef.ts`.
 */
const enabledIntegrationKeyByName: Partial<
  Record<Integration["name"], keyof Omit<EnabledIntegrations, "__typename">>
> = {
  Linear: "linear",
};

const AddNewIntegrations: FunctionComponent = () => {
  const { activeWorkspace } = useContext(WorkspaceContext);
  const { enabledIntegrations } = useHashInstance();

  const cards = useMemo(() => {
    if (!activeWorkspace) {
      return null;
    }

    return allIntegrations.map((integration) => {
      const iconDetail = integrationIcons[integration.name];

      const enabledKey = enabledIntegrationKeyByName[integration.name];
      const isEnabledForUser = enabledKey
        ? enabledIntegrations[enabledKey]
        : false;

      let href: string | undefined;
      let buttonLabel = "Contact us";
      let buttonOpensInNewTab: boolean | undefined;

      if (isEnabledForUser && integration.name === "Linear") {
        href = `${apiOrigin}/oauth/linear?webId=${extractWebId(
          activeWorkspace,
        )}`;
        buttonLabel = "Connect";
      } else {
        href = `https://hash.ai/contact?topic=support&category=integration&integration=${encodeURIComponent(
          slugify(integration.name),
        )}`;
        buttonOpensInNewTab = true;
      }

      return (
        <IntegrationCard
          key={integration.name}
          href={href}
          buttonLabel={buttonLabel}
          buttonOpensInNewTab={buttonOpensInNewTab}
          name={integration.name}
          description={
            <span
              // The catalog stores short marketing descriptions as HTML so
              // a few entries can include light formatting (e.g. <strong>).
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: integration.summaryHtml }}
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
