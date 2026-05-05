import { css } from "@hashintel/ds-helpers/css";
import { useStore } from "@tanstack/react-form";
import { use } from "react";

import { Button } from "../../../../components/button";
import { Drawer } from "../../../../components/drawer";
import { metricSchema } from "../../../../core/schemas/metric-schema";
import type { Metric } from "../../../../core/types/sdcpn";
import { LanguageClientContext } from "../../../../lsp/context";
import { compileMetric } from "../../../../simulation/compile-metric";
import { MutationContext } from "../../../../state/mutation-context";
import { SDCPNContext } from "../../../../state/sdcpn-context";
import {
  MetricFormBody,
  type MetricFormInstance,
  type MetricFormState,
  useMetricForm,
  useMetricLspSession,
} from "./metric-form";
import { summarizeMetricLspErrors } from "./metric-lsp";
import { buildMetricFromFormState } from "./metric-mapping";
import { ScenarioErrorDisplay } from "./scenario-error-display";

const bodyStyle = css({
  paddingY: "[0]",
});

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
      <ScenarioErrorDisplay count={totalErrorCount} firstMessage={firstError} />
      <Button
        variant="secondary"
        colorScheme="critical"
        size="sm"
        onClick={onDelete}
      >
        Delete
      </Button>
      <Button
        variant="secondary"
        colorScheme="neutral"
        size="sm"
        onClick={onClose}
      >
        Close
      </Button>
      <Button
        variant="primary"
        colorScheme="neutral"
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
  const { updateMetric, removeMetric } = use(MutationContext);

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
        // eslint-disable-next-line no-console
        console.error("Metric failed validation", result.error.issues);
        return;
      }
      updateMetric(metric.id, (draft) => {
        draft.name = result.data.name;
        draft.description = result.data.description;
        draft.code = result.data.code;
      });
      onClose();
    },
    { existingMetricNames },
  );

  // Compile-check the live code.
  const values = useStore(form.store, (state) => state.values);
  const compileOutcome =
    values.code.trim() === ""
      ? null
      : compileMetric({
          id: metric.id,
          name: values.name || metric.name,
          code: values.code,
        });
  const compileError =
    compileOutcome && !compileOutcome.ok ? compileOutcome.error : null;

  // Owned here (not in MetricFormBody) so the footer can scope its LSP
  // diagnostics summary to the same session.
  const metricSessionId = useMetricLspSession(values.code);

  const handleDelete = () => {
    removeMetric(metric.id);
    onClose();
  };

  return (
    <>
      <Drawer.Card onClose={onClose}>
        <Drawer.Header>{metric.name}</Drawer.Header>
        <Drawer.Body className={bodyStyle}>
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
