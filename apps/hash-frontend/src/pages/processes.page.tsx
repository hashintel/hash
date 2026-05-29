import { Box, Container, Stack, Typography } from "@mui/material";
import { NextSeo } from "next-seo";
import { useMemo } from "react";

import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";

import { ChartNetworkRegularIcon } from "../shared/icons/chart-network-regular-icon";
import { PlusRegularIcon } from "../shared/icons/plus-regular";
import { getLayoutWithSidebar } from "../shared/layout";
import { Link } from "../shared/ui";
import { exampleTiles } from "./processes.page/example-tiles-data";
import { ProcessTile } from "./processes.page/process-tile";
import { usePersistedNets } from "./processes.page/use-persisted-nets";
import { CreateButton } from "./shared/create-button";

import type { NextPageWithLayout } from "../shared/layout";

const contentMaxWidth = 1000;

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <Typography
    variant="h3"
    sx={({ palette }) => ({
      color: palette.gray[80],
      mb: 2,
    })}
  >
    {children}
  </Typography>
);

/**
 * Lists Petri net "processes" — both those in the db visible to the user,
 * and examples imported from `@hashintel/petrinaut-core/examples`.
 */
const ProcessesPage: NextPageWithLayout = () => {
  const { persistedNets } = usePersistedNets();

  const sortedNets = useMemo(
    () =>
      [...persistedNets].sort((a, b) =>
        a.lastUpdated < b.lastUpdated ? 1 : -1,
      ),
    [persistedNets],
  );

  const maxWidth = { lg: `max(${contentMaxWidth}px, "70%")` } as const;

  return (
    <>
      <NextSeo title="Processes" />
      <Box
        sx={({ palette }) => ({
          backgroundColor: palette.common.white,
          borderBottom: 1,
          borderColor: palette.gray[20],
          pt: 9,
          pb: 0,
        })}
      >
        <Container sx={{ maxWidth }}>
          <Typography
            variant="h1"
            fontWeight="bold"
            sx={{ display: "flex", alignItems: "center", mt: 3, mb: 1 }}
          >
            <Box display="inline-flex">
              <ChartNetworkRegularIcon
                sx={({ palette }) => ({
                  fontSize: 50,
                  mr: 2,
                  color: palette.gray[80],
                })}
              />
            </Box>
            Processes
          </Typography>
          <Stack direction="row" justifyContent="flex-end">
            <CreateButton
              href="/processes/draft"
              variant="tertiary_quiet"
              endIcon={<PlusRegularIcon />}
            >
              Create process
            </CreateButton>
          </Stack>
        </Container>
      </Box>
      <Container sx={{ paddingTop: 5, paddingBottom: 8, maxWidth }}>
        <Box mb={5}>
          {sortedNets.length === 0 ? (
            <Typography
              sx={({ palette }) => ({
                color: palette.gray[70],
                fontSize: 14,
              })}
            >
              You haven&apos;t created any processes yet —{" "}
              <Link href="/processes/draft">start from scratch</Link> or open an
              example below.
            </Typography>
          ) : (
            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, 1fr)",
                  md: "repeat(3, 1fr)",
                },
              }}
            >
              {sortedNets.map((net) => (
                <ProcessTile
                  key={net.entityId}
                  href={`/processes/${extractEntityUuidFromEntityId(net.entityId)}`}
                  sdcpn={net.definition}
                  title={net.title}
                />
              ))}
            </Box>
          )}
        </Box>

        <Box>
          <SectionHeading>Examples</SectionHeading>
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, 1fr)",
                md: "repeat(3, 1fr)",
              },
            }}
          >
            {exampleTiles.map((example) => (
              <ProcessTile
                key={example.slug}
                href={`/processes/draft?example=${example.slug}`}
                sdcpn={example.petriNetDefinition}
                title={example.title}
              />
            ))}
          </Box>
        </Box>
      </Container>
    </>
  );
};

ProcessesPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default ProcessesPage;
