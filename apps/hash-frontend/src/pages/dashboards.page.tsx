import { Add as AddIcon } from "@mui/icons-material";
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Container,
  Grid,
  Typography,
} from "@mui/material";
import { useRouter } from "next/router";
import { useState } from "react";

import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";
import { Button } from "../shared/ui/button";
import { mockDashboardsList } from "./dashboard/shared/mock-data";

const DashboardsPage: NextPageWithLayout = () => {
  const router = useRouter();
  const [dashboards] = useState(mockDashboardsList);

  const handleCreateDashboard = () => {
    // TODO: Open create dashboard modal or navigate to creation page
    // eslint-disable-next-line no-console
    console.log("Create new dashboard");
  };

  const handleDashboardClick = (dashboardId: string) => {
    void router.push(`/dashboard/${dashboardId}`);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 4,
        }}
      >
        <Typography variant="h4" component="h1">
          Dashboards
        </Typography>
        <Button
          variant="primary"
          startIcon={<AddIcon />}
          onClick={handleCreateDashboard}
        >
          New Dashboard
        </Button>
      </Box>

      <Grid container spacing={3}>
        {dashboards.map((dashboard) => (
          <Grid item xs={12} sm={6} md={4} key={dashboard.entityId}>
            <Card>
              <CardActionArea
                onClick={() => handleDashboardClick(dashboard.entityId)}
              >
                <CardContent sx={{ minHeight: 140 }}>
                  <Typography variant="h5" gutterBottom>
                    {dashboard.title}
                  </Typography>
                  {dashboard.description && (
                    <Typography
                      variant="smallTextParagraphs"
                      sx={{ color: ({ palette }) => palette.gray[70] }}
                    >
                      {dashboard.description}
                    </Typography>
                  )}
                  <Typography
                    variant="microText"
                    sx={{
                      mt: 2,
                      display: "block",
                      color: ({ palette }) => palette.gray[70],
                    }}
                  >
                    {dashboard.items.length} chart
                    {dashboard.items.length !== 1 ? "s" : ""}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}

        {dashboards.length === 0 && (
          <Grid item xs={12}>
            <Box
              sx={{
                textAlign: "center",
                py: 8,
              }}
            >
              <Typography
                variant="h5"
                sx={{ color: ({ palette }) => palette.gray[70] }}
                gutterBottom
              >
                No dashboards yet
              </Typography>
              <Typography
                variant="smallTextParagraphs"
                sx={{ mb: 3, color: ({ palette }) => palette.gray[70] }}
              >
                Create your first dashboard to start visualizing your data
              </Typography>
              <Button
                variant="primary"
                startIcon={<AddIcon />}
                onClick={handleCreateDashboard}
              >
                Create Dashboard
              </Button>
            </Box>
          </Grid>
        )}
      </Grid>
    </Container>
  );
};

DashboardsPage.getLayout = (page) => getLayoutWithSidebar(page, {});

export default DashboardsPage;
