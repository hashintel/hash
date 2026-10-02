import { use } from "react";

import { Drawer } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { statusViewSchema, type StatusView } from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../react";
import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { StatusViewDrawerFooter } from "./status-view-drawer-footer";
import {
  StatusViewFormBody,
  useStatusViewForm,
  type StatusViewFormState,
} from "./status-view-form";
import { buildStatusViewFromFormState } from "./status-view-mapping";
import { getStatusViewPlaceOptions } from "./status-view-place-options";
import { validateStatusViewSubmit } from "./validate-status-view-submit";

function buildDefaultsFromStatusView(
  statusView: StatusView,
): StatusViewFormState {
  return {
    name: statusView.name,
    description: statusView.description ?? "",
    identityRef: statusView.identityRef,
    labels: statusView.labels.map((label) => ({
      id: label.id,
      name: label.name,
      displayColor: label.displayColor,
      places: [...label.places],
      tokenCondition: label.tokenCondition ?? "",
      isExit: label.isExit ?? false,
    })),
  };
}

const ViewStatusViewContent = ({
  statusView,
  onClose,
}: {
  statusView: StatusView;
  onClose: () => void;
}) => {
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const { requestHirArtifacts } = use(LanguageClientContext);
  const { updateStatusView, removeStatusView } = usePetrinautMutations();

  // Names of OTHER status views, so this one can keep its current name.
  const existingStatusViewNames = new Set(
    (petriNetDefinition.statusViews ?? [])
      .filter((view) => view.id !== statusView.id)
      .map((view) => view.name),
  );

  const placeOptions = getStatusViewPlaceOptions(petriNetDefinition);

  const form = useStatusViewForm(
    buildDefaultsFromStatusView(statusView),
    (value) => {
      // The submit validator already schema-checked this shape, so a
      // failure here throws loudly instead of leaving a dead Save button.
      const updated = statusViewSchema.parse(
        buildStatusViewFromFormState(value, statusView.id),
      );
      updateStatusView({
        statusViewId: statusView.id,
        update: {
          name: updated.name,
          description: updated.description,
          identityRef: updated.identityRef,
          labels: updated.labels,
        },
      });
      onClose();
    },
    {
      existingStatusViewNames,
      knownPlaceIds: new Set(placeOptions.map((option) => option.value)),
      validateOnSubmit: (value) =>
        validateStatusViewSubmit({
          value,
          statusViewId: statusView.id,
          sdcpn: petriNetDefinition,
          extensions,
          requestHirArtifacts,
        }),
    },
  );

  const handleDelete = () => {
    removeStatusView({ statusViewId: statusView.id });
    onClose();
  };

  return (
    <Drawer showBackdrop={false} onClose={onClose} swapKey="status-view">
      <Drawer.Header title={statusView.name} />
      <Drawer.Body className={css({ paddingTop: "[0]" })}>
        <StatusViewFormBody
          form={form}
          identities={petriNetDefinition.identities ?? []}
          placeOptions={placeOptions}
        />
      </Drawer.Body>
      <StatusViewDrawerFooter
        form={form}
        onClose={onClose}
        onDelete={handleDelete}
        closeLabel="Close"
        submitLabel="Save"
        unchangedTooltip="No changes to save."
      />
    </Drawer>
  );
};

export const ViewStatusViewDrawer = ({
  open,
  onClose,
  statusView,
}: {
  open: boolean;
  onClose: () => void;
  statusView: StatusView | undefined;
}) => {
  if (!open || !statusView) {
    return null;
  }

  return (
    <ViewStatusViewContent
      key={statusView.id}
      statusView={statusView}
      onClose={onClose}
    />
  );
};
