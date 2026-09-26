import { use, useState } from "react";

import { Drawer } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { statusViewSchema } from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../react";
import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { StatusViewDrawerFooter } from "./status-view-drawer-footer";
import { StatusViewFormBody, useStatusViewForm } from "./status-view-form";
import { makeEmptyStatusViewFormState } from "./status-view-form-defaults";
import { buildStatusViewFromFormState } from "./status-view-mapping";
import { getStatusViewPlaceOptions } from "./status-view-place-options";
import { validateStatusViewSubmit } from "./validate-status-view-submit";

const CreateStatusViewContent = ({ onClose }: { onClose: () => void }) => {
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const { requestHirArtifacts } = use(LanguageClientContext);
  const { addStatusView } = usePetrinautMutations();
  const [defaultValues] = useState(makeEmptyStatusViewFormState);

  const existingStatusViewNames = new Set(
    (petriNetDefinition.statusViews ?? []).map((view) => view.name),
  );
  const placeOptions = getStatusViewPlaceOptions(petriNetDefinition);

  const form = useStatusViewForm(
    defaultValues,
    (value, ctx) => {
      // The submit validator already schema-checked this shape, so a
      // failure here throws loudly instead of leaving a dead Create button.
      const statusView = statusViewSchema.parse(
        buildStatusViewFromFormState(value, crypto.randomUUID()),
      );
      addStatusView(statusView);
      onClose();
      ctx.reset();
    },
    {
      existingStatusViewNames,
      knownPlaceIds: new Set(placeOptions.map((option) => option.value)),
      validateOnSubmit: (value) =>
        validateStatusViewSubmit({
          value,
          statusViewId: "status-view-submit-validation",
          sdcpn: petriNetDefinition,
          extensions,
          requestHirArtifacts,
        }),
    },
  );

  return (
    <Drawer showBackdrop={false} onClose={onClose} swapKey="status-view">
      <Drawer.Header
        title="Create a status view"
        description="Maps places to ordered status labels for the instances of one identity: badges on the canvas, columns on the Kanban board."
      />
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
        closeLabel="Cancel"
        submitLabel="Create"
        unchangedTooltip="Make changes to enable creation."
      />
    </Drawer>
  );
};

export const CreateStatusViewDrawer = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  if (!open) {
    return null;
  }

  return <CreateStatusViewContent onClose={onClose} />;
};
