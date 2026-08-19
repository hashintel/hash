import { useForm, useStore } from "@tanstack/react-form";
import { use, useEffect, useRef, useState } from "react";

import { Form, TextArea, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { Section, SectionList } from "../../../../../components/section";
import { CodeEditor } from "../../../../../monaco/code-editor";
import { getMetricDocumentUri } from "../../../../../monaco/editor-paths";

// -- Form state ---------------------------------------------------------------

export interface MetricFormState {
  name: string;
  description: string;
  code: string;
}

export interface MetricFormCallbacks {
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onCodeChange: (value: string) => void;
}

// -- Validation ---------------------------------------------------------------

function validateMetricName(
  name: string,
  existingNames: ReadonlySet<string>,
): string | undefined {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "Metric name is required.";
  }
  if (existingNames.has(trimmed)) {
    return `A metric named "${trimmed}" already exists. Choose a unique name.`;
  }
  return undefined;
}

/**
 * Reject empty/whitespace-only metric code so the form can't save a metric
 * that could never compile to a runnable program.
 */
function validateMetricCode(code: string): string | undefined {
  if (code.trim() === "") {
    return "Metric code is required.";
  }
  return undefined;
}

// -- TanStack Form integration -----------------------------------------------

export interface UseMetricFormOptions {
  /**
   * Names of other existing metrics. The form's `name` field must not match
   * any of these. When editing, the current metric's own name should be
   * excluded by the caller.
   */
  existingMetricNames?: ReadonlySet<string>;
  /** Exact submit-time HIR validation, independent of async editor diagnostics. */
  validateOnSubmit?: (value: MetricFormState) => Promise<string | undefined>;
}

export interface MetricFormSubmitContext {
  /** Reset the form to its default values. */
  reset: () => void;
}

export function useMetricForm(
  defaultValues: MetricFormState,
  onSubmit: (
    values: MetricFormState,
    ctx: MetricFormSubmitContext,
  ) => void | Promise<void>,
  options: UseMetricFormOptions = {},
) {
  const existingNames = options.existingMetricNames ?? new Set<string>();
  return useForm({
    defaultValues,
    onSubmit: async ({ value, formApi }) =>
      await onSubmit(value, {
        reset: () => formApi.reset(),
      }),
    validators: {
      onChange: ({ value }) =>
        validateMetricName(value.name, existingNames) ??
        validateMetricCode(value.code),
      onSubmit: ({ value }) =>
        validateMetricName(value.name, existingNames) ??
        validateMetricCode(value.code),
      onSubmitAsync: options.validateOnSubmit
        ? async ({ value }) => await options.validateOnSubmit!(value)
        : undefined,
    },
  });
}

export type MetricFormInstance = ReturnType<typeof useMetricForm>;

// -- LSP session hook ---------------------------------------------------------

/**
 * Manages a temporary LSP session for metric body type-checking.
 * Uses the caller-provided session ID, or generates one when omitted.
 * Initializes on mount, updates on code changes, and kills on unmount.
 */
export function useMetricLspSession(
  code: string,
  providedSessionId?: string,
): string {
  const { initializeMetricSession, updateMetricSession, killMetricSession } =
    use(LanguageClientContext);
  // useState (not useRef/useMemo) — needed for a stable per-mount value.
  // React Compiler doesn't replace useState; it only memoizes derived values.
  const [sessionId] = useState(() => providedSessionId ?? crypto.randomUUID());
  const initializedRef = useRef(false);

  useEffect(() => {
    const sessionData = { sessionId, code };

    if (!initializedRef.current) {
      initializeMetricSession(sessionData);
      initializedRef.current = true;
    } else {
      updateMetricSession(sessionData);
    }
  }, [code, initializeMetricSession, sessionId, updateMetricSession]);

  useEffect(() => {
    return () => {
      killMetricSession(sessionId);
    };
  }, [sessionId, killMetricSession]);

  return sessionId;
}

// -- Form sections ------------------------------------------------------------

// the compact pre-migration hint treatment for the code description
const codeFieldDescriptionStyle = css({
  '& [data-part="description"]': {
    fontSize: "xs",
    color: "neutral.s80",
    lineHeight: "[1.4]",
    marginBottom: "3",
  },
});

interface MetricFormSectionsProps {
  state: MetricFormState;
  callbacks: MetricFormCallbacks;
  /** LSP session ID for metric body type-checking */
  metricSessionId?: string;
}

const MetricFormSections = ({
  state,
  callbacks,
  metricSessionId,
}: MetricFormSectionsProps) => {
  const nameHasError = state.name.trim() === "";

  const codeUri = metricSessionId
    ? getMetricDocumentUri(metricSessionId)
    : undefined;

  return (
    <SectionList>
      {/* -- General -------------------------------------------------- */}
      <Section title="General" collapsible defaultOpen>
        <Form.Field
          label="Metric name"
          size="sm"
          errors={
            nameHasError && state.name !== ""
              ? ["Metric name is required."]
              : undefined
          }
        >
          <TextInput
            size="sm"
            value={state.name}
            onChange={callbacks.onNameChange}
            invalid={nameHasError && state.name !== ""}
          />
        </Form.Field>

        <Form.Field label="Description" size="sm">
          <TextArea
            className={css({ minHeight: "[80px]" })}
            size="sm"
            value={state.description}
            onChange={callbacks.onDescriptionChange}
          />
        </Form.Field>
      </Section>

      {/* -- Code ----------------------------------------------------- */}
      <Section title="Code" collapsible defaultOpen>
        <Form.Field
          label="Code"
          hideLabel
          size="sm"
          className={codeFieldDescriptionStyle}
          description={
            <>
              Function body invoked with{" "}
              <code>state.places.&lt;Place&nbsp;Name&gt;</code> providing{" "}
              <code>count</code> and (for colored places) <code>tokens</code>.
              Must <code>return</code> a finite number.
            </>
          }
        >
          <CodeEditor
            language="typescript"
            path={codeUri}
            value={state.code}
            onChange={(v) => callbacks.onCodeChange(v ?? "")}
            height="300px"
          />
        </Form.Field>
      </Section>
    </SectionList>
  );
};

// -- Form body wired to a TanStack form instance ------------------------------

export interface MetricFormBodyProps {
  form: MetricFormInstance;
  /**
   * LSP session ID for the metric body. Owned by the drawer parent so the
   * footer can scope its diagnostics summary to the same session.
   */
  metricSessionId: string;
}

export const MetricFormBody = ({
  form,
  metricSessionId,
}: MetricFormBodyProps) => {
  const values = useStore(form.store, (state) => state.values);

  return (
    <MetricFormSections
      state={values}
      callbacks={{
        onNameChange: (value) => form.setFieldValue("name", value),
        onDescriptionChange: (value) =>
          form.setFieldValue("description", value),
        onCodeChange: (value) => form.setFieldValue("code", value),
      }}
      metricSessionId={metricSessionId}
    />
  );
};
