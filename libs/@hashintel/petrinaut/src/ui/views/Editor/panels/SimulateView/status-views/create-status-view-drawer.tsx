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
      validateOnSubmit: async (value) => {
        const parsed = statusViewSchema.safeParse(
          buildStatusViewFromFormState(value, "status-view-submit-validation"),
        );
        if (!parsed.success) {
          return (
            parsed.error.issues[0]?.message ?? "The status view is invalid."
          );
        }
        return await validateStatusViewCompiles({
          requestHirArtifacts,
          sdcpn: petriNetDefinition,
          extensions,
          statusView: parsed.data,
        });
      },
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
