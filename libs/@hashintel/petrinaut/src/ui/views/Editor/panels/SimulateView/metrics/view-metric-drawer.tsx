import { useStore } from "@tanstack/react-form";
import { use } from "react";

import { Button, Drawer } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { metricSchema, type Metric } from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../react";
import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { DrawerErrorDisplay } from "../drawer-error-display";
import {
  MetricFormBody,
  type MetricFormInstance,
  type MetricFormState,
  useMetricForm,
  useMetricLspSession,
} from "./metric-form";
import { summarizeMetricLspErrors, validateMetricCompiles } from "./metric-lsp";
import { buildMetricFromFormState } from "./metric-mapping";

// -- Defaults -----------------------------------------------------------------

function buildDefaultsFromMetric(metric: Metric): MetricFormState {
  return {
    name: metric.name,
    description: metric.description ?? "",
    code: metric.code,
  };
}

// -- Footer -------------------------------------------------------------------

const ViewMetricFooter = ({
  form,
  metricSessionId,
  onDelete,
  onClose,
}: {
  form: MetricFormInstance;
  metricSessionId: string;
  onDelete: () => void;
  onClose: () => void;
}) => {
  const canSubmit = useStore(form.store, (state) => state.canSubmit);
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const isDefaultValue = useStore(form.store, (state) => state.isDefaultValue);
  const formErrors = useStore(form.store, (state) => state.errors);

  const { diagnosticsByUri } = use(LanguageClientContext);
  const { count: lspErrorCount, firstMessage: firstLspMessage } =
    summarizeMetricLspErrors(diagnosticsByUri, metricSessionId);
  const hasLspErrors = lspErrorCount > 0;

  const formError = formErrors.find((e) => typeof e === "string") as
    | string
    | undefined;
  const hasErrors = !!formError || hasLspErrors;
  const totalErrorCount = (formError ? 1 : 0) + lspErrorCount;
  const firstError = formError ?? firstLspMessage ?? undefined;
  const canSave = canSubmit && !hasErrors && !isSubmitting && !isDefaultValue;

  return (
    <Drawer.Footer
      secondaryActions={
        <DrawerErrorDisplay count={totalErrorCount} firstMessage={firstError} />
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
              formError ??
              (hasLspErrors
                ? "Fix the errors in the metric code before saving."
                : isDefaultValue
                  ? "No changes to save."
                  : undefined)
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

// -- Inner content (remounts when metric changes via `key`) ------------------

const ViewMetricContent = ({
  metric,
  onClose,
}: {
  metric: Metric;
  onClose: () => void;
}) => {
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const { requestHirArtifacts } = use(LanguageClientContext);
  const { updateMetric, removeMetric } = usePetrinautMutations();

  // Names of OTHER metrics — exclude the one being edited so it can keep
  // its current name without triggering the "already exists" error.
  const existingMetricNames = new Set(
    (petriNetDefinition.metrics ?? [])
      .filter((m) => m.id !== metric.id)
      .map((m) => m.name),
  );

  const form = useMetricForm(
    buildDefaultsFromMetric(metric),
    (value) => {
      const updated = buildMetricFromFormState(value, metric.id);
      const result = metricSchema.safeParse(updated);
      if (!result.success) {
        return;
      }
      updateMetric({
        metricId: metric.id,
        update: {
          name: result.data.name,
          description: result.data.description,
          code: result.data.code,
        },
      });
      onClose();
    },
    {
      existingMetricNames,
      validateOnSubmit: async (value) =>
        await validateMetricCompiles({
          requestHirArtifacts,
          sdcpn: petriNetDefinition,
          extensions,
          metric: buildMetricFromFormState(value, metric.id),
        }),
    },
  );

  // Live validation (TypeScript + HIR semantic/compilability checks) comes
  // from the metric LSP session diagnostics.
  const values = useStore(form.store, (state) => state.values);

  // Owned here (not in MetricFormBody) so the footer can scope its LSP
  // diagnostics summary to the same session.
  const metricSessionId = useMetricLspSession(values.code);

  const handleDelete = () => {
    removeMetric({ metricId: metric.id });
    onClose();
  };

  return (
    <Drawer showBackdrop={false} onClose={onClose} swapKey="metric">
      <Drawer.Header title={metric.name} />
      <Drawer.Body className={css({ paddingTop: "[0]" })}>
        <MetricFormBody
          form={form}
          idPrefix="view-"
          metricSessionId={metricSessionId}
        />
      </Drawer.Body>
      <ViewMetricFooter
        form={form}
        metricSessionId={metricSessionId}
        onDelete={handleDelete}
        onClose={onClose}
      />
    </Drawer>
  );
};

// -- Component ----------------------------------------------------------------

interface ViewMetricDrawerProps {
  open: boolean;
  onClose: () => void;
  metric: Metric | undefined;
}

export const ViewMetricDrawer = ({
  open,
  onClose,
  metric,
}: ViewMetricDrawerProps) => {
  if (!open || !metric) {
    return null;
  }

  return (
    <ViewMetricContent key={metric.id} metric={metric} onClose={onClose} />
  );
};
