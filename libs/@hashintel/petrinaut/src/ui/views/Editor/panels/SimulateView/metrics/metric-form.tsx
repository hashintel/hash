import { useForm, useStore } from "@tanstack/react-form";
import { use, useEffect, useRef, useState } from "react";

import { TextArea, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { Section, SectionList } from "../../../../../components/section";
import { CodeEditor } from "../../../../../monaco/code-editor";
import { getMetricDocumentUri } from "../../../../../monaco/editor-paths";

// -- Styles -------------------------------------------------------------------

const fieldStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[6px]",
});

const labelStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
});

const hintStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
  lineHeight: "[1.4]",
});

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

interface MetricFormSectionsProps {
  state: MetricFormState;
  callbacks: MetricFormCallbacks;
  /** Unique prefix for element IDs to avoid collisions when multiple forms exist */
  idPrefix?: string;
  /** LSP session ID for metric body type-checking */
  metricSessionId?: string;
}

const MetricFormSections = ({
  state,
  callbacks,
  idPrefix = "",
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
        <div className={fieldStyle}>
          <label className={labelStyle} htmlFor={`${idPrefix}metric-name`}>
            Metric name
          </label>
          <TextInput
            htmlForId={`${idPrefix}metric-name`}
            size="sm"
            value={state.name}
            onChange={callbacks.onNameChange}
            invalid={nameHasError && state.name !== ""}
          />
        </div>

        <div className={fieldStyle}>
          <label
            className={labelStyle}
            htmlFor={`${idPrefix}metric-description`}
          >
            Description
          </label>
          <TextArea
            htmlForId={`${idPrefix}metric-description`}
            className={css({ minHeight: "[80px]" })}
            size="sm"
            value={state.description}
            onChange={callbacks.onDescriptionChange}
          />
        </div>
      </Section>

      {/* -- Code ----------------------------------------------------- */}
      <Section title="Code" collapsible defaultOpen>
        <span className={hintStyle}>
          Function body invoked with{" "}
          <code>state.places.&lt;Place&nbsp;Name&gt;</code> providing{" "}
          <code>count</code> and (for colored places) <code>tokens</code>. Must{" "}
          <code>return</code> a finite number.
        </span>
        <CodeEditor
          language="typescript"
          path={codeUri}
          value={state.code}
          onChange={(v) => callbacks.onCodeChange(v ?? "")}
          height="300px"
        />
      </Section>
    </SectionList>
  );
};

// -- Form body wired to a TanStack form instance ------------------------------

export interface MetricFormBodyProps {
  form: MetricFormInstance;
  /** Unique prefix for element IDs */
  idPrefix?: string;
  /**
   * LSP session ID for the metric body. Owned by the drawer parent so the
   * footer can scope its diagnostics summary to the same session.
   */
  metricSessionId: string;
}

export const MetricFormBody = ({
  form,
  idPrefix,
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
      idPrefix={idPrefix}
      metricSessionId={metricSessionId}
    />
  );
};
