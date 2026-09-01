import { useStore } from "@tanstack/react-form";
import { use, useState } from "react";

import { Button, Drawer } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { statusViewSchema } from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../react";
import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { DrawerErrorDisplay } from "../drawer-error-display";
import {
  StatusViewFormBody,
  useStatusViewForm,
  type StatusViewFormInstance,
} from "./status-view-form";
import { makeEmptyStatusViewFormState } from "./status-view-form-defaults";
import { validateStatusViewCompiles } from "./status-view-lsp";
import { buildStatusViewFromFormState } from "./status-view-mapping";
import { getStatusViewPlaceOptions } from "./status-view-place-options";

const CreateStatusViewFooter = ({
  form,
  onClose,
}: {
  form: StatusViewFormInstance;
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
          <Button variant="subtle" tone="neutral" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="solid"
            tone="neutral"
            size="sm"
            disabled={!canSave}
            tooltip={
              formError ??
              (isDefaultValue ? "Make changes to enable creation." : undefined)
            }
            onClick={() => {
              void form.handleSubmit();
            }}
          >
            Create
          </Button>
        </>
      }
    />
  );
};

const CreateStatusViewContent = ({ onClose }: { onClose: () => void }) => {
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const { requestHirArtifacts } = use(LanguageClientContext);
  const { addStatusView } = usePetrinautMutations();
  const [defaultValues] = useState(makeEmptyStatusViewFormState);

  const existingStatusViewNames = new Set(
    (petriNetDefinition.statusViews ?? []).map((view) => view.name),
  );

  const form = useStatusViewForm(
    defaultValues,
    (value, ctx) => {
      const statusView = buildStatusViewFromFormState(
        value,
        crypto.randomUUID(),
      );
      const result = statusViewSchema.safeParse(statusView);
      if (!result.success) {
        return;
      }
      addStatusView(result.data);
      onClose();
      ctx.reset();
    },
    {
      existingStatusViewNames,
      validateOnSubmit: async (value) =>
        await validateStatusViewCompiles({
          requestHirArtifacts,
          sdcpn: petriNetDefinition,
          extensions,
          statusView: buildStatusViewFromFormState(
            value,
            "status-view-submit-validation",
          ),
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
          placeOptions={getStatusViewPlaceOptions(petriNetDefinition)}
        />
      </Drawer.Body>
      <CreateStatusViewFooter form={form} onClose={onClose} />
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
