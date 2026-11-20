import { useForm } from "@tanstack/react-form";

import type { Metric } from "@hashintel/petrinaut-core";

export interface MetricFormState {
  name: string;
  description: string;
  code: string;
}

export const emptyMetricFormState: MetricFormState = {
  name: "",
  description: "",
  code: "",
};

/** The metric the form describes, under the given id. */
export const buildMetricFromFormState = (
  state: MetricFormState,
  id: string,
): Metric => ({
  id,
  name: state.name.trim(),
  description: state.description.trim() || undefined,
  code: state.code,
});

const validateMetricName = (
  name: string,
  existingNames: ReadonlySet<string>,
): string | undefined => {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "Metric name is required.";
  }
  if (existingNames.has(trimmed)) {
    return `A metric named "${trimmed}" already exists. Choose a unique name.`;
  }
  return undefined;
};

/** Empty code could never compile to a runnable program. */
const validateMetricCode = (code: string): string | undefined =>
  code.trim() === "" ? "Metric code is required." : undefined;

export const useMetricForm = (
  defaultValues: MetricFormState,
  onSubmit: (
    values: MetricFormState,
    /** Puts the form back to its default values. */
    reset: () => void,
  ) => void,
  options: {
    /** Names the metric may not take: those of the other metrics. */
    existingMetricNames: ReadonlySet<string>;
    /** Compiles the submitted metric; editor diagnostics may lag a keystroke. */
    validateOnSubmit: (value: MetricFormState) => Promise<string | undefined>;
  },
) => {
  const validate = ({ value }: { value: MetricFormState }) =>
    validateMetricName(value.name, options.existingMetricNames) ??
    validateMetricCode(value.code);

  return useForm({
    defaultValues,
    onSubmit: ({ value, formApi }) => onSubmit(value, () => formApi.reset()),
    validators: {
      onChange: validate,
      onSubmit: validate,
      onSubmitAsync: async ({ value }) => await options.validateOnSubmit(value),
    },
  });
};

export type MetricFormInstance = ReturnType<typeof useMetricForm>;
