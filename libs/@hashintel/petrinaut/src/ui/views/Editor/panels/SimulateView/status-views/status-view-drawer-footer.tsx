import { useStore } from "@tanstack/react-form";

import { Button, Drawer } from "@hashintel/ds-components";

import { DrawerErrorDisplay } from "../drawer-error-display";

import type { StatusViewFormInstance } from "./status-view-form";

/**
 * Footer shared by the create and view drawers: the form's first error, a
 * Delete button when the view exists, a close action, and a submit action
 * enabled once the form is valid and differs from its defaults.
 */
export const StatusViewDrawerFooter = ({
  form,
  onClose,
  onDelete,
  closeLabel,
  submitLabel,
  unchangedTooltip,
}: {
  form: StatusViewFormInstance;
  onClose: () => void;
  onDelete?: () => void;
  closeLabel: string;
  submitLabel: string;
  /** Shown on the disabled submit button while the form matches its defaults. */
  unchangedTooltip: string;
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
          {onDelete && (
            <Button variant="subtle" tone="error" size="sm" onClick={onDelete}>
              Delete
            </Button>
          )}
          <Button variant="subtle" tone="neutral" size="sm" onClick={onClose}>
            {closeLabel}
          </Button>
          <Button
            variant="solid"
            tone="neutral"
            size="sm"
            disabled={!canSave}
            tooltip={
              formError ?? (isDefaultValue ? unchangedTooltip : undefined)
            }
            onClick={() => {
              void form.handleSubmit();
            }}
          >
            {submitLabel}
          </Button>
        </>
      }
    />
  );
};
