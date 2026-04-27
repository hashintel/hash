import { css } from "@hashintel/ds-helpers/css";
import { useForm, useStore } from "@tanstack/react-form";
import { use, useEffect, useRef, useState } from "react";

import { Input } from "../../../../components/input";
import { Section, SectionList } from "../../../../components/section";
import { LanguageClientContext } from "../../../../lsp/context";
import { CodeEditor } from "../../../../monaco/code-editor";
import { getMetricDocumentUri } from "../../../../monaco/editor-paths";

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

const textareaStyle = css({
  boxSizing: "border-box",
  width: "full",
  minHeight: "[80px]",
  padding: "[8px]",
  fontSize: "sm",
  fontWeight: "medium",
  fontFamily: "[inherit]",
  color: "neutral.fg.body",
  backgroundColor: "neutral.s00",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  outline: "none",
  resize: "vertical",
  transition: "[border-color 0.15s ease, box-shadow 0.15s ease]",
  _hover: {
    borderColor: "neutral.bd.subtle.hover",
  },
  _focus: {
    borderColor: "neutral.bd.subtle",
    boxShadow: "[0px 0px 0px 2px {colors.neutral.a25}]",
  },
  _placeholder: {
    color: "neutral.s80",
  },
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
 * that `compileMetric` would reject at runtime.
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
}

export interface MetricFormSubmitContext {
  /** Reset the form to its default values. */
  reset: () => void;
}

export function useMetricForm(
  defaultValues: MetricFormState,
  onSubmit: (values: MetricFormState, ctx: MetricFormSubmitContext) => void,
  options: UseMetricFormOptions = {},
) {
  const existingNames = options.existingMetricNames ?? new Set<string>();
  return useForm({
    defaultValues,
    onSubmit: ({ value, formApi }) =>
      onSubmit(value, {
        reset: () => formApi.reset(),
      }),
    validators: {
      onChange: ({ value }) =>
        validateMetricName(value.name, existingNames) ??
        validateMetricCode(value.code),
      onSubmit: ({ value }) =>
        validateMetricName(value.name, existingNames) ??
        validateMetricCode(value.code),
    },
  });
}

export type MetricFormInstance = ReturnType<typeof useMetricForm>;

// -- LSP session hook ---------------------------------------------------------

/**
 * Manages a temporary LSP session for metric body type-checking.
 * Generates a unique session ID, initializes on mount, updates on code changes,
 * and kills on unmount.
 */
export function useMetricLspSession(code: string): string {
  const { initializeMetricSession, updateMetricSession, killMetricSession } =
    use(LanguageClientContext);
  // useState (not useRef/useMemo) — needed for a stable per-mount value.
  // React Compiler doesn't replace useState; it only memoizes derived values.
  const [sessionId] = useState(() => crypto.randomUUID());
  const initializedRef = useRef(false);

  const sessionData = { sessionId, code };

  useEffect(() => {
    if (!initializedRef.current) {
      initializeMetricSession(sessionData);
      initializedRef.current = true;
    } else {
      updateMetricSession(sessionData);
    }
  }, [sessionData, initializeMetricSession, updateMetricSession]);

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

export const MetricFormSections = ({
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
          <Input
            id={`${idPrefix}metric-name`}
            size="md"
            value={state.name}
            onChange={(e) => callbacks.onNameChange(e.target.value)}
            hasError={nameHasError && state.name !== ""}
          />
        </div>

        <div className={fieldStyle}>
          <label
            className={labelStyle}
            htmlFor={`${idPrefix}metric-description`}
          >
            Description
          </label>
          <textarea
            id={`${idPrefix}metric-description`}
            className={textareaStyle}
            value={state.description}
            onChange={(e) => callbacks.onDescriptionChange(e.target.value)}
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
}

export const MetricFormBody = ({ form, idPrefix }: MetricFormBodyProps) => {
  const values = useStore(form.store, (state) => state.values);

  const metricSessionId = useMetricLspSession(values.code);

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
