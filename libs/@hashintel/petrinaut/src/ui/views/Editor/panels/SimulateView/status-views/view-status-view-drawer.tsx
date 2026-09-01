import { useStore } from "@tanstack/react-form";
import { use } from "react";

import { Button, Drawer } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { statusViewSchema, type StatusView } from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../react";
import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { DrawerErrorDisplay } from "../drawer-error-display";
import {
  StatusViewFormBody,
  useStatusViewForm,
  type StatusViewFormInstance,
  type StatusViewFormState,
} from "./status-view-form";
import { validateStatusViewCompiles } from "./status-view-lsp";
import { buildStatusViewFromFormState } from "./status-view-mapping";
import { getStatusViewPlaceOptions } from "./status-view-place-options";

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

const ViewStatusViewFooter = ({
  form,
  onDelete,
  onClose,
}: {
  form: StatusViewFormInstance;
  onDelete: () => void;
  onClose: () => void;
}) => {
  const canSubmit = useStore(form.store, (state) => state.canSubmit);
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const isDefaultValue = useStore(form.store, (state) => state.isDefaultValue);
  const formErrors = useStore(form.store, (state) => state.errors);

  const formError = formErrors.find((error) => typeof error === "string") as
    | string
    | undefined;
  const canSave = canSubmit && !formError && !isSubmitting && !isDefaultValue;

  return (
    <Drawer.Footer
      secondaryActions={
        <DrawerErrorDisplay
          count={formError ? 1 : 0}
          firstMessage={formError}
        />
      }
      actions={
        <>
          <Button variant="subtle" tone="error" size="sm" onClick={onDelete}>
            Delete
          </Button>
          <Button variant="subtle" tone="neutral" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="solid"
            tone="neutral"
            size="sm"
            disabled={!canSave}
            tooltip={
              formError ?? (isDefaultValue ? "No changes to save." : undefined)
            }
            onClick={() => {
              void form.handleSubmit();
            }}
          >
            Save
          </Button>
        </>
      }
    />
  );
};

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

  const form = useStatusViewForm(
    buildDefaultsFromStatusView(statusView),
    (value) => {
      const updated = buildStatusViewFromFormState(value, statusView.id);
      const result = statusViewSchema.safeParse(updated);
      if (!result.success) {
        return;
      }
      updateStatusView({
        statusViewId: statusView.id,
        update: {
          name: result.data.name,
          description: result.data.description,
          identityRef: result.data.identityRef,
          labels: result.data.labels,
        },
      });
      onClose();
    },
    {
      existingStatusViewNames,
      validateOnSubmit: async (value) =>
        await validateStatusViewCompiles({
          requestHirArtifacts,
          sdcpn: petriNetDefinition,
          extensions,
          statusView: buildStatusViewFromFormState(value, statusView.id),
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
          placeOptions={getStatusViewPlaceOptions(petriNetDefinition)}
        />
      </Drawer.Body>
      <ViewStatusViewFooter
        form={form}
        onDelete={handleDelete}
        onClose={onClose}
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
