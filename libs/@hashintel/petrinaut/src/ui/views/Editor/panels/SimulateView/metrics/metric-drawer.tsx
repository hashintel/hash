import { useStore } from "@tanstack/react-form";
import { use } from "react";

import { Button, Drawer } from "@hashintel/ds-components";
import {
  generatePetrinautId,
  metricSchema,
  type Metric,
} from "@hashintel/petrinaut-core";

import { SDCPNContext } from "../../../../../../react/document/sdcpn-context";
import { usePetrinautMutations } from "../../../../../../react/editing/use-petrinaut-mutations";
import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { DrawerErrorDisplay } from "../drawer-error-display";
import { MetricFormBody } from "./metric-form";
import { summarizeMetricLspErrors, validateMetricCompiles } from "./metric-lsp";
import {
  buildMetricFromFormState,
  emptyMetricFormState,
  type MetricFormInstance,
  useMetricForm,
} from "./use-metric-form";
import { useMetricLspSession } from "./use-metric-lsp-session";

const MetricDrawerFooter = ({
  form,
  metricSessionId,
  submitLabel,
  closeLabel,
  unchangedTooltip,
  onDelete,
  onClose,
}: {
  form: MetricFormInstance;
  metricSessionId: string;
  submitLabel: string;
  closeLabel: string;
  /** What the submit button says while the form holds its default values. */
  unchangedTooltip: string;
  onDelete?: () => void;
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

  const formError = formErrors.find((error) => typeof error === "string") as
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
              formError ??
              (hasLspErrors
                ? "Fix the errors in the metric code before saving."
                : isDefaultValue
                  ? unchangedTooltip
                  : undefined)
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

/**
 * The drawer a metric is authored in. With a `metric` it edits that metric
 * and can delete it; without one it creates a metric. A caller that swaps
 * the metric in place keys the drawer on the metric's id.
 */
export const MetricDrawer = ({
  metric,
  onClose,
}: {
  metric?: Metric;
  onClose: () => void;
}) => {
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const { requestHirArtifacts } = use(LanguageClientContext);
  const { addMetric, updateMetric, removeMetric } = usePetrinautMutations();

  // The metric being edited may keep its own name.
  const otherMetricNames = new Set(
    (petriNetDefinition.metrics ?? [])
      .filter((other) => other.id !== metric?.id)
      .map((other) => other.name),
  );

  const form = useMetricForm(
    metric
      ? {
          name: metric.name,
          description: metric.description ?? "",
          code: metric.code,
        }
      : emptyMetricFormState,
    (value, reset) => {
      const result = metricSchema.safeParse(
        buildMetricFromFormState(value, metric?.id ?? generatePetrinautId()),
      );
      if (!result.success) {
        return;
      }
      if (metric) {
        const { name, description, code } = result.data;
        updateMetric({
          metricId: metric.id,
          update: { name, description, code },
        });
        onClose();
      } else {
        addMetric(result.data);
        onClose();
        reset();
      }
    },
    {
      existingMetricNames: otherMetricNames,
      validateOnSubmit: async (value) =>
        await validateMetricCompiles({
          requestHirArtifacts,
          sdcpn: petriNetDefinition,
          extensions,
          metric: buildMetricFromFormState(
            value,
            metric?.id ?? "metric-submit-validation",
          ),
        }),
    },
  );

  // The session lives here, not in the form body, so the footer counts the
  // diagnostics of the same session the editor shows.
  const code = useStore(form.store, (state) => state.values.code);
  const metricSessionId = useMetricLspSession(code);

  return (
    <Drawer showBackdrop={false} onClose={onClose} swapKey="metric">
      {metric ? (
        <Drawer.Header title={metric.name} />
      ) : (
        <Drawer.Header
          title="Create a metric"
          description="A function over the simulation state that returns a number to plot on the timeline."
        />
      )}
      <Drawer.Body>
        <MetricFormBody form={form} metricSessionId={metricSessionId} />
      </Drawer.Body>
      <MetricDrawerFooter
        form={form}
        metricSessionId={metricSessionId}
        submitLabel={metric ? "Save" : "Create"}
        closeLabel={metric ? "Close" : "Cancel"}
        unchangedTooltip={
          metric ? "No changes to save." : "Make changes to enable creation."
        }
        onDelete={
          metric
            ? () => {
                removeMetric({ metricId: metric.id });
                onClose();
              }
            : undefined
        }
        onClose={onClose}
      />
    </Drawer>
  );
};
