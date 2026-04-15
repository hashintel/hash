import { css } from "@hashintel/ds-helpers/css";
import { useStore } from "@tanstack/react-form";
import { use } from "react";

import { Button } from "../../../../components/button";
import { Drawer } from "../../../../components/drawer";
import { metricSchema } from "../../../../core/schemas/metric-schema";
import { compileMetric } from "../../../../simulation/compile-metric";
import { MutationContext } from "../../../../state/mutation-context";
import { SDCPNContext } from "../../../../state/sdcpn-context";
import {
  MetricFormBody,
  type MetricFormInstance,
  useMetricForm,
} from "./metric-form";
import { EMPTY_METRIC_FORM_STATE } from "./metric-form-defaults";
import { buildMetricFromFormState } from "./metric-mapping";
import { ScenarioErrorDisplay } from "./scenario-error-display";

const bodyStyle = css({
  overflowY: "auto",
  paddingX: "5",
  paddingY: "[0]",
  flex: "1",
});

// -- Footer -------------------------------------------------------------------

const CreateMetricFooter = ({
  form,
  compileError,
  onClose,
}: {
  form: MetricFormInstance;
  compileError: string | null;
  onClose: () => void;
}) => {
  const canSubmit = useStore(form.store, (state) => state.canSubmit);
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const isDefaultValue = useStore(form.store, (state) => state.isDefaultValue);
  const formErrors = useStore(form.store, (state) => state.errors);

  const formError = formErrors.find((e) => typeof e === "string") as
    | string
    | undefined;
  const firstError = formError ?? compileError ?? undefined;
  const hasErrors = !!firstError;
  const totalErrorCount = hasErrors ? 1 : 0;
  const canSave = canSubmit && !hasErrors && !isSubmitting && !isDefaultValue;

  return (
    <Drawer.Footer>
      <ScenarioErrorDisplay count={totalErrorCount} firstMessage={firstError} />
      <Button
        variant="secondary"
        colorScheme="neutral"
        size="sm"
        onClick={onClose}
      >
        Cancel
      </Button>
      <Button
        variant="primary"
        colorScheme="neutral"
        size="sm"
        disabled={!canSave}
        tooltip={
          formError ??
          compileError ??
          (isDefaultValue ? "Make changes to enable creation." : undefined)
        }
        onClick={() => {
          void form.handleSubmit();
        }}
      >
        Create
      </Button>
    </Drawer.Footer>
  );
};

// -- Drawer wrapper -----------------------------------------------------------

interface CreateMetricDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const CreateMetricDrawer = ({
  open,
  onClose,
}: CreateMetricDrawerProps) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { addMetric } = use(MutationContext);

  const existingMetricNames = new Set(
    (petriNetDefinition.metrics ?? []).map((m) => m.name),
  );

  const form = useMetricForm(
    EMPTY_METRIC_FORM_STATE,
    (value, ctx) => {
      const metric = buildMetricFromFormState(value, crypto.randomUUID());
      const result = metricSchema.safeParse(metric);
      if (!result.success) {
        // eslint-disable-next-line no-console
        console.error("Metric failed validation", result.error.issues);
        return;
      }
      addMetric(result.data);
      onClose();
      ctx.reset();
    },
    { existingMetricNames },
  );

  // Compile-check the code live so the user sees errors before submitting.
  const values = useStore(form.store, (state) => state.values);
  const compileOutcome =
    values.code.trim() === ""
      ? null
      : compileMetric({
          id: "__preview__",
          name: values.name || "metric",
          code: values.code,
        });
  const compileError =
    compileOutcome && !compileOutcome.ok ? compileOutcome.error : null;

  return (
    <Drawer.Root open={open} onClose={onClose}>
      <Drawer.Card onClose={onClose}>
        <Drawer.Header description="A function over the simulation state that returns a number to plot on the timeline.">
          Create a metric
        </Drawer.Header>
        <Drawer.Body className={bodyStyle}>
          <MetricFormBody form={form} idPrefix="create-" />
        </Drawer.Body>
      </Drawer.Card>
      <CreateMetricFooter
        form={form}
        compileError={compileError}
        onClose={onClose}
      />
    </Drawer.Root>
  );
};
