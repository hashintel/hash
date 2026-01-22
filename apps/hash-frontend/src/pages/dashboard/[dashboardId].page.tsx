import type { GridPosition } from "@local/hash-isomorphic-utils/dashboard-types";
import { Box, Container } from "@mui/material";
import { useCallback, useState } from "react";

import type { NextPageWithLayout } from "../../shared/layout";
import { getLayoutWithSidebar } from "../../shared/layout";
import { DashboardGrid } from "./dashboard-grid";
import { DashboardHeader } from "./dashboard-header";
import { ItemConfigModal } from "./item-config-modal";
import { mockDashboard } from "./shared/mock-data";
import type { DashboardItemData } from "./shared/types";

const DashboardPage: NextPageWithLayout = () => {
  // TODO: Replace with actual data fetching using router.query.dashboardId
  const [dashboard, setDashboard] = useState(mockDashboard);
  const [isEditing, setIsEditing] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<DashboardItemData | null>(
    null,
  );

  const handleLayoutChange = useCallback((newLayout: GridPosition[]) => {
    setDashboard((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        const layoutItem = newLayout.find(
          (layoutEntry) =>
            layoutEntry.i === (item.gridPosition.i || item.entityId),
        );
        if (layoutItem) {
          return {
            ...item,
            gridPosition: {
              i: layoutItem.i,
              x: layoutItem.x,
              y: layoutItem.y,
              w: layoutItem.w,
              h: layoutItem.h,
            },
          };
        }
        return item;
      }),
    }));
  }, []);

  const handleItemConfigureClick = useCallback((item: DashboardItemData) => {
    setSelectedItem(item);
    setConfigModalOpen(true);
  }, []);

  const handleItemRefreshClick = useCallback((item: DashboardItemData) => {
    // TODO: Trigger data refresh
    // eslint-disable-next-line no-console
    console.log("Refresh item:", item);
  }, []);

  const handleAddItem = useCallback(() => {
    // TODO: Open add item modal
    // eslint-disable-next-line no-console
    console.log("Add new item");
  }, []);

  const handleCloseConfigModal = useCallback(() => {
    setConfigModalOpen(false);
    setSelectedItem(null);
  }, []);

  return (
    <Container maxWidth={false} sx={{ py: 3 }}>
      <DashboardHeader
        title={dashboard.title}
        description={dashboard.description}
        isEditing={isEditing}
        onEditToggle={() => setIsEditing(!isEditing)}
        onAddItem={handleAddItem}
      />

      <Box sx={{ minHeight: "calc(100vh - 200px)" }}>
        <DashboardGrid
          dashboard={dashboard}
          onLayoutChange={handleLayoutChange}
          onItemConfigureClick={handleItemConfigureClick}
          onItemRefreshClick={handleItemRefreshClick}
          isEditing={isEditing}
        />
      </Box>

      {selectedItem && (
        <ItemConfigModal
          open={configModalOpen}
          onClose={handleCloseConfigModal}
          itemEntityId={selectedItem.entityId}
          initialGoal={selectedItem.userGoal}
        />
      )}
    </Container>
  );
};

DashboardPage.getLayout = (page) => getLayoutWithSidebar(page, {});

export default DashboardPage;
