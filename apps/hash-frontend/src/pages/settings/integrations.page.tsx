import { Box, Paper, Typography } from "@mui/material";
import DOMPurify from "dompurify";
import { useMemo } from "react";

import {
  allIntegrations,
  type Integration,
} from "@hashintel/integrations-catalog";

import { Button } from "../../shared/ui/button";
import { getSettingsLayout } from "../shared/settings-layout";
import { IntegrationIconTile } from "./integrations.page/integration-icon-tile";
import { SettingsPageContainer } from "./shared/settings-page-container";

import type { NextPageWithLayout } from "../../shared/layout";
import type { FunctionComponent, ReactNode } from "react";

type IntegrationCardProps = {
  name: string;
  description: ReactNode;
};

const contactHref =
  "https://hash.ai/contact?topic=support&category=integrations";

const IntegrationCard = ({ name, description }: IntegrationCardProps) => {
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
        <IntegrationIconTile name={name} />
        <Button openInNewTab variant="tertiary" size="xs" href={contactHref}>
          Contact us
        </Button>
      </Box>
      <Typography>
        <strong>{name}</strong>
      </Typography>
      <Typography sx={{ fontSize: 14 }}>{description}</Typography>
    </Paper>
  );
};

const availabilityRank: Record<Integration["availability"], number> = {
  Available: 0,
  "Coming soon": 1,
  "On Request": 2,
};

const AddNewIntegrations: FunctionComponent = () => {
  const cards = useMemo(() => {
    const sortedIntegrations = [...allIntegrations].sort((a, b) => {
      const rankDifference =
        availabilityRank[a.availability] - availabilityRank[b.availability];

      if (rankDifference !== 0) {
        return rankDifference;
      }

      return a.name.localeCompare(b.name);
    });

    return sortedIntegrations.map((integration) => (
      <IntegrationCard
        key={integration.name}
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
      />
    ));
  }, []);

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
      <AddNewIntegrations />
    </SettingsPageContainer>
  );
};

IntegrationsPage.getLayout = (page) => getSettingsLayout(page);

export default IntegrationsPage;
