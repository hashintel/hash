import { use } from "react";

import { Button, Icon } from "@hashintel/ds-components";

import { EditorContext } from "../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { Table, type TableColumn } from "../../../../../components/table";
import { SimulateSubviewFrame } from "../simulate-subview-frame";
import { CreateStatusViewDrawer } from "./create-status-view-drawer";
import { ViewStatusViewDrawer } from "./view-status-view-drawer";

import type { Identity, StatusView } from "@hashintel/petrinaut-core";

const makeStatusViewColumns = (identities: Identity[]) => {
  const identityNameById = new Map(
    identities.map((identity) => [identity.id, identity.name]),
  );
  return [
    {
      id: "name",
      header: "Name",
      minWidth: 200,
      flex: "1 1 200px",
      render: (statusView) => statusView.name,
    },
    {
      id: "identity",
      header: "Tracks",
      flex: "0 1 140px",
      tone: "subtle",
      render: (statusView) =>
        identityNameById.get(statusView.identityRef) ?? statusView.identityRef,
    },
    {
      id: "labels",
      header: "Labels",
      flex: "1 1 240px",
      tone: "subtle",
      render: (statusView) =>
        statusView.labels.map((label) => label.name).join(" → "),
    },
  ] satisfies readonly TableColumn<StatusView>[];
};

export const StatusViewsView = () => {
  const { simulateDrawer: drawer, setSimulateDrawer: setDrawer } =
    use(EditorContext);
  const { petriNetDefinition } = use(SDCPNContext);
  const statusViews = petriNetDefinition.statusViews ?? [];

  const selectedStatusView =
    drawer.type === "view-status-view"
      ? statusViews.find((view) => view.id === drawer.statusViewId)
      : undefined;

  const closeDrawer = () => setDrawer({ type: "closed" });

  return (
    <SimulateSubviewFrame
      title="Status views"
      action={
        <Button
          variant="solid"
          tone="neutral"
          size="sm"
          prefix={<Icon name="plus" size="sm" />}
          onClick={() => setDrawer({ type: "create-status-view" })}
        >
          Create
        </Button>
      }
    >
      <Table
        columns={makeStatusViewColumns(petriNetDefinition.identities ?? [])}
        emptyLabel="No status views yet"
        getRowId={(statusView) => statusView.id}
        rows={statusViews}
        selectedRowId={
          drawer.type === "view-status-view" ? drawer.statusViewId : null
        }
        onRowSelect={(statusView) =>
          setDrawer({ type: "view-status-view", statusViewId: statusView.id })
        }
      />

      <CreateStatusViewDrawer
        open={drawer.type === "create-status-view"}
        onClose={closeDrawer}
      />
      <ViewStatusViewDrawer
        open={!!selectedStatusView}
        onClose={closeDrawer}
        statusView={selectedStatusView}
      />
    </SimulateSubviewFrame>
  );
};
