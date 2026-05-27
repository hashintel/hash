import { useStore } from "@tanstack/react-form";
import { use } from "react";

import { metricSchema, type Metric } from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../react";
import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { Button } from "../../../../../components/button";
import { Drawer } from "../../../../../components/drawer";
import { DrawerErrorDisplay } from "../drawer-error-display";
import {
  MetricFormBody,
  type MetricFormInstance,
  type MetricFormState,
  useMetricForm,
  useMetricLspSession,
} from "./metric-form";
import { summarizeMetricLspErrors } from "./metric-lsp";
import { buildMetricFromFormState } from "./metric-mapping";
import { useMetricValidation } from "./use-metric-validation";

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
  compileError,
  metricSessionId,
  onDelete,
  onClose,
}: {
  form: MetricFormInstance;
  compileError: string | null;
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
  const hasErrors = !!formError || hasLspErrors || !!compileError;
  const totalErrorCount =
    (formError ? 1 : 0) + lspErrorCount + (compileError ? 1 : 0);
  const firstError = formError ?? firstLspMessage ?? compileError ?? undefined;
  const canSave = canSubmit && !hasErrors && !isSubmitting && !isDefaultValue;

  return (
    <Drawer.Footer>
      <DrawerErrorDisplay count={totalErrorCount} firstMessage={firstError} />
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
            : (compileError ??
              (isDefaultValue ? "No changes to save." : undefined)))
        }
        onClick={() => {
          void form.handleSubmit();
        }}
      >
        Save
      </Button>
    </Drawer.Footer>
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
  const { petriNetDefinition } = use(SDCPNContext);
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
    { existingMetricNames },
  );

  // Compile-check the live code. Routed through the EvalSandbox so the
  // `new Function` compile happens inside the iframe when the iframe
  // sandbox is active.
  const values = useStore(form.store, (state) => state.values);
  const { compileError } = useMetricValidation({
    id: metric.id,
    name: values.name || metric.name,
    code: values.code,
  });

  // Owned here (not in MetricFormBody) so the footer can scope its LSP
  // diagnostics summary to the same session.
  const metricSessionId = useMetricLspSession(values.code);

  const handleDelete = () => {
    removeMetric({ metricId: metric.id });
    onClose();
  };

  return (
    <>
      <Drawer.Card onClose={onClose}>
        <Drawer.Header>{metric.name}</Drawer.Header>
        <Drawer.Body>
          <MetricFormBody
            form={form}
            idPrefix="view-"
            metricSessionId={metricSessionId}
          />
        </Drawer.Body>
      </Drawer.Card>
      <ViewMetricFooter
        form={form}
        compileError={compileError}
        metricSessionId={metricSessionId}
        onDelete={handleDelete}
        onClose={onClose}
      />
    </>
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
}: ViewMetricDrawerProps) => (
  <Drawer.Root open={open} onClose={onClose}>
    {metric ? (
      <ViewMetricContent key={metric.id} metric={metric} onClose={onClose} />
    ) : null}
  </Drawer.Root>
);
